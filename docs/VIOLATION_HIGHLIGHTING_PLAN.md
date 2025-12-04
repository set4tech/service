# Violation Highlighting: Visual Grounding Implementation Plan

## Goal

When the compliance agent identifies a code violation, highlight the relevant region on the architectural drawing so users can see exactly what Claude is referring to.

Current state: Claude outputs violations with prose descriptions like `"location_in_evidence": "Door D-01 on sheet A2.01 shows 32\" clear width"`. Users have to manually find this on the drawings.

Target state: Each violation includes bounding box coordinates. The frontend renders a highlight overlay on the relevant sheet image, pointing users directly to the problem area.

## Why This Is Hard

Claude cannot output reliable pixel coordinates. Anthropic's vision API was not trained for spatial localization—when asked for bounding boxes, it hallucinates. This is a documented limitation, not a bug.

We already run YOLO detection during preprocessing, but those detections don't map cleanly to compliance violations:
- YOLO detects tables, legends, images, text boxes—not "the door that violates clearance requirements"
- Element tags (D-01, W-1) mark where the tag text appears, not where the actual door is on the floor plan
- Violations often involve spatial relationships or schedule data, not discrete detected objects

## Approach: Gemini Grounding Subagent

Google Gemini is the only major vision API trained to output bounding boxes. We use Claude for compliance reasoning (where it excels), then pass violation descriptions to Gemini to locate them on the drawings.

```
┌─────────────────────────────────────────────────────────────────┐
│                     Compliance Assessment Flow                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   Screenshots + Code Section                                     │
│            │                                                     │
│            ▼                                                     │
│   ┌─────────────────┐                                           │
│   │  Claude Agent   │  Analyzes compliance, identifies          │
│   │                 │  violations with descriptions             │
│   └────────┬────────┘                                           │
│            │                                                     │
│            ▼                                                     │
│   Output: {                                                      │
│     violations: [{                                               │
│       description: "Door D-01 width is 32\", requires 34\"",    │
│       location_description: "Door D-01 in lobby, sheet A2.01",  │
│       sheet_number: "A2.01"                                      │
│     }]                                                           │
│   }                                                              │
│            │                                                     │
│            ▼                                                     │
│   ┌─────────────────┐                                           │
│   │ Gemini Grounder │  For each violation, locate the           │
│   │   (per violation)│  described element on the sheet          │
│   └────────┬────────┘                                           │
│            │                                                     │
│            ▼                                                     │
│   Output: {                                                      │
│     violations: [{                                               │
│       ...                                                        │
│       bbox: [x1, y1, x2, y2]  // pixel coordinates              │
│     }]                                                           │
│   }                                                              │
│            │                                                     │
│            ▼                                                     │
│   Frontend renders highlight overlay on sheet image              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Schema Changes

### Violation Output Schema (Updated)

```python
class Violation(BaseModel):
    description: str
    severity: Literal["critical", "major", "minor"]

    # NEW: For Gemini grounding
    location_description: str  # Detailed description for Gemini to locate
    sheet_number: str          # Which sheet contains the violation

    # NEW: Populated by grounding step
    bbox: Optional[list[int]] = None  # [x1, y1, x2, y2] in pixels
    grounding_confidence: Optional[str] = None  # "high", "medium", "low", "failed"
```

### Full Compliance Result Schema

```python
class ComplianceResult(BaseModel):
    compliance_status: Literal["compliant", "non_compliant", "needs_more_info", "not_applicable"]
    confidence: Literal["high", "medium", "low"]
    ai_reasoning: str
    violations: list[Violation]
    compliant_aspects: list[str]
    recommendations: list[str]
    additional_evidence_needed: list[str]
```

### SSE Event for Grounding Progress (Optional)

```python
# New event type to show grounding in progress
{"type": "grounding", "violation_index": 0, "status": "locating"}
{"type": "grounding", "violation_index": 0, "status": "complete", "bbox": [100, 200, 300, 400]}
```

## Implementation

### 1. Update Compliance System Prompt

Add to `COMPLIANCE_SYSTEM_PROMPT`:

```
## Violation Location Requirements

For each violation, you MUST provide:
- location_description: A specific description of where this violation appears in the drawings.
  Include: element tag/mark (D-01, W-1), room name or number, position on sheet (north wall,
  near entrance), and any other identifying details. Be specific enough that someone could
  find it by reading your description.
- sheet_number: The exact sheet number where this violation is visible (e.g., "A2.01", "A1.0")

Example:
{
  "description": "Door D-01 has 32\" clear width, CBC 11B-404.2.3 requires minimum 34\"",
  "severity": "major",
  "location_description": "Door D-01, the main entry door on the north wall of Room 101 (Lobby), shown on sheet A2.01. Also referenced in Door Schedule on sheet A0.02, row for mark D-01.",
  "sheet_number": "A2.01"
}
```

### 2. Gemini Grounding Module

Create `grounding.py`:

```python
import asyncio
from PIL import Image
from typing import Optional
from vlm import call_gemini_async  # Your existing Gemini wrapper

