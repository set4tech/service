"""
This script scrapes the ICC website for the California Building Code and saves the sections and subsections to a JSON file.
The actual html is from s3, we download that manually.
python scripts/icc_cbc.py --state CA --version 2025
"""

import re
import boto3
from abc import ABC, abstractmethod
from bs4 import BeautifulSoup
import argparse
from enum import Enum
import logging
import os
import json
import requests
from urllib.parse import urljoin

from s3 import RawICCS3, BUCKET_NAME
from schema import Code, Section, Subsection, TableBlock


# California patterns
# section number is like 11B-229, 1102A, or 1001 (Chapter 10)
# Uses negative lookahead (?!\.\d) to prevent matching subsections like 11B-228.3 or 1001.1
CA_SECTION_REGEX = r"(?:11[AB]-\d{3,4}|\d{4}A|10\d{2})(?!\.\d)"
# subsection number is like 11B-101.1, 1102A.3, or 1001.1 (Chapter 10)
CA_SUBSECTION_REGEX = r"(?:11[AB]-\d{3,4}|\d{4}A|10\d{2})(?:\.\d+)+"

# NYC patterns
# section number is like 1101, 1104 (4 digits without dots)
NYC_SECTION_REGEX = r"\d{4}(?!\.\d)"
# subsection number is like 1101.1, 1104.2.3.1 (4 digits + dot + digits)
NYC_SUBSECTION_REGEX = r"\d{4}(?:\.\d+)+"

# Mapping of state to regex patterns
REGEX_PATTERNS = {
    "CA": {
        "section": CA_SECTION_REGEX,
        "subsection": CA_SUBSECTION_REGEX,
    },
    "NY": {
        "section": NYC_SECTION_REGEX,
        "subsection": NYC_SUBSECTION_REGEX,
    },
}


def find_section_links(text: str, state: str = "CA") -> list[str]:
    """In each text para, there are links of the form
    'Section 11B-106.5'. Identify them and return a list of strings.

    """
    pattern = REGEX_PATTERNS[state]["section"]
    url_re = re.compile(pattern)
    return url_re.findall(text)


def find_subsection_links(text: str, state: str = "CA") -> list[str]:
    """In each text para, there are links of the form
    'Section 11B-106.5'. Identify them and return a list of strings.

    """
    pattern = REGEX_PATTERNS[state]["subsection"]
    url_re = re.compile(pattern)
    return url_re.findall(text)


def extract_table_data(table_element) -> TableBlock:
    """Extract table data from a <table> element and convert to CSV format."""
    rows = []

    # Extract table rows
    for row in table_element.find_all("tr"):
        cells = []
        for cell in row.find_all(["td", "th"]):
            # Clean cell text and handle merged cells
            cell_text = cell.get_text().strip().replace("\n", " ").replace("\r", "")
            cells.append(cell_text)
        if cells:  # Only add non-empty rows
            rows.append(cells)

    # Convert to CSV format
    csv_content = "\n".join([",".join([f'"{cell}"' for cell in row]) for row in rows])

    return csv_content


def extract_figure_url(figure_element, base_url: str) -> str:
    """Extract the image URL from a figure element."""
    img_element = figure_element.find("img")
    if img_element and img_element.get("src"):
        img_src = img_element.get("src")
        # Convert relative URL to absolute URL
        if img_src.startswith("./"):
            # Remove the leading './' and join with base URL
            img_src = img_src[2:]
            return urljoin(base_url, img_src)
        elif img_src.startswith("http"):
            return img_src
        else:
            return urljoin(base_url, img_src)
    return ""


def upload_image_to_s3(
    image_url: str, s3_key: str, s3_bucket: str = "set4-codes"
) -> bool:
    """Download image from URL and upload to S3."""
    try:
        # Download the image
        response = requests.get(image_url, timeout=30)
        response.raise_for_status()

        # Upload to S3
        s3 = boto3.client("s3")
        s3.put_object(
            Bucket=s3_bucket,
            Key=s3_key,
            Body=response.content,
            ContentType="image/jpeg",  # Assume JPEG for ICC images
        )

        logger.info(f"Uploaded image to S3: s3://{s3_bucket}/{s3_key}")
        return True
    except Exception as e:
        logger.warning(f"Failed to upload image {image_url} to S3: {e}")
        return False


