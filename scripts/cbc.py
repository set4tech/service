"""
Scrape California Building Code from ICC website and save to JSON.
Download HTML manually from S3 first.

Usage: python scripts/icc_cbc.py --version 2025
"""

import re
import boto3
from bs4 import BeautifulSoup
import argparse
import logging
import json
import requests
from urllib.parse import urljoin

from s3 import RawICCS3, BUCKET_NAME
from schema import Code, Section, Subsection, TableBlock

# California section patterns
SECTION_REGEX = r"(?:11[AB]-\d{3,4}|\d{4}A|10\d{2})(?!\.\d)"
SUBSECTION_REGEX = r"(?:11[AB]-\d{3,4}|\d{4}A|10\d{2})(?:\.\d+)+"

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s"
)
logger = logging.getLogger(__name__)

CHAPTER_FILES = {
    "10": "CHAPTER 10 MEANS OF EGRESS - 2025 CALIFORNIA BUILDING CODE VOLUMES 1 AND 2, TITLE 24, PART 2.html",
    "11a": "CHAPTER 11A HOUSING ACCESSIBILITY - 2025 CALIFORNIA BUILDING CODE VOLUMES 1 AND 2, TITLE 24, PART 2.html",
    "11b": "Chapter 11b Accessibility To Public Buildings Public Accommodations Commercial Buildings And Public Housing - California Building Code Volumes 1 and 2, Title 24, Part 2.html",
}


def find_section_numbers(text: str) -> list[str]:
    """Extract section numbers from text."""
    return re.findall(SECTION_REGEX, text)


def find_subsection_numbers(text: str) -> list[str]:
    """Extract subsection numbers from text."""
    return re.findall(SUBSECTION_REGEX, text)


def generate_section_url(section_number: str) -> str:
    """Generate California building code URL with proper section anchors."""
    base_url = "https://codes.iccsafe.org/content/CABC2025P1"
    
    if not section_number:
        return base_url

    # Chapter 10 sections (e.g., 1001, 1002)
    if re.match(r'10\d{2}', section_number):
        anchor = f"CABC2025P1_Ch10_Sec{section_number}"
        return f"{base_url}/chapter-10-means-of-egress#{anchor}"

    # Chapter 11A sections (e.g., 1102A, 1103A)
    if re.match(r'\d{4}A', section_number):
        anchor = f"CABC2025P1_Ch11A_Sec{section_number}"
        return f"{base_url}/chapter-11a-housing-accessibility#{anchor}"

    # Chapter 11B sections (e.g., 11B-104, 11B-304.3)
    if section_number.startswith("11B-"):
        section_part = section_number[4:]
        main_section = section_part.split(".")[0] if "." in section_part else section_part

        # Determine subchapter from section number
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

        anchor_section = section_number.replace("-", "_")
        anchor = f"CABC2025P1_Ch11B_{subchapter}_Sec{anchor_section}"
        return f"{base_url}/chapter-11b-accessibility-to-public-buildings-public-accommodations-commercial-buildings-and-public-housing#{anchor}"

    return base_url


def extract_table_data(table_element) -> str:
    """Extract table data and convert to CSV format."""
    rows = []
    for row in table_element.find_all("tr"):
        cells = []
        for cell in row.find_all(["td", "th"]):
            cell_text = cell.get_text().strip().replace("\n", " ").replace("\r", "")
            cells.append(cell_text)
        if cells:
            rows.append(cells)
    
    return "\n".join([",".join([f'"{cell}"' for cell in row]) for row in rows])


def extract_figure_url(figure_element, base_url: str) -> str:
    """Extract image URL from a figure element."""
    img_element = figure_element.find("img")
    if img_element and img_element.get("src"):
        img_src = img_element.get("src")
        if img_src.startswith("./"):
            img_src = img_src[2:]
        return urljoin(base_url, img_src) if not img_src.startswith("http") else img_src
    return ""