GROUNDING_PROMPT = """Locate this element in the architectural drawing:

"{description}"

Instructions:
- Find the specific element, door, window, room, or area described
- Return the bounding box that contains it
- Use the coordinate system [y_min, x_min, y_max, x_max] scaled 0-1000
- If you cannot locate it with confidence, return null

Return JSON only:
{{"box_2d": [y_min, x_min, y_max, x_max]}}
or
{{"box_2d": null, "reason": "brief explanation"}}
"""


async def ground_violation(
    location_description: str,
    page_image: Image.Image,
) -> dict:
    """
    Use Gemini to locate a described element on an architectural drawing.

    Returns:
        {
            "bbox": [x1, y1, x2, y2] in pixels, or None if not found
            "grounding_confidence": "high" | "medium" | "low" | "failed"
            "grounding_reason": str (if failed)
        }
    """
    prompt = GROUNDING_PROMPT.format(description=location_description)

    try:
        response = await call_gemini_async(prompt, page_image, json_mode=True)
    except Exception as e:
        return {
            "bbox": None,
            "grounding_confidence": "failed",
            "grounding_reason": f"Gemini API error: {str(e)}"
        }

    box = response.get("box_2d")

    if box is None:
        return {
            "bbox": None,
            "grounding_confidence": "failed",
            "grounding_reason": response.get("reason", "Element not found")
        }

    # Convert from 0-1000 scale to pixel coordinates
    # Gemini returns [y_min, x_min, y_max, x_max]
    w, h = page_image.size
    bbox_pixels = [
        int(box[1] * w / 1000),  # x1 (from x_min)
        int(box[0] * h / 1000),  # y1 (from y_min)
        int(box[3] * w / 1000),  # x2 (from x_max)
        int(box[2] * h / 1000),  # y2 (from y_max)
    ]

    return {
        "bbox": bbox_pixels,
        "grounding_confidence": "medium",  # Could refine based on box size, etc.
    }


async def ground_all_violations(
    violations: list[dict],
    page_images: dict[str, Image.Image],  # sheet_number -> Image
    max_concurrency: int = 5,
) -> list[dict]:
    """
    Ground all violations in parallel.

    Args:
        violations: List of violation dicts with location_description and sheet_number
        page_images: Mapping of sheet numbers to PIL Images

    Returns:
        violations with bbox and grounding_confidence added
    """
    semaphore = asyncio.Semaphore(max_concurrency)

    async def ground_one(violation: dict) -> dict:
        async with semaphore:
            result = dict(violation)

            sheet = violation.get("sheet_number")
            desc = violation.get("location_description")

            if not sheet or not desc:
                result["bbox"] = None
                result["grounding_confidence"] = "failed"
                result["grounding_reason"] = "Missing sheet_number or location_description"
                return result

            # Try to find the page image
            page_image = page_images.get(sheet)

            # Also try matching by page index if sheet number doesn't match directly
            if page_image is None:
                # Could add fuzzy matching here
                result["bbox"] = None
                result["grounding_confidence"] = "failed"
                result["grounding_reason"] = f"Sheet {sheet} not found in page images"
                return result

            grounding = await ground_violation(desc, page_image)
            result.update(grounding)
            return result

    tasks = [ground_one(v) for v in violations]
    return await asyncio.gather(*tasks)
```

### 3. Integrate into Compliance Agent

Update `compliance_agent.py`:

```python
from grounding import ground_all_violations

class ComplianceAgent:
    def __init__(
        self,
        unified_json: dict,
        images_dir: Optional[Path] = None,
        model: str = "claude-opus-4-5-20251101",
        max_iterations: int = 15,
    ):
        # ... existing code ...
        self.unified_json = unified_json  # NEW: Store for grounding

    async def assess_check_stream(
        self,
        code_section: dict,
        building_context: dict,
        screenshots: list[str],
        enable_grounding: bool = False,  # NEW: Optional grounding
    ) -> AsyncGenerator[dict, None]:

        # ... existing Claude agent loop ...

        # After Claude returns final assessment:
        if response.stop_reason == "end_turn" and not tool_calls:
            result = self._parse_final_assessment(final_text)
            result["reasoning_trace"] = self.reasoning_trace

            # NEW: Ground violations (optional)
            if enable_grounding and result.get("violations"):
                yield {"type": "grounding_start", "count": len(result["violations"])}

                # Load page images for grounding
                page_images = await self._load_page_images_by_sheet()

                # Ground all violations
                grounded_violations = await ground_all_violations(
                    result["violations"],
                    page_images,
                )
                result["violations"] = grounded_violations

                yield {"type": "grounding_complete"}

            yield {"type": "done", "result": result}
            return

    async def _load_page_images_by_sheet(self) -> dict[str, Image.Image]:
        """Load page images indexed by sheet number."""
        images = {}
        for page_key, page_data in self.unified_json.get("pages", {}).items():
            sheet_number = page_data.get("sheet_number")
            if sheet_number and self.images_dir:
                page_file = page_data.get("page_file")
                if page_file:
                    img_path = self.images_dir / page_file
                    if img_path.exists():
                        images[sheet_number] = Image.open(img_path)
        return images