def extract_tables_and_figures(
    soup: BeautifulSoup,
    extract_images: bool = True,
    debug: bool = False,
    test_mode: bool = False,
) -> tuple[list, list]:
    """Extract tables and figures from the HTML soup."""
    tables = []
    figures = []

    base_url = "https://codes.iccsafe.org/content/CABC2025P1/"

    # Extract figures
    figure_elements = soup.find_all("figure")
    logger.info(f"Found {len(figure_elements)} figure elements")

    # In test mode, only process first 3 figures to avoid errors
    figure_elements_to_process = figure_elements[:3] if test_mode else figure_elements

    for fig_elem in figure_elements_to_process:
        fig_class = fig_elem.get("class", [])
        fig_id = fig_elem.get("id", "")

        # Get caption
        caption_elem = fig_elem.find("figcaption")
        caption = caption_elem.get_text().strip() if caption_elem else ""

        # Extract figure/table number from caption or ID
        fig_number = ""
        if caption:
            # Try to extract number from caption like "FIGURE 11B-104" or "TABLE 11B-208.2"
            fig_match = re.search(
                r"(?:FIGURE|TABLE)\s+([0-9A-B\-\.]+)", caption, re.IGNORECASE
            )
            if fig_match:
                fig_number = fig_match.group(1)

        if not fig_number and fig_id:
            # Try to extract from ID like "CABC2025P1_Ch11B_SubCh01_Sec11B_104_Fig11B-104"
            id_match = re.search(r"(?:Fig|Tbl)([0-9A-B\-\.]+)", fig_id)
            if id_match:
                fig_number = id_match.group(1).replace("_", "-")

        if debug:
            logger.debug(
                f"Processing figure: ID={fig_id}, Class={fig_class}, Number={fig_number}"
            )

        if "table" in fig_class:
            # This is a table
            table_elem = fig_elem.find("table")
            if table_elem and fig_number:
                csv_data = extract_table_data(table_elem)
                table_block = TableBlock(number=fig_number, title=caption, csv=csv_data)
                tables.append(table_block)
                if debug:
                    logger.debug(f"Extracted table {fig_number}: {caption[:50]}...")

        elif "figure" in fig_class:
            # This is a figure with an image
            img_url = extract_figure_url(fig_elem, base_url)
            if img_url and fig_number:
                s3_url = ""
                if extract_images:
                    # Upload to S3
                    s3_key = f"cleaned/ICC/CA/2025/figures/{fig_number}.jpg"
                    if upload_image_to_s3(img_url, s3_key):
                        s3_url = f"https://set4-codes.s3.amazonaws.com/{s3_key}"

                if s3_url or not extract_images:
                    # Use S3 URL if uploaded, otherwise use original URL for reference
                    figure_url = s3_url if s3_url else img_url
                    figures.append(
                        {
                            "number": fig_number,
                            "caption": caption,
                            "url": figure_url,
                            "uploaded": bool(s3_url),
                            "type": "figure",  # Mark as figure to distinguish from tables
                        }
                    )
                    if debug:
                        logger.debug(
                            f"Extracted figure {fig_number}: {caption[:50]}..."
                        )

    logger.info(f"Extracted {len(tables)} tables and {len(figures)} figures")
    return tables, figures


logging.basicConfig(
    level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s"
)
logger = logging.getLogger(__name__)

ENV = os.getenv("ENV", "development")
REGION = "us-east-2" if ENV == "prod" else "us-east-1"


class State(Enum):
    california = "CA"
    new_york = "NY"


class HTMLProcessor(ABC):
    @abstractmethod
    def process(self, html: str) -> str:
        ...


