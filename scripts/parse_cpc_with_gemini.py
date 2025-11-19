#!/usr/bin/env python3
"""
Parse California Plumbing Code markdown files using Gemini 3 Pro.
Converts messy CPC markdown to unified JSON schema format.
"""

import json
import os
from pathlib import Path
from google import genai
from google.genai import types

# Initialize Gemini client
client = genai.Client(api_key=os.environ.get("GOOGLE_API_KEY") or os.environ.get("GEMINI_API_KEY"))

PARSING_PROMPT = """
You are parsing the California Plumbing Code 2022 into a structured JSON format.

**IMPORTANT: Ignore all tables and tabular data. Skip them entirely.**

Parse the provided markdown content into this exact JSON schema:

{
  "provider": "IAPMO",
  "version": 2022,
  "jurisdiction": "CA",
  "source_id": "CPC",
  "title": "California Plumbing Code 2022",
  "source_url": "https://codes.iccsafe.org/content/CPC2022P1",
  "chapters_included": ["CHAPTER_NUMBER"],
  "sections": [
    {
      "key": "SECTION_NUMBER",
      "number": "SECTION_NUMBER",
      "title": "Section Title",
      "text": "Optional section text if present",
      "chapter": "CHAPTER_NUMBER",
      "source_url": "",
      "figures": [],
      "subsections": [
        {
          "key": "SUBSECTION_NUMBER",
          "number": "SUBSECTION_NUMBER",
          "title": "Subsection Title",
          "paragraphs": ["paragraph text here"],
          "refers_to": [],
          "tables": [],
          "figures": []
        }
      ]
    }
  ]
}

**Rules:**
1. Extract section numbers (e.g., "401.0", "401.1", "402.6.1")
2. Section titles are the headings after the numbers
3. Parse hierarchically: top-level sections (e.g., 401.0) contain subsections (401.1, 401.2, etc.)
4. Multi-level subsections like 402.6.1 should be nested under 402.6
5. Extract paragraph text under each subsection
6. Skip all matrix tables, reference tables, and tabular data
7. Skip navigation elements, headers, footers
8. The "chapters_included" array should contain just the chapter number(s) present in this file
9. Set chapter field to the chapter number (e.g., "3", "4", "11", etc.)
10. If you find references to other sections (like "Chapter 6" or "Section 401.2"), add them to refers_to array

**Output only valid JSON. No explanations, no markdown code blocks, just the raw JSON.**
"""

def parse_cpc_file(file_path: Path) -> dict:
    """Parse a single CPC markdown file using Gemini 3 Pro."""
    print(f"Parsing {file_path.name}...", flush=True)

    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Send to Gemini 3 Pro
    response = client.models.generate_content(
        model="gemini-3-pro-preview",
        contents=[
            types.Content(
                role="user",
                parts=[
                    types.Part(text=PARSING_PROMPT),
                    types.Part(text=f"\n\nMarkdown content to parse:\n\n{content}")
                ]
            )
        ],
        config=types.GenerateContentConfig(
            temperature=0.0,  # Deterministic parsing
            max_output_tokens=100000,  # Large output for full chapters
        )
    )

    # Parse JSON response
    response_text = response.text.strip()

    # Remove markdown code blocks if present (just in case)
    if response_text.startswith("```"):
        lines = response_text.split("\n")
        response_text = "\n".join(lines[1:-1]) if len(lines) > 2 else response_text
        if response_text.startswith("json"):
            response_text = response_text[4:].strip()

    try:
        parsed_data = json.loads(response_text)
        print(f"  ✓ Successfully parsed {len(parsed_data.get('sections', []))} sections", flush=True)
        return parsed_data
    except json.JSONDecodeError as e:
        print(f"  ✗ Failed to parse JSON response: {e}", flush=True)
        print(f"  Response preview: {response_text[:500]}...", flush=True)
        raise

def main():
    cpc_dir = Path("/Users/will/code/service/cpc")
    output_dir = Path("/Users/will/code/service/output")
    output_dir.mkdir(exist_ok=True)

    # Get all markdown files
    md_files = sorted(cpc_dir.glob("*.md"))
    print(f"Found {len(md_files)} CPC markdown files", flush=True)

    for md_file in md_files:
        try:
            parsed_data = parse_cpc_file(md_file)

            # Save to output
            output_file = output_dir / f"{md_file.stem}_parsed.json"
            with open(output_file, 'w', encoding='utf-8') as f:
                json.dump(parsed_data, f, indent=2, ensure_ascii=False)

            print(f"  ✓ Saved to {output_file}\n", flush=True)

        except Exception as e:
            print(f"  ✗ Error processing {md_file.name}: {e}\n", flush=True)
            continue

if __name__ == "__main__":
    main()
