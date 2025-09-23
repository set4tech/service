import yaml
import json
from pathlib import Path
import google.generativeai as genai
import os

def load_variable_checklist(yaml_path="variable_checklist.yaml"):
    """Load the variable checklist from YAML file."""
    with open(yaml_path, 'r') as f:
        return yaml.safe_load(f)

def load_pdf_text(text_path="../../output/pdf_extracted_text.md"):
    """Load the extracted PDF text."""
    with open(text_path, 'r', encoding='utf-8') as f:
        return f.read()

def extract_with_gemini(checklist, pdf_text):
    """Use Gemini to extract building variables from the PDF text."""

    # Configure Gemini
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("Please set GEMINI_API_KEY environment variable")

    genai.configure(api_key=api_key)
    model = genai.GenerativeModel('gemini-2.0-flash-exp')

    # Create prompt
    prompt = f"""You are an expert at extracting building code and accessibility compliance information from construction documents.

I have a PDF document about a building project and a checklist of variables to extract. Please analyze the document and extract values for each variable in the checklist.

VARIABLE CHECKLIST (this defines what to look for):
{yaml.dump(checklist, default_flow_style=False)}

DOCUMENT TEXT TO ANALYZE:
{pdf_text}

INSTRUCTIONS:
1. Carefully read through the entire document
2. Extract specific values for each variable in the checklist where information is available
3. For each category, extract actual values found in the document (not just descriptions)
4. If specific information is not found, omit that field (don't guess)
5. Pay special attention to:
   - Exact addresses and locations
   - Specific code editions and years (IBC, CBC, ADA, etc.)
   - Dates (permit, construction, etc.)
   - Building classifications and occupancy types
   - Square footage and floor information
   - Any California-specific requirements (CBC Chapter 11B)

Return the extracted variables as a valid YAML structure that follows the same organization as the checklist.
Only include fields where you found actual information in the document.

OUTPUT FORMAT: Return only valid YAML with the extracted values, no explanations or markdown formatting."""

    # Get response from Gemini
    response = model.generate_content(prompt)

    # Parse the YAML response
    try:
        # Clean up response if it has markdown formatting
        yaml_text = response.text
        if "```yaml" in yaml_text:
            yaml_text = yaml_text.split("```yaml")[1].split("```")[0]
        elif "```" in yaml_text:
            yaml_text = yaml_text.split("```")[1].split("```")[0]

        extracted_vars = yaml.safe_load(yaml_text)
        return extracted_vars
    except Exception as e:
        print(f"Error parsing YAML response: {e}")
        print("Raw response:")
        print(response.text)
        return {}

def main():
    # Load the variable checklist
    checklist_path = Path(__file__).parent / "variable_checklist.yaml"
    checklist = load_variable_checklist(checklist_path)

    # Load the extracted PDF text
    pdf_text_path = Path(__file__).parent.parent.parent / "output" / "pdf_extracted_text.md"
    pdf_text = load_pdf_text(pdf_text_path)

    print(f"Loaded PDF text: {len(pdf_text)} characters")
    print("Sending to Gemini for extraction...")

    # Extract building variables using Gemini
    variables = extract_with_gemini(checklist, pdf_text)

    # Add metadata
    variables["_metadata"] = {
        "source_pdf": "2024_0925_636386 - 255 California St_5TH FLOOR_IFC set Delta 2.pdf",
        "extraction_method": "gemini-2.0-flash-exp",
        "checklist_version": "variable_checklist.yaml"
    }

    # Save to YAML
    output_path = Path(__file__).parent.parent.parent / "output" / "vars_california_st.yaml"
    with open(output_path, 'w') as f:
        yaml.dump(variables, f, default_flow_style=False, sort_keys=False, allow_unicode=True)

    print(f"\nBuilding variables extracted and saved to: {output_path}")
    print(f"Extracted {len(variables)} top-level categories")

    # Print summary
    print("\nSummary of extracted variables:")
    for category, values in variables.items():
        if category != "_metadata":
            if isinstance(values, dict):
                print(f"  - {category}: {len(values)} items")
            else:
                print(f"  - {category}: {values}")

if __name__ == "__main__":
    main()