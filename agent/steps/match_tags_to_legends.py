"""
Tag-to-Legend Matching Pipeline Step

Matches extracted element tags (from ExtractElementTags) to legend entries
(from ExtractLegends) using text-only LLM to understand the semantic
relationship between tags and their meanings.

Must run AFTER both ExtractElementTags and ExtractLegends.
"""
import json
import logging
from typing import Optional

from pipeline import PipelineStep, PipelineContext
from llm import call_text_llm

logger = logging.getLogger(__name__)

# Prompt for matching tags to legend entries
MATCHING_PROMPT = """Match the element tags to their legend definitions.

ELEMENT TAGS FOUND IN THIS DOCUMENT:
{tags}

LEGEND ENTRIES FROM THIS DOCUMENT:
{legend_entries}

For each tag, find the matching legend entry that explains what it represents.
Return JSON:
{{
  "matches": [
    {{
      "tag": "the tag value",
      "legend_match": "the matching legend entry meaning",
      "legend_symbol": "the symbol from the legend that matched",
      "match_type": "exact" | "pattern" | "inferred",
      "confidence": "high" | "medium" | "low"
    }}
  ],
  "unmatched_tags": ["tags with no legend match"],
  "notes": ""
}}

Match based on:
- D-01, D-1, D1 etc -> door tags (match to door schedule or door legend)
- W-01, W-1, WIN-1 etc -> window tags (match to window schedule or legend)
- 101, 102, 201 etc -> room numbers (match to room legend if exists)
- 1/A-201, 2/S1.1 etc -> detail/section references
- A-A, B-B etc -> section markers

Match types:
- "exact": Tag exactly matches a legend symbol
- "pattern": Tag follows same pattern as legend (e.g., D-01 matches "D-XX: Door Tag")
- "inferred": Match based on context/description

If a legend entry describes "DOOR TAG" and you see "D-01", that's a pattern match.
If no matching legend entry exists, add to unmatched_tags list."""


def collect_all_tags(element_tags_results: list) -> list[str]:
    """
    Collect all unique tags from element tag extraction results.

    Args:
        element_tags_results: Results from ExtractElementTags

    Returns:
        List of unique tags
    """
    all_tags = set()

    for result in element_tags_results:
        extraction = result.get("extraction_result", {})
        tags = extraction.get("tags_found", [])
        all_tags.update(tags)

    return sorted(all_tags)


def collect_all_legend_entries(legends: list) -> list[dict]:
    """
    Collect all legend entries from extracted legends.

    Args:
        legends: Results from ExtractLegends

    Returns:
        List of legend entry dicts with symbol and meaning
    """
    all_entries = []

    for legend in legends:
        if legend.get("status") != "success":
            continue

        for entry in legend.get("entries", []):
            symbol = entry.get("symbol")
            meaning = entry.get("meaning")
            if symbol or meaning:
                all_entries.append({
                    "symbol": symbol,
                    "meaning": meaning,
                    "category": entry.get("category", legend.get("category")),
                    "legend_type": legend.get("legend_type"),
                })

    return all_entries


def format_legend_entries_for_prompt(entries: list[dict]) -> str:
    """
    Format legend entries as a readable list for the LLM prompt.

    Args:
        entries: List of legend entry dicts

    Returns:
        Formatted string for prompt
    """
    lines = []
    for entry in entries:
        symbol = entry.get("symbol", "")
        meaning = entry.get("meaning", "")
        category = entry.get("category", "")

        if symbol and meaning:
            lines.append(f"- {symbol}: {meaning} [{category}]")
        elif meaning:
            lines.append(f"- {meaning} [{category}]")

    return "\n".join(lines) if lines else "(no legend entries)"


def match_tags_to_legends(tags: list[str], legend_entries: list[dict]) -> dict:
    """
    Use LLM to match tags to legend entries.

    Args:
        tags: List of element tags to match
        legend_entries: List of legend entry dicts

    Returns:
        Matching result dict with matches and unmatched_tags
    """
    if not tags:
        return {
            "matches": [],
            "unmatched_tags": [],
            "notes": "No tags to match",
            "status": "no_tags"
        }

    if not legend_entries:
        return {
            "matches": [],
            "unmatched_tags": tags,
            "notes": "No legend entries available for matching",
            "status": "no_legends"
        }

    prompt = MATCHING_PROMPT.format(
        tags=json.dumps(tags, indent=2),
        legend_entries=format_legend_entries_for_prompt(legend_entries)
    )

    try:
        result = call_text_llm(prompt, json_mode=True)

        if result["status"] == "error":
            logger.warning(f"LLM error: {result.get('error')}")
            return {
                "matches": [],
                "unmatched_tags": tags,
                "notes": f"LLM error: {result.get('error')}",
                "status": "api_error"
            }

        # Parse response
        response_text = result["text"].strip()

        # Handle potential markdown code blocks
        if response_text.startswith("```"):
            lines = response_text.split("\n")
            response_text = "\n".join(
                lines[1:-1] if lines[-1] == "```" else lines[1:]
            )

        parsed = json.loads(response_text)
        # Handle case where LLM returns an array instead of object
        if isinstance(parsed, list):
            if len(parsed) > 0 and isinstance(parsed[0], dict):
                logger.warning(f"LLM returned array, using first element")
                parsed = parsed[0]
            else:
                return {
                    "matches": [],
                    "unmatched_tags": tags,
                    "notes": "LLM returned array instead of object",
                    "status": "json_error"
                }
        parsed["status"] = "success"
        return parsed

    except json.JSONDecodeError as e:
        logger.warning(f"JSON parse error: {e}")
        return {
            "matches": [],
            "unmatched_tags": tags,
            "notes": f"JSON parse error: {str(e)}",
            "status": "json_error"
        }
    except Exception as e:
        logger.error(f"Matching error: {e}")
        return {
            "matches": [],
            "unmatched_tags": tags,
            "notes": f"Matching error: {str(e)}",
            "status": "processing_error"
        }


