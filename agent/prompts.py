"""
Prompt templates for the agent service.

Centralized storage for all LLM prompts used in the pipeline.
"""

# =============================================================================
# TABLE EXTRACTION PROMPTS
# =============================================================================

TABLE_TYPE_HINTS = [
    "Window Schedule",
    "Door Schedule",
    "Room Finish Schedule",
    "Fixture Schedule",
    "Equipment Schedule",
    "Occupancy Load Table",
    "Fire Rating Schedule",
    "Structural Steel Schedule",
    "Plumbing Fixture Schedule",
    "Electrical Panel Schedule",
    "HVAC Equipment Schedule",
    "Code Compliance Summary",
    "General Notes",
    "Key Notes / Legend",
    "Material Legend",
    "Symbol Legend",
    "Abbreviations",
    "Project Data",
    "Building Area Summary",
    "Parking Summary",
    "Accessibility Summary",
    "Energy Compliance",
]

TABLE_EXTRACTION_MARKDOWN = """You are a building permit document analyst. Extract this table into Markdown format.

INSTRUCTIONS:
1. Preserve the EXACT structure of the table (rows and columns)
2. If cells are merged, repeat the value across merged cells
3. Use standard Markdown table syntax with | separators
4. If headers span multiple rows, flatten them into a single header row
5. Include ALL visible data - do not summarize or truncate
6. If text is handwritten or unclear, indicate with [illegible] or [unclear: best guess]
7. Preserve units (inches, feet, lbs, etc.) exactly as shown

OUTPUT FORMAT:
```markdown
| Header 1 | Header 2 | Header 3 |
|----------|----------|----------|
| Value 1  | Value 2  | Value 3  |
```

After the markdown table, provide:
- TABLE_TYPE: One of these or similar: {table_types}
- NOTES: Any important observations about the table content

Return ONLY the markdown table followed by TABLE_TYPE and NOTES lines.""".format(
    table_types=", ".join(TABLE_TYPE_HINTS[:10])
)

TABLE_EXTRACTION_JSON = """You are a building permit document analyst. Extract this table into structured JSON.

STRICT RULES:
1. Normalize column headers to snake_case (e.g., "Window ID" -> "window_id")
2. If cells are merged, repeat the value
3. Convert measurements to numbers with explicit units (e.g., {{"value": 36, "unit": "inches"}})
4. Boolean fields for compliance (true/false)
5. If text is illegible, use null with a note

OUTPUT SCHEMA:
{{
  "table_type": "Window Schedule | Door Schedule | Room Finish Schedule | ...",
  "headers": ["column1", "column2", ...],
  "rows": [
    {{"column1": "value", "column2": {{"value": 36, "unit": "inches"}}, ...}},
    ...
  ],
  "notes": "Any observations about data quality or special cases"
}}

Return ONLY valid JSON, no markdown code blocks."""

TABLE_OCR_REFINEMENT = """You are a building permit document analyst. I have raw OCR text from a table in a building permit document.
The OCR likely has errors: vertical lines misread as 'I' or '|', numbers confused with letters, merged text, etc.

RAW OCR TEXT:
{ocr_text}

TASK: Reconstruct this into a properly structured table. Use context clues to fix OCR errors.

COMMON OCR FIXES NEEDED:
- 'I' or '|' between words often means column separator
- 'O' vs '0' (letter vs number) - use context
- 'l' vs '1' (lowercase L vs one) - use context
- Merged words need spaces added
- Headers might be on multiple lines

OUTPUT: Return a JSON object:
{{
  "table_type": "Best guess at table type",
  "headers": ["column1", "column2", ...],
  "rows": [
    {{"column1": "value", "column2": "value", ...}},
    ...
  ],
  "confidence": "high" | "medium" | "low",
  "ocr_corrections": ["List of corrections made"]
}}

Return ONLY valid JSON."""


# =============================================================================
# ELEMENT DETECTION PROMPTS
# =============================================================================

ELEMENT_CLASSIFICATION = """You are analyzing a detected element from an architectural drawing.

Based on the image, classify this element and extract key properties.

ELEMENT TYPES:
- door: Entry/exit points with frames
- window: Glazed openings
- stair: Vertical circulation
- ramp: Accessible slopes
- parking: Vehicle spaces
- restroom: Toilet facilities
- elevator: Vertical transport
- corridor: Circulation paths
- room: Enclosed spaces
- other: Unclassified

OUTPUT JSON:
{{
  "element_type": "door | window | stair | ...",
  "confidence": 0.0-1.0,
  "properties": {{
    // Type-specific properties
  }},
  "accessibility_relevant": true | false,
  "notes": "Any observations"
}}

Return ONLY valid JSON."""


# =============================================================================
# COMPLIANCE ANALYSIS PROMPTS
# =============================================================================

COMPLIANCE_CHECK = """You are a California Building Code compliance analyst reviewing architectural drawings.

ELEMENT BEING CHECKED:
{element_description}

APPLICABLE CODE SECTIONS:
{code_sections}

TASK: Analyze the element for compliance with the listed code sections.

For each code section, determine:
1. COMPLIANT: Element meets requirements
2. NON-COMPLIANT: Element violates requirements (explain why)
3. UNCLEAR: Cannot determine from available information
4. NOT-APPLICABLE: Code section doesn't apply to this element

OUTPUT JSON:
{{
  "overall_status": "compliant | non-compliant | unclear",
  "section_results": {{
    "SECTION_NUMBER": {{
      "status": "compliant | non-compliant | unclear | not-applicable",
      "reasoning": "Brief explanation",
      "violation": null | {{
        "description": "What's wrong",
        "severity": "major | minor",
        "recommendation": "How to fix"
      }}
    }}
  }},
  "summary": "Overall assessment"
}}

Return ONLY valid JSON."""


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

def get_table_extraction_prompt(method: str = "markdown") -> str:
    """Get the appropriate table extraction prompt."""
    if method == "json":
        return TABLE_EXTRACTION_JSON
    return TABLE_EXTRACTION_MARKDOWN


def get_ocr_refinement_prompt(ocr_text: str) -> str:
    """Get OCR refinement prompt with text inserted."""
    return TABLE_OCR_REFINEMENT.format(ocr_text=ocr_text)


def get_compliance_prompt(element_description: str, code_sections: str) -> str:
    """Get compliance check prompt with element and code sections."""
    return COMPLIANCE_CHECK.format(
        element_description=element_description,
        code_sections=code_sections
    )
