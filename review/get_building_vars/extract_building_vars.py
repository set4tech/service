import yaml
import re
from pathlib import Path
import json

def load_variable_checklist(yaml_path="variable_checklist.yaml"):
    """Load the variable checklist from YAML file."""
    with open(yaml_path, 'r') as f:
        return yaml.safe_load(f)

def load_pdf_text(text_path="../../output/pdf_extracted_text.md"):
    """Load the extracted PDF text."""
    with open(text_path, 'r', encoding='utf-8') as f:
        return f.read()

def extract_address(text):
    """Extract building address from text."""
    # Look for California St address
    address_patterns = [
        r"255 California St.*?(?:5th Floor|Fifth Floor)",
        r"255 California Street.*?(?:5th Floor|Fifth Floor)",
        r"255 California.*?San Francisco",
    ]

    for pattern in address_patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return match.group(0)

    # Fallback to title-based extraction
    if "255 California St" in text:
        return "255 California St, 5th Floor, San Francisco, CA"

    return None

def extract_project_scope(text):
    """Extract project scope information."""
    scope_indicators = {
        "new construction": ["new construction", "new building", "ground-up"],
        "alteration": ["alteration", "renovation", "remodel", "tenant improvement", "TI"],
        "addition": ["addition", "expansion", "extension"],
        "change of occupancy": ["change of use", "change of occupancy", "conversion"]
    }

    text_lower = text.lower()
    detected_scopes = []

    for scope_type, keywords in scope_indicators.items():
        for keyword in keywords:
            if keyword in text_lower:
                detected_scopes.append(scope_type)
                break

    # Look for specific IFC or delta mentions
    if "ifc" in text_lower or "delta" in text_lower:
        if "alteration" not in detected_scopes:
            detected_scopes.append("alteration")

    return detected_scopes if detected_scopes else ["unknown"]

def extract_occupancy_classification(text):
    """Extract IBC occupancy classification."""
    occupancy_patterns = [
        r"(?:occupancy|use group|group)\s*[:=]?\s*([A-SU]-?\d*)",
        r"([A-SU]-?\d+)\s*(?:occupancy|use group)",
        r"(?:business|assembly|residential|mercantile)\s*\(([A-SU]-?\d+)\)"
    ]

    occupancies = []
    for pattern in occupancy_patterns:
        matches = re.findall(pattern, text, re.IGNORECASE)
        occupancies.extend(matches)

    # Common occupancy groups
    if "office" in text.lower() or "business" in text.lower():
        occupancies.append("B")
    if "assembly" in text.lower():
        occupancies.append("A")
    if "residential" in text.lower():
        occupancies.append("R")

    return list(set(occupancies)) if occupancies else None

def extract_code_editions(text):
    """Extract building code editions mentioned."""
    codes = {}

    # IBC patterns
    ibc_pattern = r"(?:IBC|International Building Code)\s*(\d{4})"
    ibc_matches = re.findall(ibc_pattern, text, re.IGNORECASE)
    if ibc_matches:
        codes["IBC"] = ibc_matches[0]

    # CBC patterns
    cbc_pattern = r"(?:CBC|California Building Code)\s*(\d{4})"
    cbc_matches = re.findall(cbc_pattern, text, re.IGNORECASE)
    if cbc_matches:
        codes["CBC"] = cbc_matches[0]

    # A117.1 patterns
    a117_pattern = r"(?:A117\.1|ICC A117\.1)\s*[-–]\s*(\d{4})"
    a117_matches = re.findall(a117_pattern, text, re.IGNORECASE)
    if a117_matches:
        codes["A117.1"] = a117_matches[0]

    # ADA patterns
    ada_pattern = r"(?:ADA|Americans with Disabilities Act)\s*(\d{4})"
    ada_matches = re.findall(ada_pattern, text, re.IGNORECASE)
    if ada_matches:
        codes["ADA"] = ada_matches[0]

    return codes if codes else None

def extract_floor_info(text):
    """Extract floor and area information."""
    info = {}

    # Floor patterns
    floor_pattern = r"(\d+)(?:th|st|nd|rd)?\s*floor"
    floor_matches = re.findall(floor_pattern, text, re.IGNORECASE)
    if floor_matches:
        info["floor"] = floor_matches[0]

    # Area patterns
    area_patterns = [
        r"(\d+[,\d]*)\s*(?:sf|sq\.?\s*ft|square feet)",
        r"(\d+[,\d]*)\s*(?:gsf|gross square feet)"
    ]

    for pattern in area_patterns:
        matches = re.findall(pattern, text, re.IGNORECASE)
        if matches:
            # Clean and convert
            area_str = matches[0].replace(",", "")
            info["area_sf"] = int(area_str)
            break

    return info if info else None

def extract_dates(text):
    """Extract project dates."""
    dates = {}

    # Date patterns
    date_pattern = r"(\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4})"
    date_matches = re.findall(date_pattern, text)

    # Look for specific date contexts
    permit_keywords = ["permit", "issued", "application"]
    construction_keywords = ["construction", "start", "commence"]

    for match in date_matches:
        context = text[max(0, text.index(match) - 50):text.index(match) + 50].lower()

        if any(keyword in context for keyword in permit_keywords):
            dates["permit_date"] = match
        elif any(keyword in context for keyword in construction_keywords):
            dates["construction_date"] = match

    # Look for year mentions
    year_pattern = r"\b(20[12]\d)\b"
    year_matches = re.findall(year_pattern, text)
    if year_matches and not dates:
        dates["project_year"] = year_matches[0]

    return dates if dates else None

