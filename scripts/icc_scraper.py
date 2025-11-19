"""
Scrape building codes from ICC website and save to JSON.
Download HTML manually from S3 first.

Usage:
    python scripts/icc_scraper.py --state CA --version 2025
    python scripts/icc_scraper.py --state NC --version 2018
"""

import re
import boto3
from bs4 import BeautifulSoup
import argparse
import logging
import json
from pathlib import Path
from utils import generate_section_url, get_icc_part_number
from s3 import RawICCS3, BUCKET_NAME, upload_image_to_s3
from schema import Code, Section, Subsection, TableBlock
from utils import extract_table_data, extract_figure_url
from cbc_utils import sort_code_data, compare_json_files, print_comparison_summary

# State-specific configuration
STATE_CONFIG = {
    "CA": {
        "name": "California",
        "chapters": ["3", "4", "5", "6", "7", "7a", "8", "9", "10", "11a", "11b", "14", "15", "16", "17", "19", "23"],
        # California section patterns - formats ordered by specificity:
        #   11B-XXX, 11XXA, 7XXA, 23XX, 19XX, 17XX, 16XX, 15XX, 14XX, 10XX, 9XX, 8XX, 7XX, 6XX, 5XX, 4XX, 3XX, XXXXА
        "section_pattern": r"(?:11[AB]-\d{3,4}|11\d{2}A|7\d{2}A|\d{4}A|23\d{2}|19\d{2}|17\d{2}|16\d{2}|15\d{2}|14\d{2}|10\d{2}|9\d{2}|8\d{2}|7\d{2}|6\d{2}|5\d{2}|4\d{2}|3\d{2})",
    },
    "NC": {
        "name": "North Carolina",
        "chapters": ["4", "5", "6", "7", "8", "9", "10", "11", "14", "15", "16", "18", "19"],  # Available chapters in S3
        # Standard IBC 4-digit pattern: chapters 4-11, 14-19 use format like 401, 1001, 1401, 1801, etc.
        "section_pattern": r"(?:[4-9]\d{2}|1[0-9]\d{2})",
    }
}

# These will be set based on --state argument
SECTION_PATTERN = None
SUBSECTION_PATTERN = None
SECTION_REGEX = None
SUBSECTION_REGEX = None
SECTION_REFERENCE_REGEX = None
SUBSECTION_REFERENCE_REGEX = None

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s"
)
logger = logging.getLogger(__name__)


def get_chapter_files(year: int, state: str) -> dict[str, str]:
    """Get chapter file names for the specified state and year."""

    if state == "CA":
        out = {
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
            "11b": f"CHAPTER 11B ACCESSIBILITY TO PUBLIC BUILDINGS PUBLIC ACCOMMODATIONS COMMERCIALBUILDINGS AND PUBLIC HOUSING - {year} CALIFORNIA BUILDING CODE VOLUMES 1 AND 2, TITLE 24, PART 2.html",
            "14": f"CHAPTER 14 EXTERIOR WALLS - {year} CALIFORNIA BUILDING CODE, TITLE 24, PART 2 (VOLUMES 1 & 2) WITH JULY 2022 SUPPLE.html",
            "15": f"CHAPTER 15 ROOF ASSEMBLIES AND ROOFTOP STRUCTURES - {year} CALIFORNIA BUILDING CODE VOLUMES 1 AND 2, TITLE 24, PART 2.html",
            "16": f"CHAPTER 16 STRUCTURAL DESIGN - {year} CALIFORNIA BUILDING CODE VOLUMES 1 AND 2, TITLE 24, PART 2.html",
            "17": f"CHAPTER 17 SPECIAL INSPECTIONS AND TESTS - {year} CALIFORNIA BUILDING CODE VOLUMES 1 AND 2, TITLE 24, PART 2.html",
            "19": f"CHAPTER 19 CONCRETE - {year} CALIFORNIA BUILDING CODE VOLUMES 1 AND 2, TITLE 24, PART 2.html",
            "23": f"CHAPTER 23 WOOD - {year} CALIFORNIA BUILDING CODE VOLUMES 1 AND 2, TITLE 24, PART 2.html",
        }
    elif state == "NC":
        out = {
            "4": "Chapter 4 Special Detailed Requirements Based On Use And Occupancy - North Carolina State Building Code_ Building Code.html",
            "5": "Chapter 5 General Building Heights And Areas - North Carolina State Building Code_ Building Code.html",
            "6": "Chapter 6 Types Of Construction - North Carolina State Building Code_ Building Code.html",
            "7": "Chapter 7 Fire And Smoke Protection Features - North Carolina State Building Code_ Building Code.html",
            "8": "Chapter 8 Interior Finishes - North Carolina State Building Code_ Building Code.html",
            "9": "Chapter 9 Fire Protection Systems - North Carolina State Building Code_ Building Code.html",
            "10": "Chapter 10 Means Of Egress - North Carolina State Building Code_ Building Code.html",
            "11": "Chapter 11 Accessibility - North Carolina State Building Code_ Building Code.html",
            "14": "Chapter 14 Exterior Walls - North Carolina State Building Code_ Building Code.html",
            "15": "Chapter 15 Roof Assemblies And Rooftop Structures - North Carolina State Building Code_ Building Code.html",
            "16": "Chapter 16 Structural Design - North Carolina State Building Code_ Building Code.html",
            "18": "Chapter 18 Soils And Foundations - North Carolina State Building Code_ Building Code.html",
            "19": "Chapter 19 Concrete - North Carolina State Building Code_ Building Code.html",
        }
    else:
        raise ValueError(f"Unknown state: {state}")

    expected_chapters = STATE_CONFIG[state]["chapters"]
    assert sorted(list(out.keys())) == sorted(expected_chapters), f"mismatch between {state} chapters"
    return out