def upload_image_to_s3(image_url: str, s3_key: str, s3_bucket: str = "set4-codes") -> str:
    """Download image from URL and upload to S3. Returns S3 URL or empty string."""
    try:
        response = requests.get(image_url, timeout=30)
        response.raise_for_status()
        
        s3 = boto3.client("s3")
        s3.put_object(
            Bucket=s3_bucket,
            Key=s3_key,
            Body=response.content,
            ContentType="image/jpeg",
        )
        
        logger.info(f"Uploaded image to S3: s3://{s3_bucket}/{s3_key}")
        return f"https://{s3_bucket}.s3.amazonaws.com/{s3_key}"
    except Exception as e:
        logger.warning(f"Failed to upload image {image_url}: {e}")
        return ""


def extract_tables_and_figures(soup: BeautifulSoup, extract_images: bool, test_mode: bool) -> tuple[list, list]:
    """Extract tables and figures from HTML."""
    tables = []
    figures = []
    base_url = "https://codes.iccsafe.org/content/CABC2025P1/"
    
    figure_elements = soup.find_all("figure")
    logger.info(f"Found {len(figure_elements)} figure elements")
    
    if test_mode:
        figure_elements = figure_elements[:3]
    
    for fig_elem in figure_elements:
        fig_class = fig_elem.get("class", [])
        fig_id = fig_elem.get("id", "")
        
        caption_elem = fig_elem.find("figcaption")
        caption = caption_elem.get_text().strip() if caption_elem else ""
        
        # Extract figure/table number
        fig_number = ""
        if caption:
            fig_match = re.search(r"(?:FIGURE|TABLE)\s+([0-9A-B\-\.]+)", caption, re.IGNORECASE)
            if fig_match:
                fig_number = fig_match.group(1)
        
        if not fig_number and fig_id:
            id_match = re.search(r"(?:Fig|Tbl)([0-9A-B\-\.]+)", fig_id)
            if id_match:
                fig_number = id_match.group(1).replace("_", "-")
        
        if not fig_number:
            continue
        
        if "table" in fig_class:
            table_elem = fig_elem.find("table")
            if table_elem:
                csv_data = extract_table_data(table_elem)
                tables.append(TableBlock(number=fig_number, title=caption, csv=csv_data))
        
        elif "figure" in fig_class:
            img_url = extract_figure_url(fig_elem, base_url)
            if img_url:
                s3_url = ""
                if extract_images:
                    s3_key = f"cleaned/ICC/CA/2025/figures/{fig_number}.jpg"
                    s3_url = upload_image_to_s3(img_url, s3_key)
                
                figures.append({
                    "number": fig_number,
                    "caption": caption,
                    "url": s3_url if s3_url else img_url,
                    "uploaded": bool(s3_url),
                    "type": "figure",
                })
    
    logger.info(f"Extracted {len(tables)} tables and {len(figures)} figures")
    return tables, figures


def extract_title(header_text: str, number: str) -> str:
    """Extract title from header text after the number."""
    # Try to find title with separator
    for separator in ["—", "–"]:
        if separator in header_text:
            parts = header_text.split(separator)
            if len(parts) >= 2:
                return parts[1].strip()
    
    # Fallback: remove number and clean up
    title = header_text.replace(number, "").strip()
    title = re.sub(r"^\d+\.\d+\s*", "", title)
    title = re.sub(r"^\.?\d+\s*", "", title)
    return title


def extract_sections(soup: BeautifulSoup, test_mode: bool) -> dict[str, Section]:
    """Extract all sections from the soup."""
    sections = {}
    level_sections = soup.find_all("section", class_=re.compile(r"level\d"))
    
    if test_mode:
        level_sections = level_sections[:2]
    
    for level_section in level_sections:
        header_elem = level_section.find("div", class_="section-action-wrapper")
        if not header_elem:
            continue
        
        header_text = header_elem.get_text()
        section_numbers = find_section_numbers(header_text)
        
        if len(section_numbers) != 1:
            continue
        
        section_number = section_numbers[0].strip()
        
        # Extract title
        title_elem = level_section.find("span", class_=re.compile(r"level\d_title"))
        if title_elem:
            section_title = title_elem.get_text().strip()
        else:
            section_title = extract_title(header_text, section_number)
        
        logger.info(f"Section: {section_number} - {section_title}")
        
        sections[section_number] = Section(
            key=section_number,
            number=section_number,
            title=section_title,
            subsections=[],
            source_url=generate_section_url(section_number),
            figures=[],
        )
    
    return sections


