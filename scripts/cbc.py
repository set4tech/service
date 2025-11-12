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
from deepdiff import DeepDiff
from pathlib import Path
from utils import generate_section_url, get_icc_part_number
from s3 import RawICCS3, BUCKET_NAME, upload_image_to_s3
from schema import Code, Section, Subsection, TableBlock
from utils import extract_table_data, extract_figure_url

# California section patterns
# Matches: 3XX (Ch 3), 4XX (Ch 4), 5XX (Ch 5), 6XX (Ch 6), 7XX (Ch 7), 7XXA (Ch 7A), 8XX (Ch 8), 9XX (Ch 9), 10XX (Ch 10), XXXXА (Ch 10 with A), 11A-XXX, 11B-XXX
SECTION_REGEX = r"(?:11[AB]-\d{3,4}|\d{4}A|10\d{2}|9\d{2}|8\d{2}|7\d{2}A|7\d{2}|6\d{2}|5\d{2}|4\d{2}|3\d{2})(?!\.\d)"
SUBSECTION_REGEX = r"(?:11[AB]-\d{3,4}|\d{4}A|10\d{2}|9\d{2}|8\d{2}|7\d{2}A|7\d{2}|6\d{2}|5\d{2}|4\d{2}|3\d{2})(?:\.\d+)+"

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s"
)
logger = logging.getLogger(__name__)


def get_chapter_files(year: int) -> dict[str, str]:
    """Get chapter file names for the specified year."""
    return {
        "3": f"CHAPTER 3 OCCUPANCY CLASSIFICATION AND USE - {year} CALIFORNIA BUILDING CODE VOLUMES 1 AND 2, TITLE 24, PART 2.html",
        "4": f"CHAPTER 4 SPECIAL DETAILED REQUIREMENTS BASED ON OCCUPANCY AND USE - {year} CALIFORNIA BUILDING CODE VOLUMES 1 AND 2, TITLE 24, PART 2.html",
        "5": f"CHAPTER 5 GENERAL BUILDING HEIGHTS AND AREAS - {year} CALIFORNIA BUILDING CODE VOLUMES 1 AND 2, TITLE 24, PART 2.html",
        "6": f"CHAPTER 6 TYPES OF CONSTRUCTION - {year} CALIFORNIA BUILDING CODE VOLUMES 1 AND 2, TITLE 24, PART 2.html",
        "7": f"CHAPTER 7 FIRE AND SMOKE PROTECTION FEATURES - {year} CALIFORNIA BUILDING CODE, TITLE 24, PART 2 (VOLUMES 1 & 2) WITH JULY 2022 SUPPLE.html",
        "7a": f"CHAPTER 7A SFM MATERIALS AND CONSTRUCTION METHODS FOR EXTERIOR WILDFIRE EXPOSURE - {year} CALIFORNIA BUILDING CODE VOLUMES 1 AND 2, TITLE 24, PART 2.html",
        "8": f"CHAPTER 8 INTERIOR FINISHES - {year} CALIFORNIA BUILDING CODE VOLUMES 1 AND 2, TITLE 24, PART 2.html",
        "9": f"CHAPTER 9 FIRE PROTECTION AND LIFE SAFETY SYSTEMS - {year} CALIFORNIA BUILDING CODE VOLUMES 1 AND 2, TITLE 24, PART 2.html",
        "10": f"CHAPTER 10 MEANS OF EGRESS - {year} CALIFORNIA BUILDING CODE VOLUMES 1 AND 2, TITLE 24, PART 2.html",
        "11a": f"CHAPTER 11A HOUSING ACCESSIBILITY - {year} CALIFORNIA BUILDING CODE VOLUMES 1 AND 2, TITLE 24, PART 2.html",
        "11b": f"Chapter 11b Accessibility To Public Buildings Public Accommodations Commercial Buildings And Public Housing - {year} California Building Code Volumes 1 and 2, Title 24, Part 2.html",
    }


def find_section_numbers(text: str) -> list[str]:
    """Extract section numbers from text."""
    return re.findall(SECTION_REGEX, text)


def find_subsection_numbers(text: str) -> list[str]:
    """Extract subsection numbers from text."""
    return re.findall(SUBSECTION_REGEX, text)