def find_section_numbers(text: str) -> list[str]:
    """Extract section numbers from text (e.g., from headers). No context required."""
    return re.findall(SECTION_REGEX, text)


def find_subsection_numbers(text: str) -> list[str]:
    """Extract subsection numbers from text (e.g., from headers). No context required."""
    return re.findall(SUBSECTION_REGEX, text)


def extract_subsection_number_from_id(element_id: str | None) -> str | None:
    """
    Extract subsection number from HTML element ID.

    Examples:
        "CABC2025P1_Ch16_Sec1617.5.1" -> "1617.5.1"
        "CABC2025P1_Ch11_Sec11B-213.3.1" -> "11B-213.3.1"
        "invalid_id" -> None

    Args:
        element_id: HTML element ID attribute value

    Returns:
        Subsection number string, or None if not found
    """
    if not element_id:
        return None

    # Pattern: CABC{year}P{part}_Ch{chapter}_Sec{section_number}
    # Extract everything after "Sec"
    match = re.search(r'_Sec(.+)$', element_id)
    if match:
        return match.group(1)

    return None


def find_section_references(text: str) -> list[str]:
    """
    Find section references in paragraph text using context-aware extraction.

    Finds 'Section/Sections/§' keywords and extracts all section numbers within
    the same clause, handling patterns like "Section X or Y" and "Sections X and Y".

    Returns:
        List of section numbers (e.g., ["1611", "1403"])
    """
    matches = []

    # Find all positions where "Section" keyword appears
    section_keyword_pattern = r'\b(?:Section|Sections|§)\b'

    for keyword_match in re.finditer(section_keyword_pattern, text, re.IGNORECASE):
        start_pos = keyword_match.end()

        # Extract the clause following "Section" (up to period, semicolon, or end)
        # Look ahead up to 200 chars or until major punctuation
        remaining = text[start_pos:start_pos + 200]

        # Stop at sentence boundary (period followed by space/capital) or semicolon
        clause_match = re.match(r'([^.;]*?)(?:\.\s+[A-Z]|;|$)', remaining)
        if clause_match:
            clause = clause_match.group(1)
        else:
            clause = remaining

        # Within this clause, find all section numbers (base sections without dots)
        section_matches = re.findall(SECTION_PATTERN, clause)
        matches.extend(section_matches)

    return list(set(matches))  # Deduplicate


def find_subsection_references(text: str) -> list[str]:
    """
    Find subsection references in paragraph text using context-aware extraction.

    Finds 'Section/Sections/§' keywords and extracts all subsection numbers within
    the same clause, handling patterns like "Section X or Y" and "Sections X, Y or Z".

    Returns:
        List of subsection numbers (e.g., ["1403.12.1", "1403.12.2"])
    """
    matches = []

    # Find all positions where "Section" keyword appears
    section_keyword_pattern = r'\b(?:Section|Sections|§)\b'

    for keyword_match in re.finditer(section_keyword_pattern, text, re.IGNORECASE):
        start_pos = keyword_match.end()

        # Extract the clause following "Section" (up to period, semicolon, or end)
        # Look ahead up to 200 chars or until major punctuation
        remaining = text[start_pos:start_pos + 200]

        # Stop at sentence boundary (period followed by space/capital) or semicolon
        clause_match = re.match(r'([^.;]*?)(?:\.\s+[A-Z]|;|$)', remaining)
        if clause_match:
            clause = clause_match.group(1)
        else:
            clause = remaining

        # Within this clause, find all subsection numbers (sections with dots)
        subsection_matches = re.findall(SUBSECTION_PATTERN, clause)
        matches.extend(subsection_matches)

    return list(set(matches))  # Deduplicate