def generate_nyc_url(section_number: str) -> str:
    """Generate NYC building code URL with proper section anchors."""
    base_url = "https://codes.iccsafe.org/content/NYCBC2022P1"
    if not section_number:
        return base_url

    section_clean = section_number.replace("Section ", "").strip()
    # NYC sections are like 1101, 1104, 1101.1, etc.
    # Anchor format: NYCBC2022P1_Ch11_Sec1101
    main_section = section_clean.split(".")[0] if "." in section_clean else section_clean
    anchor = f"NYCBC2022P1_Ch11_Sec{section_clean.replace('.', '_')}"
    return f"{base_url}/chapter-11-accessibility#{anchor}"


def generate_california_url(section_number: str) -> str:
    """Generate California building code URL with proper section anchors."""
    base_url = "https://codes.iccsafe.org/content/CABC2025P1"
    if not section_number:
        return base_url

    section_clean = section_number.replace("Section ", "").strip()

    # Handle Chapter 10 sections (e.g., 1001, 1002)
    if re.match(r'10\d{2}', section_clean):
        anchor = f"CABC2025P1_Ch10_Sec{section_clean}"
        return f"{base_url}/chapter-10-means-of-egress#{anchor}"

    # Handle 11A sections with XXXXXA format (e.g., 1102A)
    if re.match(r'\d{4}A', section_clean):
        # Chapter 11A uses format like 1102A, 1103A
        anchor = f"CABC2025P1_Ch11A_Sec{section_clean}"
        return f"{base_url}/chapter-11a-housing-accessibility#{anchor}"

    # Handle 11B sections with 11B-XXX format
    if section_clean.startswith("11B-") or section_clean.startswith("11A-"):
        section_part = section_clean[4:]
        main_section = (
            section_part.split(".")[0] if "." in section_part else section_part
        )

        try:
            section_num = int(main_section)
            if section_num <= 202:
                subchapter = "SubCh01"
            elif section_num <= 299:
                subchapter = "SubCh02"
            elif section_num <= 309:
                subchapter = "SubCh03"
            elif section_num <= 409:
                subchapter = "SubCh04"
            elif section_num <= 510:
                subchapter = "SubCh05"
            elif section_num <= 610:
                subchapter = "SubCh06"
            elif section_num <= 710:
                subchapter = "SubCh07"
            elif section_num <= 810:
                subchapter = "SubCh08"
            elif section_num <= 999:
                subchapter = "SubCh09"
            elif section_num <= 1010:
                subchapter = "SubCh10"
            else:
                subchapter = "SubCh11"
        except ValueError:
            subchapter = "SubCh02"

        anchor_section = section_clean.replace("-", "_")
        anchor = f"CABC2025P1_Ch11B_{subchapter}_Sec{anchor_section}"
        chapter_part = "11a" if section_clean.startswith("11A-") else "11b"
        if chapter_part == "11b":
            return f"{base_url}/chapter-11b-accessibility-to-public-buildings-public-accommodations-commercial-buildings-and-public-housing#{anchor}"
        else:
            return f"{base_url}/chapter-11a-housing-accessibility#{anchor.replace('11B', '11A')}"

    return base_url


def generate_section_url(section_number: str, state: str) -> str:
    """Generate section URL based on state."""
    if state == "CA":
        return generate_california_url(section_number)
    elif state == "NY":
        return generate_nyc_url(section_number)
    else:
        return ""


