"""
Compliance Agent for Building Code Assessment

Streaming agent that assesses building code compliance for a single check,
using Claude with tool_use to reason about compliance and produce structured output.

Streams SSE chunks:
- {"type": "thinking", "content": "..."}
- {"type": "tool_use", "tool": "...", "tool_use_id": "...", "input": {...}}
- {"type": "tool_result", "tool": "...", "tool_use_id": "...", "result": {...}}
- {"type": "done", "result": {...}}
- {"type": "error", "message": "..."}
"""

import json
import logging
import re
from pathlib import Path
from typing import AsyncGenerator, Optional, Any

from anthropic import Anthropic

from chat_tools import DocumentNavigator
from compliance_tools import ComplianceToolExecutor, COMPLIANCE_TOOLS
from tracing import get_langfuse, create_trace_span, create_child_span, end_span

logger = logging.getLogger(__name__)


# =============================================================================
# SYSTEM PROMPT
# =============================================================================

COMPLIANCE_SYSTEM_PROMPT = """You are an expert building code compliance analyst specializing in California Building Code (CBC) accessibility requirements.

Your task is to assess compliance for a SINGLE code section based on the provided evidence (screenshots of architectural drawings and extracted document data).

## Assessment Process

1. **Understand the Code Section**: Read the code section number, title, text, and requirements carefully.

2. **Gather Evidence**: Use the available tools to search the architectural drawings for:
   - Relevant schedules (door, window, finish schedules)
   - Element dimensions and attributes
   - Site and project information
   - Specific details mentioned in the code requirements

3. **Analyze Compliance**: For each requirement in the code section:
   - Identify what evidence is needed to verify compliance
   - Determine if the evidence shows compliance or non-compliance
   - Note any missing information that would be needed for a complete assessment

4. **Provide Assessment**: Give a clear compliance determination with supporting reasoning.

## Tools Available

Document Navigation:
- find_schedules: Find door/window/finish schedules
- search_drawings: Search pages for keywords
- get_room_list: Get rooms with areas and occupancy
- get_project_info: Get project metadata
- get_sheet_list: List all sheets
- read_sheet_details: Read specific sheet content
- get_keynotes: Get keynotes and notes
- view_sheet_image: View a sheet image directly (for visual inspection)

Calculations & Parsing:
- calculate: Evaluate math expressions (area calculations, percentages)
- parse_dimension: Parse architectural dimensions (3'-6", 36", etc.)
- compare_dimensions: Compare two dimensions
- check_clearance_requirement: Check if dimension meets minimum

Element Data:
- get_site_data: Get construction type, occupancy, fire separation
- get_elements_by_type: Find all doors, windows, stairs, etc.
- get_element_attributes: Get details for specific element by tag

Lookups:
- lookup_cbc_table: Look up CBC table values (parking, accessible routes)

## Output Format

Your final response MUST be valid JSON in this format:

```json
{
  "compliance_status": "compliant|non_compliant|needs_more_info|not_applicable",
  "confidence": "high|medium|low",
  "ai_reasoning": "Summary of the assessment reasoning...",
  "violations": [
    {
      "description": "What the violation is",
      "severity": "critical|major|minor",
      "location_in_evidence": "Where in the drawings/schedules this was found"
    }
  ],
  "compliant_aspects": ["Aspect 1 that complies", "Aspect 2 that complies"],
  "recommendations": ["Recommendation 1", "Recommendation 2"],
  "additional_evidence_needed": ["What additional info would help", "Missing data"]
}
```

## Guidelines

- Be thorough but focused on the specific code section being assessed
- Use tools to gather evidence before making determinations
- If you cannot find sufficient evidence, mark as "needs_more_info" rather than guessing
- Cite specific drawings, schedules, or locations when referencing evidence
- Use the calculation tools for dimensional checks rather than mental math
- If the code section doesn't apply to this building type, mark as "not_applicable"
"""


# =============================================================================
# COMPLIANCE AGENT
# =============================================================================