def section_belongs_to_chapter(section_number: str, chapter: str) -> bool:
    """Check if a section number belongs to the specified chapter."""
    chapter = chapter.lower()

    # Chapters 3-9, 14-19, 23 follow the pattern: Xdd or XXdd (e.g., 301, 402, 1401, 1802, 1901, 2301)
    if chapter in ["3", "4", "5", "6", "7", "8", "9", "14", "15", "16", "17", "18", "19", "23"]:
        return re.match(rf"^{chapter}\d{{2}}$", section_number) is not None

    # Special cases with unique patterns
    patterns = {
        "7a": r"^7\d{2}A$",          # Chapter 7A: 7XXA (e.g., 701A, 702A)
        "10": r"^10\d{2}$|^\d{4}A$", # Chapter 10: 10XX or XXXXА (e.g., 1001, 1003A)
        "11a": r"^11\d{2}A$",        # Chapter 11A: 11XXA (e.g., 1102A, 1103A, 1105A)
        "11b": r"^11B-",             # Chapter 11B: 11B-XXX (e.g., 11B-101)
    }

    if chapter in patterns:
        return re.match(patterns[chapter], section_number) is not None

    return False



def extract_tables_and_figures(soup: BeautifulSoup, extract_images: bool, year: int, state: str) -> tuple[list, list]:
    """Extract tables and figures from HTML."""
    tables = []
    figures = []
    part = get_icc_part_number(year)
    code_prefix = f"{state}BC"
    base_url = f"https://codes.iccsafe.org/content/{code_prefix}{year}{part}/"
    
    figure_elements = soup.find_all("figure")
    logger.info(f"Found {len(figure_elements)} figure elements")
    
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
                    s3_key = f"cleaned/ICC/{state}/{year}/figures/{fig_number}.jpg"
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


def extract_sections(soup: BeautifulSoup, chapter: str, year: int, state: str) -> dict[str, Section]:
    """Extract all sections from the soup."""
    sections = {}
    level_sections = soup.find_all("section", class_=re.compile(r"level\d"))

    for level_section in level_sections:
        header_elem = level_section.find("div", class_="section-action-wrapper")
        if not header_elem:
            continue

        # Use data-section-title attribute when available to avoid matching
        # measurements (e.g., "1524 mm") or cross-references in paragraph text
        section_title_attr = header_elem.get("data-section-title")
        if section_title_attr:
            header_text = section_title_attr
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
            source_url=generate_section_url(section_number, year, state),
            figures=[],
            chapter=chapter.upper(),  # Add chapter metadata
        )

    return sections


