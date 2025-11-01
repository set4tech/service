"""
Normalize JSON output to deterministic format.
Useful for preparing baseline files for comparison.

Usage: python normalize_json.py cbc_2025.json
"""

import json
import sys
from pathlib import Path


def sort_code_data(data: dict) -> dict:
    """Sort all data structures in the code data for deterministic output."""
    
    # Sort sections by number
    if "sections" in data:
        data["sections"].sort(key=lambda s: s["number"])
        
        for section in data["sections"]:
            # Sort subsections by number
            if "subsections" in section:
                section["subsections"].sort(key=lambda ss: ss["number"])
            
            # Sort section-level lists
            if "figures" in section:
                section["figures"].sort()
            
            # Sort subsections
            for subsection in section.get("subsections", []):
                # Sort subsection-level lists
                if "refers_to" in subsection:
                    subsection["refers_to"].sort()
                if "figures" in subsection:
                    subsection["figures"].sort()
                # Sort tables by number
                if "tables" in subsection:
                    subsection["tables"].sort(key=lambda t: t["number"])
    
    return data


def main():
    if len(sys.argv) != 2:
        print("Usage: python normalize_json.py <json_file>")
        sys.exit(1)
    
    input_file = sys.argv[1]
    
    if not Path(input_file).exists():
        print(f"Error: File not found: {input_file}")
        sys.exit(1)
    
    # Read JSON
    print(f"Reading {input_file}...")
    with open(input_file, "r") as f:
        data = json.load(f)
    
    # Sort data
    print("Sorting data structures...")
    data = sort_code_data(data)
    
    # Create output filename
    output_file = input_file.replace(".json", "_normalized.json")
    
    # Write sorted JSON
    print(f"Writing to {output_file}...")
    with open(output_file, "w") as f:
        json.dump(data, f, indent=2, sort_keys=True)
    
    print(f"✅ Done! Normalized JSON saved to: {output_file}")
    print(f"\nTo replace original:")
    print(f"  mv {output_file} {input_file}")


if __name__ == "__main__":
    main()