class MatchTagsToLegends(PipelineStep):
    """
    Pipeline step to match element tags to legend entries.

    Uses text-only LLM to semantically match tags (like D-01, W-1) to their
    meanings from extracted legends.

    Must run AFTER:
    - ExtractElementTags (provides extracted_element_tags)
    - ExtractLegends (provides extracted_legends)

    Stores results in ctx.metadata["tag_legend_matches"].
    """

    name = "match_tags_to_legends"

    def __init__(self, batch_size: int = 50):
        """
        Args:
            batch_size: Maximum tags to process in one LLM call
        """
        self.batch_size = batch_size

    def process(self, ctx: PipelineContext) -> PipelineContext:
        """
        Match element tags to legend entries.

        Args:
            ctx: Pipeline context with extracted_element_tags and extracted_legends

        Returns:
            Updated context with tag_legend_matches in metadata
        """
        # Get inputs from previous steps
        element_tags_results = ctx.metadata.get("extracted_element_tags", [])
        legends = ctx.metadata.get("extracted_legends", [])

        if not element_tags_results:
            logger.info("  No element tags to match (run ExtractElementTags first)")
            ctx.metadata["tag_legend_matches"] = {
                "matches": [],
                "unmatched_tags": [],
                "summary": {"status": "no_tags"},
            }
            return ctx

        if not legends:
            logger.info("  No legends to match against (run ExtractLegends first)")
            all_tags = collect_all_tags(element_tags_results)
            ctx.metadata["tag_legend_matches"] = {
                "matches": [],
                "unmatched_tags": all_tags,
                "summary": {"status": "no_legends", "total_tags": len(all_tags)},
            }
            return ctx

        # Collect all unique tags and legend entries
        all_tags = collect_all_tags(element_tags_results)
        all_legend_entries = collect_all_legend_entries(legends)

        logger.info(f"  Matching {len(all_tags)} tags against {len(all_legend_entries)} legend entries...")

        if not all_tags:
            logger.info("  No tags found to match")
            ctx.metadata["tag_legend_matches"] = {
                "matches": [],
                "unmatched_tags": [],
                "legend_entries": all_legend_entries,
                "summary": {"status": "no_tags"},
            }
            return ctx

        # Process in batches if needed
        all_matches = []
        all_unmatched = []

        for i in range(0, len(all_tags), self.batch_size):
            batch_tags = all_tags[i:i + self.batch_size]
            logger.debug(f"  Processing batch {i//self.batch_size + 1}: {len(batch_tags)} tags")

            result = match_tags_to_legends(batch_tags, all_legend_entries)

            matches = result.get("matches", [])
            unmatched = result.get("unmatched_tags", [])

            all_matches.extend(matches)
            all_unmatched.extend(unmatched)

            if result.get("status") == "success":
                logger.info(f"    Batch matched: {len(matches)} tags, {len(unmatched)} unmatched")
            else:
                logger.warning(f"    Batch failed: {result.get('notes')}")

        # Build summary
        match_types = {}
        confidence_counts = {}
        for match in all_matches:
            mt = match.get("match_type", "unknown")
            match_types[mt] = match_types.get(mt, 0) + 1

            conf = match.get("confidence", "unknown")
            confidence_counts[conf] = confidence_counts.get(conf, 0) + 1

        summary = {
            "total_tags": len(all_tags),
            "matched_tags": len(all_matches),
            "unmatched_tags": len(all_unmatched),
            "match_rate": len(all_matches) / len(all_tags) if all_tags else 0,
            "match_types": match_types,
            "confidence_distribution": confidence_counts,
            "legend_entries_used": len(all_legend_entries),
            "status": "success",
        }

        # Store results
        ctx.metadata["tag_legend_matches"] = {
            "matches": all_matches,
            "unmatched_tags": all_unmatched,
            "legend_entries": all_legend_entries,
            "summary": summary,
        }

        logger.info(f"  Tag matching complete:")
        logger.info(f"    Total tags: {summary['total_tags']}")
        logger.info(f"    Matched: {summary['matched_tags']} ({summary['match_rate']:.0%})")
        logger.info(f"    Unmatched: {summary['unmatched_tags']}")

        if match_types:
            logger.info(f"    Match types: {match_types}")

        # Log some example matches
        for match in all_matches[:5]:
            tag = match.get("tag")
            legend = match.get("legend_match")
            legend_preview = legend[:40] if legend else "(no match)"
            conf = match.get("confidence")
            logger.info(f"      {tag} -> {legend_preview}... ({conf})")

        if len(all_matches) > 5:
            logger.info(f"      ... and {len(all_matches) - 5} more matches")

        return ctx