```

**Note**: Grounding is disabled by default (`enable_grounding=False`) to allow gradual rollout. Enable it per-request or flip the default once validated.

### 4. Update API Endpoint

Update `/assess` endpoint to accept `enable_grounding` parameter:

```python
# POST /assess request body
{
    "assessment_id": "...",
    "check_id": "...",
    "enable_grounding": true  # Optional, defaults to false
}
```

SSE events now include:
{"type": "thinking", "content": "..."}
{"type": "tool_use", "tool": "...", "input": {...}}
{"type": "tool_result", "tool": "...", "result": {...}}
{"type": "grounding_start", "count": 3}
{"type": "grounding_complete"}
{"type": "done", "result": {
    "compliance_status": "non_compliant",
    "violations": [
        {
            "description": "Door D-01 has 32\" clear width...",
            "severity": "major",
            "location_description": "Door D-01, main entry...",
            "sheet_number": "A2.01",
            "bbox": [450, 200, 550, 350],
            "grounding_confidence": "medium"
        }
    ],
    ...
}}
```

### 5. Frontend Integration

The frontend receives violations with `bbox` arrays and `sheet_number`. To render:

```typescript
interface Violation {
  description: string;
  severity: "critical" | "major" | "minor";
  sheet_number: string;
  bbox: [number, number, number, number] | null;  // [x1, y1, x2, y2]
  grounding_confidence: "high" | "medium" | "low" | "failed";
}

// Render highlight overlay on the sheet image
function renderViolationHighlight(
  violation: Violation,
  imageElement: HTMLImageElement,
  containerElement: HTMLDivElement
) {
  if (!violation.bbox) return;

  const [x1, y1, x2, y2] = violation.bbox;

  // Scale bbox to displayed image size
  const scaleX = imageElement.clientWidth / imageElement.naturalWidth;
  const scaleY = imageElement.clientHeight / imageElement.naturalHeight;

  const highlight = document.createElement("div");
  highlight.className = "violation-highlight";
  highlight.style.position = "absolute";
  highlight.style.left = `${x1 * scaleX}px`;
  highlight.style.top = `${y1 * scaleY}px`;
  highlight.style.width = `${(x2 - x1) * scaleX}px`;
  highlight.style.height = `${(y2 - y1) * scaleY}px`;
  highlight.style.border = "3px solid red";
  highlight.style.backgroundColor = "rgba(255, 0, 0, 0.1)";
  highlight.style.pointerEvents = "none";

  containerElement.appendChild(highlight);
}
```

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `grounding.py` | Create | Gemini grounding module |
| `compliance_agent.py` | Modify | Add grounding step after Claude assessment |
| `prompts.py` | Modify | Update COMPLIANCE_SYSTEM_PROMPT |
| `main.py` | Modify | Update SSE event types if needed |

## Risks and Mitigations

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Gemini can't locate elements on architectural drawings | Medium | Degrade gracefully—show violation without highlight. Improve prompts iteratively. |
| Claude doesn't output good location_description | Medium | Update system prompt with examples. Validate output schema. |
| Latency increase from Gemini calls | High | Run grounding in parallel. Consider async/background processing. |
| Sheet number mismatch between Claude output and page index | Medium | Build sheet number index during preprocessing. Add fuzzy matching. |

## Future Improvements

1. **Fallback to YOLO detections**: If Gemini fails but Claude references an element tag (D-01), look it up in the existing element_tags extraction.

2. **Confidence calibration**: Track grounding accuracy over time, adjust confidence levels.

3. **Multi-region highlighting**: Some violations span multiple areas (e.g., accessible route). Support multiple bboxes per violation.

4. **Caching**: Cache grounding results for repeated assessments on the same drawings.

5. **Set-of-Mark prompting**: If Gemini accuracy is poor, try overlaying numbered markers on detected elements during preprocessing, then have Claude reference marker IDs.

## Testing Plan

1. **Unit test grounding module**: Mock Gemini responses, verify coordinate conversion.

2. **Integration test**: Run full assessment on a test PDF, verify violations include bboxes.

3. **Manual QA**: Review 10-20 grounded violations across different drawing types (floor plans, schedules, details). Track accuracy.

4. **A/B comparison**: Run assessments with and without grounding, compare user feedback.