class ComplianceAgent:
    """
    Streaming compliance assessment agent.

    Uses Claude with tool_use to reason about building code compliance
    and produce structured assessment output.
    """

    def __init__(
        self,
        unified_json: dict,
        images_dir: Optional[Path] = None,
        model: str = "claude-opus-4-5-20251101",
        max_iterations: int = 15,
    ):
        """
        Initialize the compliance agent.

        Args:
            unified_json: The unified document JSON (already loaded)
            images_dir: Path to directory containing page images
            model: Claude model to use
            max_iterations: Maximum agentic loop iterations
        """
        self.client = Anthropic()
        self.navigator = DocumentNavigator(unified_json)
        self.tool_executor = ComplianceToolExecutor(self.navigator, images_dir)
        self.model = model
        self.max_iterations = max_iterations
        self.reasoning_trace = []

        logger.info(f"[ComplianceAgent] Initialized with model={model}, max_iterations={max_iterations}")

    def _build_user_message(
        self,
        code_section: dict,
        building_context: dict,
        screenshots: list[str],
        correction_examples: list[dict] | None = None,
    ) -> list[dict]:
        """
        Build the user message content with code section and screenshots.

        Args:
            code_section: Dict with number, title, text, requirements, tables
            building_context: Project variables (building type, occupancy, etc.)
            screenshots: List of presigned URLs for screenshot images
            correction_examples: Optional list of past human corrections for this section
        """
        content = []

        # Add text content first
        text_parts = []

        text_parts.append("## Code Section to Assess\n")
        text_parts.append(f"**Section Number**: {code_section.get('number', 'Unknown')}\n")
        text_parts.append(f"**Title**: {code_section.get('title', 'Unknown')}\n\n")

        if code_section.get('text'):
            text_parts.append(f"**Section Text**:\n{code_section['text']}\n\n")

        if code_section.get('requirements'):
            text_parts.append("**Requirements**:\n")
            for i, req in enumerate(code_section['requirements'], 1):
                if isinstance(req, dict):
                    text_parts.append(f"{i}. {req.get('text', str(req))}\n")
                else:
                    text_parts.append(f"{i}. {req}\n")
            text_parts.append("\n")

        if code_section.get('tables'):
            text_parts.append("**Referenced Tables**:\n")
            for table in code_section['tables']:
                text_parts.append(f"- {table.get('number', '')}: {table.get('title', '')}\n")
                if table.get('csv'):
                    text_parts.append(f"```\n{table['csv']}\n```\n")
            text_parts.append("\n")

        if building_context:
            text_parts.append("## Building Context\n")
            for key, value in building_context.items():
                if value:
                    # Format key nicely
                    formatted_key = key.replace('_', ' ').title()
                    text_parts.append(f"- **{formatted_key}**: {value}\n")
            text_parts.append("\n")

        # Add correction examples if available (few-shot learning)
        if correction_examples:
            text_parts.append("## Past Human Corrections\n")
            text_parts.append("These are cases where a human reviewer corrected the AI's assessment. ")
            text_parts.append("Some may be from related sections in the same chapter. ")
            text_parts.append("Learn from these corrections to avoid similar mistakes.\n\n")
            for i, ex in enumerate(correction_examples, 1):
                ex_section = ex.get('section_number', 'unknown')
                text_parts.append(f"### Correction {i} (Section {ex_section})\n")
                text_parts.append(f"- **AI assessed**: {ex.get('ai_status', 'unknown')}\n")
                text_parts.append(f"- **Human corrected to**: {ex.get('human_status', 'unknown')}\n")
                if ex.get('human_note'):
                    text_parts.append(f"- **Human's reasoning**: {ex.get('human_note')}\n")
                if ex.get('ai_reasoning'):
                    text_parts.append(f"- **AI's original reasoning**: {ex.get('ai_reasoning')[:300]}...\n")
                text_parts.append("\n")

        text_parts.append("## Task\n")
        text_parts.append("Assess whether the building shown in the evidence complies with this code section. ")
        text_parts.append("Use the available tools to search the architectural drawings for relevant information. ")
        text_parts.append("Provide your assessment in the required JSON format.\n")

        content.append({"type": "text", "text": "".join(text_parts)})

        # Add screenshots as images
        if screenshots:
            content.append({"type": "text", "text": "\n## Evidence Screenshots\n"})
            for i, url in enumerate(screenshots, 1):
                content.append({
                    "type": "image",
                    "source": {
                        "type": "url",
                        "url": url,
                    },
                })
                content.append({"type": "text", "text": f"Screenshot {i}\n"})

        return content

    def _parse_final_assessment(self, response_text: str) -> dict:
        """
        Parse the final assessment from Claude's response.

        Extracts JSON from response text, handling code blocks.
        """
        # Try to find JSON in code blocks first
        json_match = re.search(r'```(?:json)?\s*(\{[\s\S]*?\})\s*```', response_text)
        if json_match:
            try:
                return json.loads(json_match.group(1))
            except json.JSONDecodeError:
                pass

        # Try to find raw JSON
        json_match = re.search(r'\{[\s\S]*"compliance_status"[\s\S]*\}', response_text)
        if json_match:
            try:
                return json.loads(json_match.group(0))
            except json.JSONDecodeError:
                pass

        # Fallback: return as reasoning
        return {
            "compliance_status": "needs_more_info",
            "confidence": "low",
            "ai_reasoning": response_text[:2000],
            "violations": [],
            "compliant_aspects": [],
            "recommendations": [],
            "additional_evidence_needed": ["Could not parse structured assessment"]
        }

    async def assess_check_stream(
        self,
        code_section: dict,
        building_context: dict,
        screenshots: list[str],
        correction_examples: list[dict] | None = None,
    ) -> AsyncGenerator[dict, None]:
        """
        Stream compliance assessment for a single check.

        Args:
            code_section: Dict with number, title, text, requirements, tables
            building_context: Project variables (building type, occupancy, etc.)
            screenshots: List of presigned URLs for screenshot images
            correction_examples: Optional list of past human corrections for this section

        Yields:
            SSE chunks with types: thinking, tool_use, tool_result, done, error
        """
        self.reasoning_trace = []

        user_content = self._build_user_message(
            code_section, building_context, screenshots, correction_examples
        )
        messages = [{"role": "user", "content": user_content}]

        section_number = code_section.get("number", "unknown")
        logger.info(f"[ComplianceAgent] Starting assessment for section {section_number}")

        # Create parent trace for this assessment
        langfuse = get_langfuse()
        trace = None
        if langfuse:
            trace = create_trace_span(
                langfuse,
                name="compliance_assessment",
                metadata={
                    "section_number": section_number,
                    "section_title": code_section.get("title", "unknown"),
                    "screenshot_count": len(screenshots),
                },
            )
            if trace:
                logger.info(f"[ComplianceAgent] Created Langfuse trace span")

        try:
          for iteration in range(self.max_iterations):
            logger.info(f"[ComplianceAgent] Iteration {iteration + 1}/{self.max_iterations}")

            # Create iteration span
            iteration_span = create_child_span(
                trace,
                name=f"iteration_{iteration + 1}",
                metadata={"iteration": iteration + 1, "section": section_number},
            )

            try:
                response = self.client.messages.create(
                    model=self.model,
                    max_tokens=4096,
                    system=COMPLIANCE_SYSTEM_PROMPT,
                    tools=COMPLIANCE_TOOLS,
                    messages=messages,
                )
            except Exception as e:
                logger.error(f"[ComplianceAgent] API error: {e}")
                end_span(iteration_span, output={"error": str(e)}, level="ERROR")
                yield {"type": "error", "message": str(e)}
                return

            # Process response blocks
            assistant_content = []
            tool_calls = []
            final_text = ""

            for block in response.content:
                if block.type == "text":
                    final_text += block.text

                    # Record thinking in trace
                    self.reasoning_trace.append({
                        "iteration": iteration,
                        "type": "thinking",
                        "content": block.text[:500]  # Truncate for storage
                    })

                    yield {"type": "thinking", "content": block.text}
                    assistant_content.append({"type": "text", "text": block.text})

                elif block.type == "tool_use":
                    tool_calls.append(block)

                    self.reasoning_trace.append({
                        "iteration": iteration,
                        "type": "tool_use",
                        "tool": block.name,
                        "tool_use_id": block.id,
                        "input": block.input
                    })

                    yield {
                        "type": "tool_use",
                        "tool": block.name,
                        "tool_use_id": block.id,
                        "input": block.input,
                    }

                    assistant_content.append({
                        "type": "tool_use",
                        "id": block.id,
                        "name": block.name,
                        "input": block.input,
                    })

            # Add assistant message to conversation
            messages.append({"role": "assistant", "content": assistant_content})

            # If done (no tool calls), parse and return final result
            if response.stop_reason == "end_turn" and not tool_calls:
                result = self._parse_final_assessment(final_text)
                result["reasoning_trace"] = self.reasoning_trace
                result["tools_used"] = list(set(
                    t["tool"] for t in self.reasoning_trace
                    if t["type"] == "tool_use"
                ))
                result["iteration_count"] = iteration + 1
                result["raw_response"] = final_text

                logger.info(f"[ComplianceAgent] Assessment complete: {result.get('compliance_status')}")

                # End iteration span and update trace with final result
                end_span(iteration_span, output={"status": result.get("compliance_status")})
                end_span(trace, output=result)

                yield {"type": "done", "result": result}
                return

            # Execute tool calls and add results
            if tool_calls:
                tool_results = []

                for tc in tool_calls:
                    logger.info(f"[ComplianceAgent] Executing tool: {tc.name}")

                    # Create tool span
                    tool_span = create_child_span(
                        iteration_span,
                        name=f"tool_{tc.name}",
                        input_data=tc.input,
                        metadata={"tool_use_id": tc.id},
                    )

                    exec_result = self.tool_executor.execute(tc.name, tc.input)

                    # Record in trace
                    self.reasoning_trace.append({
                        "iteration": iteration,
                        "type": "tool_result",
                        "tool": tc.name,
                        "tool_use_id": tc.id,
                        "result": exec_result.get("result", {})
                    })

                    # Check if result includes an image
                    if "image" in exec_result:
                        # Build tool result with image for Claude
                        tool_result_content = [
                            {
                                "type": "image",
                                "source": {
                                    "type": "base64",
                                    "media_type": exec_result["image"]["media_type"],
                                    "data": exec_result["image"]["data"],
                                },
                            },
                            {
                                "type": "text",
                                "text": f"Image for {exec_result.get('result', {}).get('sheet', 'unknown')}. Analyze this to find relevant compliance information.",
                            },
                        ]

                        yield {
                            "type": "tool_result",
                            "tool": tc.name,
                            "tool_use_id": tc.id,
                            "result": {"image_provided": True, **exec_result.get("result", {})},
                        }
                    else:
                        result_data = exec_result.get("result", exec_result)
                        tool_result_content = json.dumps(result_data, indent=2, default=str)

                        yield {
                            "type": "tool_result",
                            "tool": tc.name,
                            "tool_use_id": tc.id,
                            "result": result_data,
                        }

                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": tc.id,
                        "content": tool_result_content,
                    })

                    # End tool span
                    # Don't include images in output (too large)
                    output_for_span = exec_result.get("result", exec_result)
                    if isinstance(output_for_span, dict) and "image" in output_for_span:
                        output_for_span = {k: v for k, v in output_for_span.items() if k != "image"}
                    end_span(tool_span, output=output_for_span)

                messages.append({"role": "user", "content": tool_results})

            # End iteration span
            end_span(
                iteration_span,
                output={"tool_calls": [tc.name for tc in tool_calls]} if tool_calls else {"done": False}
            )

            # Safety check for end_turn with tool calls
            if response.stop_reason == "end_turn":
                break

          # Max iterations reached
          logger.warning(f"[ComplianceAgent] Max iterations ({self.max_iterations}) reached")
          max_iter_result = {
              "compliance_status": "needs_more_info",
              "confidence": "low",
              "ai_reasoning": "Assessment incomplete - max iterations reached. Please review manually.",
              "reasoning_trace": self.reasoning_trace,
              "tools_used": list(set(t["tool"] for t in self.reasoning_trace if t["type"] == "tool_use")),
              "iteration_count": self.max_iterations,
              "violations": [],
              "compliant_aspects": [],
              "recommendations": ["Manual review recommended - agent reached iteration limit"],
              "additional_evidence_needed": []
          }
          end_span(trace, output=max_iter_result, level="WARNING")
          yield {"type": "done", "result": max_iter_result}

        finally:
            # Always flush Langfuse traces
            if langfuse:
                langfuse.flush()
                logger.info("[ComplianceAgent] Flushed Langfuse traces")