def section_belongs_to_chapter(section_number: str, chapter: str) -> bool:
    """Check if a section number belongs to the specified chapter."""
    chapter = chapter.lower()

    # Chapter 3: 3XX (e.g., 301, 302)
    if chapter == "3":
        return re.match(r"^3\d{2}$", section_number) is not None

    # Chapter 4: 4XX (e.g., 401, 402)
    if chapter == "4":
        return re.match(r"^4\d{2}$", section_number) is not None

    # Chapter 5: 5XX (e.g., 501, 502)
    if chapter == "5":
        return re.match(r"^5\d{2}$", section_number) is not None

    # Chapter 6: 6XX (e.g., 601, 602)
    if chapter == "6":
        return re.match(r"^6\d{2}$", section_number) is not None

    # Chapter 7: 7XX (e.g., 701, 702)
    if chapter == "7":
        return re.match(r"^7\d{2}$", section_number) is not None

    # Chapter 7A: 7XXA (e.g., 701A, 702A)
    if chapter == "7a":
        return re.match(r"^7\d{2}A$", section_number) is not None

    # Chapter 8: 8XX (e.g., 801, 802)
    if chapter == "8":
        return re.match(r"^8\d{2}$", section_number) is not None

    # Chapter 9: 9XX (e.g., 901, 902)
    if chapter == "9":
        return re.match(r"^9\d{2}$", section_number) is not None

    # Chapter 10: 10XX or XXXXА (e.g., 1001, 1002, 1003A)
    if chapter == "10":
        return re.match(r"^10\d{2}$", section_number) is not None or re.match(r"^\d{4}A$", section_number) is not None

    # Chapter 11A: 11A-XXX (e.g., 11A-101)
    if chapter == "11a":
        return section_number.startswith("11A-")

    # Chapter 11B: 11B-XXX (e.g., 11B-101)
    if chapter == "11b":
        return section_number.startswith("11B-")

    return False



def extract_tables_and_figures(soup: BeautifulSoup, extract_images: bool, test_mode: bool, year: int) -> tuple[list, list]:
    """Extract tables and figures from HTML."""
    tables = []
    figures = []
    part = get_icc_part_number(year)
    base_url = f"https://codes.iccsafe.org/content/CABC{year}{part}/"
    
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
                    s3_key = f"cleaned/ICC/CA/{year}/figures/{fig_number}.jpg"
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


def extract_sections(soup: BeautifulSoup, test_mode: bool, chapter: str, year: int) -> dict[str, Section]:
    """Extract all sections from the soup."""
    sections = {}
    level_sections = soup.find_all("section", class_=re.compile(r"level\d"))

    if test_mode:
        level_sections = level_sections[:2]

    for level_section in level_sections:
        header_elem = level_section.find("div", class_="section-action-wrapper")
        if not header_elem:
            continue

        # Chapter 9 has cross-references in paragraph text that get picked up,
        # so extract from data-section-title attribute instead of full text
        if chapter == "9":
            section_title_attr = header_elem.get("data-section-title")
            if section_title_attr:
                header_text = section_title_attr
            else:
                header_text = header_elem.get_text()
        else:
            header_text = header_elem.get_text()

        section_numbers = find_section_numbers(header_text)

        if len(section_numbers) != 1:
            continue

        section_number = section_numbers[0].strip()

        # Filter sections by chapter - only include sections that belong to this chapter
        if not section_belongs_to_chapter(section_number, chapter):
            logger.debug(f"Skipping section {section_number} (doesn't belong to chapter {chapter})")
            continue

        # Extract title - try multiple sources in order of reliability
        section_title = None
        
        # 1. Try data-section-title attribute
        if header_elem.get("data-section-title"):
            section_title_raw = header_elem.get("data-section-title")
            # Extract title after the section number and separator
            section_title = extract_title(section_title_raw, section_number)
        
        # 2. Try span with level class
        if not section_title:
            title_elem = level_section.find("span", class_=re.compile(r"level\d_title"))
            if title_elem:
                section_title = title_elem.get_text().strip()
        
        # 3. Fallback to parsing header text
        if not section_title:
            section_title = extract_title(header_text, section_number)
        
        logger.info(f"Section: {section_number} - {section_title}")
        
        sections[section_number] = Section(
            key=section_number,
            number=section_number,
            title=section_title,
            subsections=[],
            source_url=generate_section_url(section_number, year),
            figures=[],
            chapter=chapter.upper(),  # Add chapter metadata
        )
    
    return sections