def extract_subsections(soup: BeautifulSoup, test_mode: bool) -> dict[str, Subsection]:
    """Extract all subsections from the soup."""
    subsections = {}
    pattern = re.compile(r"level\d|level\d_title")
    subsection_elements = soup.find_all("section", class_=pattern)
    
    if test_mode:
        subsection_elements = subsection_elements[:5]
    
    for subsection_elem in subsection_elements:
        # Find header
        header_elem = subsection_elem.find("h1", class_=pattern)
        if not header_elem:
            header_elem = subsection_elem.find("span", class_=pattern)
        if not header_elem:
            continue
        
        header_text = header_elem.get_text()
        subsection_numbers = find_subsection_numbers(header_text)
        
        if len(subsection_numbers) != 1:
            continue
        
        subsection_number = subsection_numbers[0].strip()
        
        # Extract title - use fallback if span not found
        title_elem = subsection_elem.find("span", class_=pattern)
        if title_elem:
            subsection_title = title_elem.get_text().strip()
        else:
            subsection_title = extract_title(header_text, subsection_number)
        
        # Extract paragraphs and links
        paragraphs = []
        links = []
        for para in subsection_elem.find_all("p"):
            para_text = para.get_text()
            paragraphs.append(para_text)
            links.extend(find_subsection_numbers(para_text))
            links.extend(find_section_numbers(para_text))
        
        logger.info(f"Subsection: {subsection_number} - {subsection_title}")
        
        subsections[subsection_number] = Subsection(
            key=subsection_number,
            number=subsection_number,
            title=subsection_title,
            paragraphs=paragraphs,
            refers_to=links,
            tables=[],
            figures=[],
        )
    
    return subsections


def attach_subsections_to_sections(sections: dict[str, Section], subsections: dict[str, Subsection]):
    """Attach subsections to their parent sections."""
    for section in sections.values():
        for subsection in subsections.values():
            if subsection.number.startswith(section.number + "."):
                section.subsections.append(subsection)


def attach_tables(tables: list[TableBlock], sections: dict[str, Section]):
    """Attach tables to sections and subsections."""
    for table in tables:
        table_number = table.number
        attached = False
        
        # Try exact subsection match
        for section in sections.values():
            for subsection in section.subsections:
                if subsection.number == table_number:
                    subsection.tables.append(table)
                    attached = True
                    break
            if attached:
                break
        
        # Try parent section match
        if not attached:
            main_section = table_number.split(".")[0] if "." in table_number else table_number
            if main_section in sections:
                sections[main_section].figures.append(f"table:{table_number}")
                attached = True
        
        if not attached:
            logger.warning(f"Could not attach table {table_number}")


def attach_figures(figures: list[dict], sections: dict[str, Section]):
    """Attach figures to sections and subsections."""
    for figure in figures:
        fig_number = figure["number"]
        fig_url = figure["url"]
        fig_type = figure.get("type", "figure")
        prefixed_url = f"{fig_type}:{fig_url}" if fig_type == "figure" else fig_url
        attached = False
        
        # Try exact subsection match
        for section in sections.values():
            for subsection in section.subsections:
                if subsection.number == fig_number:
                    subsection.figures.append(prefixed_url)
                    attached = True
                    break
            if attached:
                break
        
        # Try exact section match
        if not attached and fig_number in sections:
            sections[fig_number].figures.append(prefixed_url)
            attached = True
        
        # Try parent section match
        if not attached:
            main_section = fig_number.split(".")[0] if "." in fig_number else fig_number
            if main_section in sections:
                sections[main_section].figures.append(prefixed_url)
                attached = True
        
        # Try best matching subsection
        if not attached:
            best_match_len = 0
            best_subsection = None
            
            for section in sections.values():
                for subsection in section.subsections:
                    if fig_number.startswith(subsection.number + "."):
                        if len(subsection.number) > best_match_len:
                            best_match_len = len(subsection.number)
                            best_subsection = subsection
            
            if best_subsection:
                best_subsection.figures.append(prefixed_url)
                attached = True
        
        if not attached:
            logger.warning(f"Could not attach {fig_type} {fig_number}")