def extract_subsections(soup: BeautifulSoup, chapter: str) -> dict[str, Subsection]:
    """Extract all subsections from the soup."""
    subsections = {}
    pattern = re.compile(r"level\d|level\d_title")
    subsection_elements = soup.find_all("section", class_=pattern)

    for subsection_elem in subsection_elements:
        # Extract subsection number from element ID (most reliable)
        element_id = subsection_elem.get("id")
        subsection_number = extract_subsection_number_from_id(element_id)

        # Fallback to regex parsing if ID not available
        if not subsection_number:
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

        # Still need header_text for title extraction
        header_elem = subsection_elem.find("h1", class_=pattern)
        if not header_elem:
            header_elem = subsection_elem.find("span", class_=pattern)
        if not header_elem:
            continue
        header_text = header_elem.get_text()

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
        subsection_refs = []
        section_refs = []

        # Find all nested section elements
        nested_sections = subsection_elem.find_all("section", class_=pattern)

        for para in subsection_elem.find_all("p"):
            # Skip if paragraph is inside a nested section
            if any(nested_section in para.parents for nested_section in nested_sections):
                continue

            para_text = para.get_text()
            paragraphs.append(para_text)
            # Use reference functions to find cross-references (requires context)
            subsection_refs.extend(find_subsection_references(para_text))
            section_refs.extend(find_section_references(para_text))

        # Remove parent sections if subsection is already referenced
        # E.g., if "907.2" is referenced, don't also include "907"
        subsection_parents = set()
        for subsection_ref in subsection_refs:
            parent = subsection_ref.split('.')[0]
            subsection_parents.add(parent)

        filtered_section_refs = [s for s in section_refs if s not in subsection_parents]
        links = subsection_refs + filtered_section_refs
        
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
    # Setup state-specific patterns
    global SECTION_PATTERN, SUBSECTION_PATTERN, SECTION_REGEX, SUBSECTION_REGEX
    global SECTION_REFERENCE_REGEX, SUBSECTION_REFERENCE_REGEX

    state = args.state.upper()
    config = STATE_CONFIG.get(state)
    if not config:
        raise ValueError(f"Unknown state: {state}. Available: {list(STATE_CONFIG.keys())}")

    # Set global pattern variables
    SECTION_PATTERN = config["section_pattern"]
    SUBSECTION_PATTERN = config["section_pattern"] + r"(?:\.\d+)+"
    SECTION_REGEX = rf"(?<!\d)({SECTION_PATTERN})(?![A.\d-])"
    SUBSECTION_REGEX = rf"(?<!\d)({SUBSECTION_PATTERN})(?!\d)"
    SECTION_REFERENCE_REGEX = rf"(?:Section|Sections|§)\s*({SECTION_PATTERN})(?![A.\d-])"
    SUBSECTION_REFERENCE_REGEX = rf"(?:Section|Sections|§)\s*({SUBSECTION_PATTERN})(?!\d)"

    logger.info(f"Starting {config['name']} Building Code scraper for version {args.version}")
    if args.dry_run:
        logger.info("DRY RUN - no S3 upload")

    chapter_files = get_chapter_files(args.version, state)
    raw_code_s3 = RawICCS3(state, args.version, chapter_files)

    all_sections = {}
    all_subsections = {}
    all_tables = []
    all_figures = []

    # Determine which chapters to process
    chapters_to_process = args.chapters if args.chapters else config["chapters"]
    logger.info(f"Processing chapters: {chapters_to_process}")

    # Process each chapter
    for chapter in chapters_to_process:
        logger.info(f"Processing chapter {chapter}")
        html = raw_code_s3.chapter(chapter)
        soup = BeautifulSoup(html, "html.parser")

        # Extract tables and figures
        chapter_tables, chapter_figures = extract_tables_and_figures(
            soup, args.extract_images, args.version, state
        )
        all_tables.extend(chapter_tables)
        all_figures.extend(chapter_figures)

        # Extract sections (pass chapter info, year, and state)
        chapter_sections = extract_sections(soup, chapter, args.version, state)
        all_sections.update(chapter_sections)

        # Extract subsections
        chapter_subsections = extract_subsections(soup, chapter)
        all_subsections.update(chapter_subsections)

    # Attach subsections to sections
    attach_subsections_to_sections(all_sections, all_subsections)

    # Attach tables and figures
    attach_tables(all_tables, all_sections)
    attach_figures(all_figures, all_sections)

    # Create Code object
    part = get_icc_part_number(args.version)
    code_prefix = f"{state}BC"
    code = Code(
        provider="ICC",
        version=args.version,
        jurisdiction=state,
        source_id=f"{state}BC",
        title=f"{config['name']} Building Code",
        source_url=f"https://codes.iccsafe.org/content/{code_prefix}{args.version}{part}",
        sections=list(all_sections.values()),
        chapters_included=chapters_to_process,  # Track which chapters were processed
    )

    # Sort data for deterministic output
    logger.info("Sorting data structures for deterministic output...")
    code = sort_code_data(code)

    # Save to JSON with sorted keys
    chapters_suffix = "_".join(chapters_to_process)
    output_filename = f"{state.lower()}bc_{args.version}_{chapters_suffix}.json"
    new_output_filename = f"{state.lower()}bc_{args.version}_{chapters_suffix}_new.json" if args.compare else output_filename
    
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
        s3_key = f"cleaned/{state}/{args.version}/{output_filename}"
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
        description="Scrape building codes from ICC website (multi-state support)"
    )
    parser.add_argument(
        "--state",
        type=str,
        default="CA",
        choices=["CA", "NC"],
        help="State building code to scrape (CA=California, NC=North Carolina)"
    )
    parser.add_argument("--version", type=int, default=2025)
    parser.add_argument(
        "--extract-images",
        action="store_true",
        default=True,
        help="Extract and upload figure images to S3",
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
        help="Compare output with baseline file (defaults to {state}bc_VERSION.json if no file specified). "
             "Generates {state}bc_VERSION_new.json and shows differences. Prevents S3 upload.",
    )
    parser.add_argument(
        "--chapters",
        nargs="+",
        metavar="CHAPTER",
        help="Specific chapters to process (e.g., --chapters 7 7a 8 9 10). If not specified, processes all state chapters",
    )

    args = parser.parse_args()
    main(args)