def extract_subsections(soup: BeautifulSoup, test_mode: bool, chapter: str) -> dict[str, Subsection]:
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

        # Filter subsections by chapter - check if parent section belongs to this chapter
        parent_section = subsection_number.split(".")[0]
        if not section_belongs_to_chapter(parent_section, chapter):
            logger.debug(f"Skipping subsection {subsection_number} (parent doesn't belong to chapter {chapter})")
            continue

        # Extract title - use fallback if span not found
        title_elem = subsection_elem.find("span", class_=pattern)
        if title_elem:
            subsection_title = title_elem.get_text().strip()
        else:
            subsection_title = extract_title(header_text, subsection_number)
        
        # Extract paragraphs and links (exclude paragraphs from nested subsections)
        paragraphs = []
        links = []
        
        # Find all nested section elements
        nested_sections = subsection_elem.find_all("section", class_=pattern)
        
        for para in subsection_elem.find_all("p"):
            # Skip if paragraph is inside a nested section
            if any(nested_section in para.parents for nested_section in nested_sections):
                continue
            
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


def sort_code_data(code: Code) -> Code:
    """Sort all data structures in the Code object for deterministic output."""
    # Sort sections by number
    code.sections.sort(key=lambda s: s.number)
    
    for section in code.sections:
        # Sort subsections by number
        section.subsections.sort(key=lambda ss: ss.number)
        
        # Sort section-level lists
        section.figures.sort()
        
        for subsection in section.subsections:
            # Sort subsection-level lists
            subsection.refers_to.sort()
            subsection.figures.sort()
            # Sort tables by number
            subsection.tables.sort(key=lambda t: t.number)
    
    return code


def compare_json_files(file1: str, file2: str) -> dict:
    """Compare two JSON files and return differences."""
    with open(file1, "r") as f1, open(file2, "r") as f2:
        data1 = json.load(f1)
        data2 = json.load(f2)
    
    diff = DeepDiff(data1, data2, ignore_order=False, verbose_level=2)
    return diff


def print_comparison_summary(diff: dict, baseline_file: str, new_file: str):
    """Print a human-readable summary of JSON differences."""
    if not diff:
        logger.info("✅ No differences found! Output matches baseline.")
        return
    
    logger.warning(f"⚠️  Differences detected between {baseline_file} and {new_file}")
    
    # Count changes
    counts = {
        "values_changed": 0,
        "dictionary_item_added": 0,
        "dictionary_item_removed": 0,
        "iterable_item_added": 0,
        "iterable_item_removed": 0,
    }
    
    for key in counts.keys():
        if key in diff:
            counts[key] = len(diff[key])
    
    # Print summary
    logger.info("\n" + "="*80)
    logger.info("COMPARISON SUMMARY")
    logger.info("="*80)
    
    if counts["values_changed"] > 0:
        logger.info(f"\n📝 Values Changed: {counts['values_changed']}")
        for path, change in list(diff.get("values_changed", {}).items())[:10]:
            logger.info(f"  {path}")
            logger.info(f"    OLD: {str(change['old_value'])[:100]}")
            logger.info(f"    NEW: {str(change['new_value'])[:100]}")
        if counts["values_changed"] > 10:
            logger.info(f"  ... and {counts['values_changed'] - 10} more")
    
    if counts["dictionary_item_added"] > 0:
        logger.info(f"\n➕ Items Added: {counts['dictionary_item_added']}")
        for path, value in list(diff.get("dictionary_item_added", {}).items())[:5]:
            logger.info(f"  {path}: {str(value)[:100]}")
        if counts["dictionary_item_added"] > 5:
            logger.info(f"  ... and {counts['dictionary_item_added'] - 5} more")
    
    if counts["dictionary_item_removed"] > 0:
        logger.info(f"\n➖ Items Removed: {counts['dictionary_item_removed']}")
        for path in list(diff.get("dictionary_item_removed", {}).keys())[:5]:
            logger.info(f"  {path}")
        if counts["dictionary_item_removed"] > 5:
            logger.info(f"  ... and {counts['dictionary_item_removed'] - 5} more")
    
    if counts["iterable_item_added"] > 0:
        logger.info(f"\n➕ Array Items Added: {counts['iterable_item_added']}")
    
    if counts["iterable_item_removed"] > 0:
        logger.info(f"\n➖ Array Items Removed: {counts['iterable_item_removed']}")
    
    logger.info("\n" + "="*80)
    logger.info("💡 Full diff saved to: diff_report.json")
    logger.info("="*80 + "\n")