def main(args):
    logger.info(f"Starting CBC scraper for version {args.version}")
    if args.test:
        logger.info("TEST MODE - processing limited elements")
    if args.dry_run:
        logger.info("DRY RUN - no S3 upload")
    
    raw_code_s3 = RawICCS3("CA", args.version, CHAPTER_FILES)
    
    all_sections = {}
    all_subsections = {}
    all_tables = []
    all_figures = []
    
    # Process each chapter
    for chapter in ["10", "11a", "11b"]:
        logger.info(f"Processing chapter {chapter}")
        html = raw_code_s3.chapter(chapter)
        soup = BeautifulSoup(html, "html.parser")
        
        # Extract tables and figures
        chapter_tables, chapter_figures = extract_tables_and_figures(
            soup, args.extract_images, args.test
        )
        all_tables.extend(chapter_tables)
        all_figures.extend(chapter_figures)
        
        # Extract sections
        chapter_sections = extract_sections(soup, args.test)
        all_sections.update(chapter_sections)
        
        # Extract subsections
        chapter_subsections = extract_subsections(soup, args.test)
        all_subsections.update(chapter_subsections)
    
    # Attach subsections to sections
    attach_subsections_to_sections(all_sections, all_subsections)
    
    # Attach tables and figures
    attach_tables(all_tables, all_sections)
    attach_figures(all_figures, all_sections)
    
    # Create Code object
    code = Code(
        provider="ICC",
        version=args.version,
        jurisdiction="CA",
        source_id="CBC_Chapter10_11A_11B",
        title="California Building Code - Chapters 10 (Means of Egress), 11A & 11B (Accessibility)",
        source_url="https://codes.iccsafe.org/content/CABC2025P1",
        sections=list(all_sections.values()),
    )
    
    # Save to JSON
    output_filename = f"cbc_{args.version}.json"
    with open(output_filename, "w") as f:
        json.dump(code.model_dump(), f, indent=2)
    
    # Upload to S3
    if not args.dry_run:
        s3 = boto3.resource("s3")
        s3_key = f"cleaned/CA/{args.version}/{output_filename}"
        s3.Bucket(BUCKET_NAME).upload_file(output_filename, s3_key)
        logger.info(f"Uploaded to S3: {s3_key}")
    
    # Log statistics
    logger.info(f"Extracted {len(all_sections)} sections")
    logger.info(f"Extracted {len(all_tables)} tables and {len(all_figures)} figures")
    
    total_subsections = sum(len(s.subsections) for s in all_sections.values())
    total_subsection_tables = sum(
        len(sub.tables) for s in all_sections.values() for sub in s.subsections
    )
    total_section_figures = sum(len(s.figures) for s in all_sections.values())
    total_subsection_figures = sum(
        len(sub.figures) for s in all_sections.values() for sub in s.subsections
    )
    
    logger.info(f"Total subsections: {total_subsections}")
    logger.info(f"Attached tables: {total_subsection_tables} to subsections")
    logger.info(
        f"Attached figures: {total_section_figures} to sections, "
        f"{total_subsection_figures} to subsections"
    )
    logger.info(f"Output saved to {output_filename}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Scrape California Building Code from ICC website"
    )
    parser.add_argument("--version", type=int, default=2025)
    parser.add_argument(
        "--extract-images",
        action="store_true",
        default=True,
        help="Extract and upload figure images to S3",
    )
    parser.add_argument(
        "--test",
        action="store_true",
        help="Test mode - process only first few elements",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Process and save JSON locally but don't upload to S3",
    )
    args = parser.parse_args()
    main(args)