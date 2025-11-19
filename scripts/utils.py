import re
from urllib.parse import urljoin

def get_icc_part_number(year: int) -> str:
    """Get ICC part number (P1, P4, etc.) for a given year."""
    part_mapping = {
        2022: "P4",
        2025: "P1",
    }
    return part_mapping.get(year, "P1")  # Default to P1

def generate_section_url(section_number: str, year: int = 2025, state: str = "CA") -> str:
    """Generate building code URL with proper section anchors for any state."""
    part = get_icc_part_number(year)
    code_prefix = f"{state}BC"
    base_url = f"https://codes.iccsafe.org/content/{code_prefix}{year}{part}"

    if not section_number:
        return base_url

    # State-specific URL generation
    if state == "CA":
        return _generate_ca_section_url(section_number, year, part, code_prefix, base_url)
    elif state == "NC":
        # TODO: Implement NC-specific URL generation once we understand their structure
        return base_url
    else:
        return base_url


def _generate_ca_section_url(section_number: str, year: int, part: str, code_prefix: str, base_url: str) -> str:
    """Generate California-specific section URLs."""
    # Chapter 7 sections (e.g., 705, 706, 707)
    if re.match(r'7\d{2}', section_number):
        anchor = f"{code_prefix}{year}{part}_Ch07_Sec{section_number}"
        return f"{base_url}/chapter-7-fire-and-smoke-protection-features#{anchor}"

    # Chapter 10 sections (e.g., 1001, 1002)
    if re.match(r'10\d{2}', section_number):
        anchor = f"{code_prefix}{year}{part}_Ch10_Sec{section_number}"
        return f"{base_url}/chapter-10-means-of-egress#{anchor}"

    # Chapter 11A sections (e.g., 1102A, 1103A)
    if re.match(r'\d{4}A', section_number):
        anchor = f"{code_prefix}{year}{part}_Ch11A_Sec{section_number}"
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
        anchor = f"{code_prefix}{year}{part}_Ch11B_{subchapter}_Sec{anchor_section}"
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