def extract_accessibility_features(text):
    """Extract accessibility features mentioned."""
    features = []

    accessibility_keywords = [
        "wheelchair", "accessible", "ada compliant", "barrier-free",
        "ramp", "elevator", "lift", "grab bar", "tactile",
        "braille", "hearing loop", "assistive listening"
    ]

    text_lower = text.lower()
    for keyword in accessibility_keywords:
        if keyword in text_lower:
            features.append(keyword)

    return features if features else None

def extract_building_variables(checklist, pdf_text):
    """Extract building variables based on the checklist."""
    extracted_vars = {}

    # Project Identity
    extracted_vars["project_identity"] = {
        "full_address": extract_address(pdf_text),
        "authority_having_jurisdiction": "San Francisco Building Department" if "San Francisco" in pdf_text else None,
        "state_specific_code": "California Building Code (CBC)" if "California" in pdf_text else None
    }

    # Ownership Control
    ownership_keywords = {
        "private": ["private", "corporate", "commercial"],
        "government": ["government", "public", "municipal", "federal", "state"],
        "nonprofit": ["nonprofit", "non-profit", "501(c)"]
    }

    owner_type = None
    text_lower = pdf_text.lower()
    for otype, keywords in ownership_keywords.items():
        if any(keyword in text_lower for keyword in keywords):
            owner_type = otype
            break

    extracted_vars["ownership_control"] = {
        "owner_type": owner_type
    }

    # Facility Category
    if "office" in text_lower or "commercial" in text_lower:
        extracted_vars["facility_category"] = {
            "ada_title_iii": True,
            "commercial_facility": True
        }

    # Project Timeline
    extracted_vars["project_timeline"] = {
        "project_scope": extract_project_scope(pdf_text),
        "key_dates": extract_dates(pdf_text)
    }

    # Building Code Lineage
    code_editions = extract_code_editions(pdf_text)
    if code_editions:
        extracted_vars["building_code_lineage"] = {
            "adopted_code_editions": code_editions
        }

    # Building Characteristics
    extracted_vars["building_characteristics"] = {
        "occupancy_classification": extract_occupancy_classification(pdf_text),
        "building_size": extract_floor_info(pdf_text)
    }

    # Accessibility Features
    accessibility = extract_accessibility_features(pdf_text)
    if accessibility:
        extracted_vars["accessibility_features"] = accessibility

    # State Specific Programs
    if "California" in pdf_text or "CBC" in pdf_text:
        extracted_vars["state_specific_programs"] = {
            "california_cbc": {
                "applicable": True,
                "description": "CBC Ch. 11B mandatory for California projects"
            }
        }

    # Documentation
    doc_keywords = ["permit", "drawing", "plan", "specification", "delta"]
    found_docs = []
    for keyword in doc_keywords:
        if keyword in text_lower:
            found_docs.append(keyword)

    if found_docs:
        extracted_vars["documentation"] = {
            "document_types": found_docs
        }

    # Clean up None values
    extracted_vars = clean_nested_dict(extracted_vars)

    return extracted_vars

def clean_nested_dict(d):
    """Recursively remove None values from nested dictionary."""
    if not isinstance(d, dict):
        return d

    cleaned = {}
    for k, v in d.items():
        if isinstance(v, dict):
            v = clean_nested_dict(v)
            if v:  # Only add if the cleaned dict is not empty
                cleaned[k] = v
        elif v is not None:
            cleaned[k] = v

    return cleaned

def main():
    # Load the variable checklist
    checklist_path = Path(__file__).parent / "variable_checklist.yaml"
    checklist = load_variable_checklist(checklist_path)

    # Load the extracted PDF text
    pdf_text_path = Path(__file__).parent.parent.parent / "output" / "pdf_extracted_text.md"
    pdf_text = load_pdf_text(pdf_text_path)

    # Extract building variables
    variables = extract_building_variables(checklist, pdf_text)

    # Add metadata
    variables["_metadata"] = {
        "source_pdf": "2024_0925_636386 - 255 California St_5TH FLOOR_IFC set Delta 2.pdf",
        "extraction_date": str(Path(pdf_text_path).stat().st_mtime),
        "checklist_version": "variable_checklist.yaml"
    }

    # Save to YAML
    output_path = Path(__file__).parent.parent.parent / "output" / "vars_california_st.yaml"
    with open(output_path, 'w') as f:
        yaml.dump(variables, f, default_flow_style=False, sort_keys=False)

    print(f"Building variables extracted and saved to: {output_path}")
    print(f"\nExtracted {len(variables)} top-level categories")

    # Print summary
    print("\nSummary of extracted variables:")
    for category, values in variables.items():
        if category != "_metadata":
            print(f"  - {category}: {len(values) if isinstance(values, dict) else 1} items")

if __name__ == "__main__":
    main()