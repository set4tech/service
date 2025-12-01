# PDF Parsing Pipeline Overview

This document describes the full pipeline for processing architectural PDFs into structured JSON data.

## Quick Start

```bash
bash run_full_pipeline.sh path/to/drawings.pdf
```

**Output:** `unified_document_data.json` - Complete structured data from the PDF

---

## Pipeline Steps (12 Total)

### Step 1: PDF to PNG Conversion ✅

**Script:** `main.py` (`pdf_to_images`)

- **Input:** PDF file
- **Output:** `pdf_output_pngs/*.png` (one per page)
- Converts at 150 DPI (configurable via `PDF_DPI`)

---

### Step 2: YOLO Object Detection ✅

**Script:** `main.py` (`run_yolo_inference`)

- **Input:** PNG images
- **Output:** `detections.json`
- Detects 4 classes: `image`, `table`, `legend`, `text_box`
- Returns bounding boxes with confidence scores

---

### Step 3: Page Text Extraction ✅

**Script:** `steps/extract_text.py`

- **Input:** Original PDF
- **Output:** `ctx.metadata["extracted_text"]`
- Extracts raw text via PyMuPDF
- Cleans with Gemini (removes fragments, organizes sections)

---

### Step 4: OCR on Detected Regions ✅

**Script:** `steps/ocr_bboxes.py`

- **Input:** Page images + detections
- **Output:** `ctx.metadata["bbox_ocr"]`
- Runs Tesseract OCR on each detected region

---

### Step 5: VLM Image Analysis ✅

**Script:** `steps/analyze_images.py`

- **Input:** Page images + detections
- **Output:** `ctx.metadata["image_analysis"]`
- Uses Gemini to analyze architectural drawings
- Extracts: view type, content tags, room labels, dimensions, keywords

---

### Step 6: Project Metadata Extraction ✅

**Script:** `steps/extract_project_info.py`

- **Input:** PNG images (first 3 pages)
- **Output:** `ctx.metadata["project_info"]`
- Extracts from cover sheets:
  - Project name, address
  - Building area, stories
  - Construction type, occupancy
  - Sprinkler status

---

### Step 7: Sheet Info Extraction ✅

**Script:** `steps/extract_sheet_info.py`

- **Input:** PNG images
- **Output:** `ctx.metadata["sheet_info"]`
- Extracts per-page: sheet number, sheet title from title block

---

### Step 8: Element Tag Extraction

**Script:** `extract_element_tags.py`

- **Input:** PNG images + detections.json
- **Output:** `element_tags_extracted.json`
- Extracts architectural tags:
  - Door tags (D-1, D-01)
  - Window tags (W-1, WIN-01)
  - Room numbers (101, R-1)
  - Detail/section/elevation markers

---

### Step 9: Table Extraction ✅

**Script:** `steps/extract_tables.py`

- **Input:** PNG images + detections
- **Output:** `ctx.metadata["extracted_tables"]`
- Extracts structured tables (Door Schedule, Window Schedule, etc.)
- Multiple strategies: VLM markdown, direct JSON, hybrid OCR+LLM

---

### Step 10: Legend Extraction ✅

**Script:** `steps/extract_legends.py`

- **Input:** `ctx.metadata["extracted_tables"]` from Step 9
- **Output:** `ctx.metadata["extracted_legends"]`
- Post-processes table extraction to identify legend-type tables
- Restructures into legend format with symbol/meaning entries
- Categorizes by type (material, demolition, new work, symbol, keynote, etc.)

---

### Step 11: Tag-to-Legend Matching

**Script:** `match_tags_to_legends.py`

- **Input:** element_tags_extracted.json + legends_extracted.json
- **Output:** `tags_matched_to_legends.json`
- Matches extracted tags to legend definitions

---

### Step 12: Final Unification

**Script:** `unify_extracted_data.py`

- **Input:** All JSON outputs from Steps 1-11
- **Output:** `unified_document_data.json` (FINAL)
- Merges all data by page and bounding box
- Uses 70% IoU threshold for fuzzy bbox matching

---

## Data Flow Diagram