def main(args):
    test_mode_str = " (TEST MODE)" if getattr(args, "test", False) else ""
    dry_run_str = " (DRY RUN - no S3 upload)" if getattr(args, "dry_run", False) else ""
    logger.info(f"Starting ICC scraper for {args.state} {args.version}{test_mode_str}{dry_run_str}")

    # State-specific chapter configuration
    if args.state == "CA":
        chapter_to_key = {
            "10": "CHAPTER 10 MEANS OF EGRESS - 2025 CALIFORNIA BUILDING CODE VOLUMES 1 AND 2, TITLE 24, PART 2.html",
            "11a": "CHAPTER 11A HOUSING ACCESSIBILITY - 2025 CALIFORNIA BUILDING CODE VOLUMES 1 AND 2, TITLE 24, PART 2.html",
            "11b": "Chapter 11b Accessibility To Public Buildings Public Accommodations Commercial Buildings And Public Housing - California Building Code Volumes 1 and 2, Title 24, Part 2.html",
        }
        chapters = ["10", "11a", "11b"]
    elif args.state == "NY":
        chapter_to_key = {
            "11": "CHAPTER 11 ACCESSIBILITY - 2022 NEW YORK CITY BUILDING CODE.html",
        }
        chapters = ["11"]
    else:
        raise ValueError(f"Unsupported state: {args.state}")

    raw_code_s3 = RawICCS3(args.state, args.version, chapter_to_key)

    # Use dictionaries for deduplication
    sections_dict = {}
    all_tables = []
    all_figures = []

    # Process chapters
    for chapter in chapters:
        logger.info(f"Processing chapter {chapter}")
        html = raw_code_s3.chapter(chapter)
        soup = BeautifulSoup(html, "html.parser")

        # Extract tables and figures
        chapter_tables, chapter_figures = extract_tables_and_figures(
            soup,
            extract_images=getattr(args, "extract_images", True),
            debug=getattr(args, "debug", False),
            test_mode=getattr(args, "test", False),
        )
        all_tables.extend(chapter_tables)
        all_figures.extend(chapter_figures)

        # Debug: Check what section elements exist
        all_sections = soup.find_all("section")
        logger.info(
            f"Found {len(all_sections)} total section elements in chapter {chapter}"
        )

        level1_sections = soup.find_all("section", class_=re.compile(r"level\d"))
        logger.info(f"Found {len(level1_sections)} level sections in chapter {chapter}")

        # In test mode, only process first 2 sections to avoid errors
        level1_sections_to_process = (
            level1_sections[:2] if getattr(args, "test", False) else level1_sections
        )

        for level1 in level1_sections_to_process:
            section_header_element = level1.find("div", class_="section-action-wrapper")
            if not section_header_element:
                logger.warning("No section-action-wrapper found, skipping")
                continue

            section_header_text = section_header_element.get_text()
            section_number_list = find_section_links(section_header_text, args.state)

            if len(section_number_list) != 1:
                logger.warning(
                    f"Expected 1 section number, got {len(section_number_list)} in: {section_header_text}"
                )
                continue

            section_number = section_number_list[0].strip()

            # Extract title from the header element - look for title spans
            title_element = level1.find("span", class_=re.compile(r"level\d_title"))
            if title_element:
                section_title = title_element.get_text().strip()
            elif "—" in section_header_text:
                section_title = section_header_text.split("—")[1].strip()
            else:
                # Fallback: use the text after the section number
                section_title = section_header_text.replace(section_number, "").strip()
                # Clean up any subsection numbers that leaked in
                section_title = re.sub(r"^\d+\.\d+\s*", "", section_title)
                section_title = re.sub(r"^\.?\d+\s*", "", section_title)

            logger.info(
                f"Section number: {section_number}, Section title: {section_title}"
            )

            # Use dictionary to automatically handle duplicates - last one wins
            sections_dict[section_number] = Section(
                key=section_number,
                number=section_number,
                title=section_title,
                subsections=[],
                source_url=generate_section_url(section_number, args.state),
                figures=[],  # Initialize figures list
            )

    # Use dictionary for subsections too
    subsections_dict = {}
    # it can be level1, level2 or level2_title
    pattern = re.compile(r"level\d|level\d_title")

    # Process subsections from all chapters
    for chapter in chapters:
        html = raw_code_s3.chapter(chapter)
        soup = BeautifulSoup(html, "html.parser")

        subsection_elements = soup.find_all("section", class_=pattern)
        # In test mode, only process first 5 subsections to avoid errors
        subsection_elements_to_process = (
            subsection_elements[:5]
            if getattr(args, "test", False)
            else subsection_elements
        )

        for subsection in subsection_elements_to_process:
            try:
                subsection_header_text = subsection.find(
                    "h1", class_=pattern
                ).get_text()
            except AttributeError:
                subsection_header_text = subsection.find(
                    "span", class_=pattern
                ).get_text()
            subsection_number_list = find_subsection_links(subsection_header_text, args.state)
            if not len(subsection_number_list) == 1:
                logger.warning(
                    f"Expected subsection number, got {subsection_number_list}"
                )
                continue
            subsection_number = subsection_number_list[0].strip()

            if not (
                subsection_title_element := subsection.find("span", class_=pattern)
            ):
                logger.warning(f"Expected subsection title, got {subsection}")
                continue
            subsection_title = subsection_title_element.get_text()
            logger.info(
                f"Subsection number: {subsection_number}, Subsection title: {subsection_title}"
            )
            links = []
            paras = []
            for para in subsection.find_all("p"):
                paras.append(para.get_text())
                links.extend(find_subsection_links(para.get_text(), args.state))
                links.extend(find_section_links(para.get_text(), args.state))

            # Use dictionary - last one wins
            subsections_dict[subsection_number] = Subsection(
                key=subsection_number,
                number=subsection_number,
                title=subsection_title,
                paragraphs=paras,
                refers_to=links,
                tables=[],  # Initialize tables list
                figures=[],  # Initialize figures list
            )

    # Convert dictionaries to lists
    processed_sections = list(sections_dict.values())
    processed_subsections = list(subsections_dict.values())

    # Attach subsections to sections - match based on section being prefix of subsection
    for section in processed_sections:
        for subsection in processed_subsections:
            # Check if subsection belongs to this section (e.g., 11B-101.1 belongs to 11B-101)
            if subsection.number.startswith(section.number + "."):
                section.subsections.append(subsection)

    # Attach tables and figures to appropriate sections/subsections
    logger.info(
        f"Attaching {len(all_tables)} tables and {len(all_figures)} figures to sections"
    )

    for table in all_tables:
        attached = False
        table_number = table.number

        # Try to find exact subsection match first
        for section in processed_sections:
            for subsection in section.subsections:
                if subsection.number == table_number:
                    subsection.tables.append(table)
                    attached = True
                    logger.debug(
                        f"Attached table {table_number} to subsection {subsection.number}"
                    )
                    break
            if attached:
                break

        if not attached:
            # Try to find parent section match
            main_section_num = (
                table_number.split(".")[0] if "." in table_number else table_number
            )
            for section in processed_sections:
                if section.number == main_section_num:
                    # Add table as a section-level figure reference
                    section.figures.append(f"table:{table_number}")
                    attached = True
                    logger.debug(
                        f"Attached table {table_number} to section {section.number}"
                    )
                    break

        if not attached:
            logger.warning(f"Could not attach table {table_number} to any section")

    for figure in all_figures:
        attached = False
        fig_number = figure["number"]
        fig_url = figure["url"]
        fig_type = figure.get("type", "figure")  # Get type to distinguish from tables

        # Create a prefixed URL to distinguish figure types when they have same numbers
        prefixed_url = f"{fig_type}:{fig_url}" if fig_type == "figure" else fig_url

        # Try to find exact subsection match first
        for section in processed_sections:
            for subsection in section.subsections:
                if subsection.number == fig_number:
                    subsection.figures.append(prefixed_url)
                    attached = True
                    logger.debug(
                        f"Attached {fig_type} {fig_number} to subsection {subsection.number}"
                    )
                    break
            if attached:
                break

        if not attached:
            # Try to find exact section match
            for section in processed_sections:
                if section.number == fig_number:
                    section.figures.append(prefixed_url)
                    attached = True
                    logger.debug(
                        f"Attached {fig_type} {fig_number} to section {section.number}"
                    )
                    break

        if not attached:
            # Try to find parent section match (e.g., 11B-304.3.2 -> 11B-304)
            main_section_num = (
                fig_number.split(".")[0] if "." in fig_number else fig_number
            )
            for section in processed_sections:
                if section.number == main_section_num:
                    section.figures.append(prefixed_url)
                    attached = True
                    logger.debug(
                        f"Attached {fig_type} {fig_number} to parent section {section.number}"
                    )
                    break

        if not attached:
            # Try to find best matching subsection (most specific match)
            best_match = None
            best_match_subsection = None

            for section in processed_sections:
                for subsection in section.subsections:
                    # Check if subsection number is a prefix of figure number
                    if fig_number.startswith(subsection.number + "."):
                        if not best_match or len(subsection.number) > len(best_match):
                            best_match = subsection.number
                            best_match_subsection = subsection

            if best_match:
                best_match_subsection.figures.append(prefixed_url)
                attached = True
                logger.debug(
                    f"Attached {fig_type} {fig_number} to best matching subsection {best_match}"
                )

        if not attached:
            logger.warning(f"Could not attach {fig_type} {fig_number} to any section")

    # Create Code object with all sections
    if args.state == "CA":
        source_id = "CBC_Chapter10_11A_11B"
        title = "California Building Code - Chapters 10 (Means of Egress), 11A & 11B (Accessibility)"
        source_url = "https://codes.iccsafe.org/content/CABC2025P1"
    elif args.state == "NY":
        source_id = "NYCBC_Chapter11"
        title = "New York City Building Code - Chapter 11 Accessibility"
        source_url = "https://codes.iccsafe.org/content/NYCBC2022P1"
    else:
        source_id = f"{args.state}_Code"
        title = f"{args.state} Building Code"
        source_url = ""

    code = Code(
        provider="ICC",
        version=args.version,
        jurisdiction=args.state,
        source_id=source_id,
        title=title,
        source_url=source_url,
        sections=processed_sections,
    )

    # dump the Code object to json
    # Use state-specific code abbreviations
    code_prefix = "cbc" if args.state == "CA" else f"ibc_{args.state.lower()}"
    output_filename = f"{code_prefix}_{args.version}.json"
    with open(output_filename, "w") as f:
        json.dump(code.model_dump(), f, indent=2)

    # upload to s3
    if not getattr(args, "dry_run", False):
        s3 = boto3.resource("s3")
        s3_key = f"cleaned/{args.state}/{args.version}/{output_filename}"
        s3.Bucket(BUCKET_NAME).upload_file(output_filename, s3_key)
        logger.info(f"Uploaded to S3: {s3_key}")
    else:
        logger.info("Dry run mode - skipping S3 upload")

    logger.info(f"Extracted {len(processed_sections)} sections")
    logger.info(f"Extracted {len(all_tables)} tables and {len(all_figures)} figures")

    # Summary statistics
    total_subsection_tables = sum(
        len(sub.tables) for section in processed_sections for sub in section.subsections
    )
    total_section_figures = sum(len(section.figures) for section in processed_sections)
    total_subsection_figures = sum(
        len(sub.figures)
        for section in processed_sections
        for sub in section.subsections
    )

    logger.info(f"Attached tables: {total_subsection_tables} to subsections")
    logger.info(
        f"Attached figures: {total_section_figures} to sections, {total_subsection_figures} to subsections"
    )

    logger.info(f"Finished CBC scraper for {args.state} {args.version}")
    logger.info(f"Output saved to {output_filename}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--state", type=str, default=State.california.value
    )  # pass a string
    parser.add_argument("--version", type=int, default=2025)
    parser.add_argument(
        "--extract-images",
        action="store_true",
        default=True,
        help="Extract and upload figure images to S3",
    )
    parser.add_argument(
        "--debug",
        action="store_true",
        help="Enable debug logging for table/figure extraction",
    )
    parser.add_argument(
        "--test",
        action="store_true",
        help="Test mode - process only first few elements to avoid errors",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Dry run - process and save JSON locally but don't upload to S3",
    )
    args = parser.parse_args()
    main(args)