def main(args):
    logger.info(f"Starting CBC scraper for version {args.version}")
    if args.test:
        logger.info("TEST MODE - processing limited elements")
    if args.dry_run:
        logger.info("DRY RUN - no S3 upload")
    
    chapter_files = get_chapter_files(args.version)
    raw_code_s3 = RawICCS3("CA", args.version, chapter_files)
    
    all_sections = {}
    all_subsections = {}
    all_tables = []
    all_figures = []
    
    # Determine which chapters to process
    # Note: 11a doesn't exist in S3, only 11b
    chapters_to_process = args.chapters if args.chapters else ["7", "7a", "8", "9", "10", "11b"]
    logger.info(f"Processing chapters: {chapters_to_process}")
    
    # Process each chapter
    for chapter in chapters_to_process:
        logger.info(f"Processing chapter {chapter}")
        html = raw_code_s3.chapter(chapter)
        soup = BeautifulSoup(html, "html.parser")
        
        # Extract tables and figures
        chapter_tables, chapter_figures = extract_tables_and_figures(
            soup, args.extract_images, args.test, args.version
        )
        all_tables.extend(chapter_tables)
        all_figures.extend(chapter_figures)
        
        # Extract sections (pass chapter info and year)
        chapter_sections = extract_sections(soup, args.test, chapter, args.version)
        all_sections.update(chapter_sections)

        # Extract subsections
        chapter_subsections = extract_subsections(soup, args.test, chapter)
        all_subsections.update(chapter_subsections)
    
    # Attach subsections to sections
    attach_subsections_to_sections(all_sections, all_subsections)
    
    # Attach tables and figures
    attach_tables(all_tables, all_sections)
    attach_figures(all_figures, all_sections)
    
    # Create Code object
    part = get_icc_part_number(args.version)
    code = Code(
        provider="ICC",
        version=args.version,
        jurisdiction="CA",
        source_id="CBC",
        title="California Building Code",
        source_url=f"https://codes.iccsafe.org/content/CABC{args.version}{part}",
        sections=list(all_sections.values()),
        chapters_included=chapters_to_process,  # Track which chapters were processed
    )
    
    # Sort data for deterministic output
    logger.info("Sorting data structures for deterministic output...")
    code = sort_code_data(code)

    # Save to JSON with sorted keys
    chapters_suffix = "_".join(chapters_to_process)
    output_filename = f"cbc_{args.version}_{chapters_suffix}.json"
    new_output_filename = f"cbc_{args.version}_{chapters_suffix}_new.json" if args.compare else output_filename
    
    with open(new_output_filename, "w") as f:
        json.dump(code.model_dump(), f, indent=2, sort_keys=True)
    
    logger.info(f"Output saved to {new_output_filename}")
    
    # Compare with baseline if requested
    if args.compare:
        baseline_file = args.compare if isinstance(args.compare, str) else output_filename
        
        if not Path(baseline_file).exists():
            logger.error(f"Baseline file not found: {baseline_file}")
            logger.info(f"New output saved to {new_output_filename}")
            return
        
        logger.info(f"\nComparing with baseline: {baseline_file}")
        diff = compare_json_files(baseline_file, new_output_filename)
        
        # Save detailed diff report
        if diff:
            with open("diff_report.json", "w") as f:
                json.dump(json.loads(diff.to_json()), f, indent=2)
        
        # Print human-readable summary
        print_comparison_summary(diff, baseline_file, new_output_filename)
        
        if not diff:
            # If no differences, remove the temp file and keep the baseline
            Path(new_output_filename).unlink()
            logger.info(f"✨ No changes detected, keeping baseline: {baseline_file}")
        else:
            logger.info(f"\n📋 Review the changes in: {new_output_filename}")
            logger.info(f"   If changes are correct, run: mv {new_output_filename} {baseline_file}")
    
    # Upload to S3 (only if not in comparison mode or dry run)
    if not args.dry_run and not args.compare:
        s3 = boto3.resource("s3")
        s3_key = f"cleaned/CA/{args.version}/{output_filename}"
        s3.Bucket(BUCKET_NAME).upload_file(output_filename, s3_key)
        logger.info(f"Uploaded to S3: {s3_key}")
    
    # Log statistics
    logger.info(f"\n{'='*80}")
    logger.info("EXTRACTION STATISTICS")
    logger.info(f"{'='*80}")
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
    logger.info(f"{'='*80}\n")


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
    parser.add_argument(
        "--compare",
        nargs="?",
        const=True,
        metavar="BASELINE_FILE",
        help="Compare output with baseline file (defaults to cbc_VERSION.json if no file specified). "
             "Generates cbc_VERSION_new.json and shows differences. Prevents S3 upload.",
    )
    parser.add_argument(
        "--chapters",
        nargs="+",
        metavar="CHAPTER",
        help="Specific chapters to process (e.g., --chapters 7 7a 8 9 10). If not specified, processes all chapters (7, 7a, 8, 9, 10, 11a, 11b)",
    )
    
    args = parser.parse_args()
    main(args)