```
PDF File
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│  Step 1: pdf_to_png.py                                      │
│  Output: pdf_output_pngs/*.png                              │
└─────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│  Step 2: run_yolo.py                                        │
│  Output: detections.json (bboxes for images/tables/legends) │
└─────────────────────────────────────────────────────────────┘
    │
    ├──────────────────────────────────────────────────────────┐
    │                                                          │
    ▼                                                          ▼
┌────────────────────┐  ┌────────────────────┐  ┌────────────────────┐
│ Step 3: Text       │  │ Step 4: OCR        │  │ Step 5: VLM        │
│ extract_text.py    │  │ ocr_bboxes.py      │  │ analyze_images.py  │
│ → page_text.json   │  │ → bbox_text.json   │  │ → image_analysis   │
└────────────────────┘  └────────────────────┘  └────────────────────┘
    │                                                          │
    ├──────────────────────────────────────────────────────────┤
    │                                                          │
    ▼                                                          ▼
┌────────────────────┐  ┌────────────────────┐  ┌────────────────────┐
│ Step 6: Project    │  │ Step 7: Sheet      │  │ Step 8: Element    │
│ extract_project_   │  │ extract_sheet_     │  │ extract_element_   │
│ info.py            │  │ info.py            │  │ tags.py            │
│ → project_info     │  │ → sheet_info.json  │  │ → element_tags     │
└────────────────────┘  └────────────────────┘  └────────────────────┘
    │                                                          │
    ├──────────────────────────────────────────────────────────┤
    │                                                          │
    ▼                                                          ▼
┌────────────────────┐  ┌────────────────────┐  ┌────────────────────┐
│ Step 9: Tables     │  │ Step 10: Legends   │  │ Step 11: Match     │
│ extract_tables.py  │  │ extract_legends.py │  │ match_tags_to_     │
│ → tables_extracted │  │ → legends_extracted│  │ legends.py         │
└────────────────────┘  └────────────────────┘  └────────────────────┘
    │                          │                       │
    └──────────────────────────┴───────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│  Step 12: unify_extracted_data.py                           │
│  Output: unified_document_data.json (FINAL)                 │
└─────────────────────────────────────────────────────────────┘
```

---

## Final Output Structure

```json
{
  "metadata": {
    "source_files": { ... },
    "generated_at": "2025-11-28T10:05:17",
    "total_pages": 25,
    "all_legend_entries": [ ... ]
  },

  "project_info": {
    "project_name": "...",
    "construction_type": "Type V-B",
    "occupancy_classification": "E",
    "building_area": 50000,
    "num_stories": 2,
    "sprinklers": true
  },

  "pages": {
    "1": {
      "page_file": "achieve_page_1.png",
      "sheet_number": "G0.00",
      "sheet_title": "COVER SHEET",
      "page_text": { "raw": "...", "cleaned": "..." },
      "sections": [
        {
          "bbox": [x1, y1, x2, y2],
          "section_type": "image|table|legend|text_box",
          "detection_confidence": 0.95,

          // For images:
          "image_data": { "view_type": "...", "content_tags": [...] },
          "element_tags": { "door_tags": [...], "window_tags": [...] },
          "tag_legend_matches": { ... },

          // For tables:
          "table_data": { "table_type": "...", "headers": {...}, "rows": [...] },

          // For legends:
          "legend_data": { "legend_type": "...", "entries": [...] },

          // OCR text (all sections):
          "ocr_text": "..."
        }
      ]
    }
  }
}
```

---

## Dependencies

### Python Libraries

```
pdf2image          # PDF to PNG (requires Poppler)
pillow             # Image processing
ultralytics        # YOLO inference
pytesseract        # OCR (requires Tesseract)
google-generativeai # Gemini VLM
openai             # GPT-4o-mini for text cleaning
PyMuPDF (fitz)     # PDF text extraction
```

### System Packages

```
poppler            # PDF rendering backend
tesseract          # OCR engine
```

### API Keys (in ../.env)

```
GEMINI_API_KEY     # Required - Gemini VLM analysis
OPENAI_API_KEY     # Optional - GPT-4o-mini text cleaning
```

---

## Optional: Tag Resolution

For advanced tag disambiguation, run separately:

**Script:** `resolve_tags.py`

- **Output:** `tag_resolution.json`
- Uses rule-based matching to tables/legends
- Faster than LLM-based matching
