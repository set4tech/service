"""
Legend Extraction Pipeline Step

Post-processes tables extracted by ExtractTables to identify and restructure
legend-type tables (Material Legend, Symbol Legend, Key Notes, etc.) into
a legend-specific format with categorized entries.
"""
import logging
from typing import Optional

from pipeline import PipelineStep, PipelineContext

logger = logging.getLogger(__name__)


# Table types that indicate a legend
LEGEND_TABLE_TYPES = [
    "legend",
    "key notes",
    "keynote",
    "symbol legend",
    "material legend",
    "abbreviation",
    "general notes",
    "symbol",
]

# Headers that typically contain the symbol/code
SYMBOL_HEADERS = [
    "symbol",
    "code",
    "key",
    "tag",
    "abbr",
    "abbreviation",
    "mark",
    "no",
    "number",
    "id",
]

# Headers that typically contain the meaning/description
MEANING_HEADERS = [
    "description",
    "meaning",
    "definition",
    "note",
    "name",
    "explanation",
    "value",
]

# Category detection patterns (pattern -> category)
CATEGORY_PATTERNS = {
    "material": ["material", "finish", "mat"],
    "demolition": ["demo", "demolition", "remove", "exist"],
    "new_work": ["new", "construction", "proposed"],
    "symbol": ["symbol", "icon", "graphic"],
    "abbreviation": ["abbreviation", "abbr", "acronym"],
    "keynote": ["keynote", "key note", "note"],
    "door": ["door"],
    "window": ["window"],
    "room": ["room", "space"],
    "electrical": ["electrical", "elec", "power"],
    "plumbing": ["plumbing", "plumb", "fixture"],
    "hvac": ["hvac", "mechanical", "mech"],
}


def is_legend(table: dict) -> bool:
    """
    Determine if an extracted table is a legend.

    Checks:
    1. Original YOLO detection class was "legend"
    2. Table type from VLM extraction contains legend-related keywords

    Args:
        table: Extracted table dict from ExtractTables

    Returns:
        True if the table appears to be a legend
    """
    # Check original detection class (if preserved from YOLO)
    detection_class = table.get("detection_class", "").lower()
    if detection_class == "legend":
        logger.debug(f"  Detected legend by YOLO class")
        return True

    # Check table_type from VLM extraction
    table_type = table.get("table_type", "").lower()
    for legend_type in LEGEND_TABLE_TYPES:
        if legend_type in table_type:
            logger.debug(f"  Detected legend by table_type: {table_type}")
            return True

    return False


def find_column(headers: list[str], candidates: list[str]) -> Optional[str]:
    """
    Find a column header that matches one of the candidate names.

    Args:
        headers: List of normalized header names
        candidates: List of candidate header names to match

    Returns:
        The matching header name, or None if not found
    """
    for header in headers:
        header_lower = header.lower()
        for candidate in candidates:
            if candidate in header_lower:
                return header
    return None


def categorize_legend(table_type: str) -> str:
    """
    Determine the category of a legend based on its table_type.

    Args:
        table_type: The table_type string from VLM extraction

    Returns:
        Category string (e.g., "material", "demolition", "general")
    """
    if not table_type:
        return "general"

    table_type_lower = table_type.lower()

    for category, patterns in CATEGORY_PATTERNS.items():
        for pattern in patterns:
            if pattern in table_type_lower:
                return category

    return "general"


def restructure_as_legend(table: dict) -> dict:
    """
    Convert an extracted table into legend format.

    Maps table rows to symbol/meaning entries and determines category.

    Args:
        table: Extracted table dict from ExtractTables

    Returns:
        Legend dict with entries, category, and metadata
    """
    rows = table.get("rows", [])
    headers_normalized = table.get("headers_normalized", [])
    table_type = table.get("table_type", "Unknown")

    logger.debug(f"  Restructuring legend: {table_type} ({len(rows)} rows)")
    logger.debug(f"    Headers: {headers_normalized}")

    # Find symbol and meaning columns
    symbol_col = find_column(headers_normalized, SYMBOL_HEADERS)
    meaning_col = find_column(headers_normalized, MEANING_HEADERS)

    logger.debug(f"    Symbol column: {symbol_col}, Meaning column: {meaning_col}")

    # Fallback: if we have at least 2 columns, assume first is symbol, second is meaning
    if symbol_col is None and meaning_col is None and len(headers_normalized) >= 2:
        symbol_col = headers_normalized[0]
        meaning_col = headers_normalized[1]
        logger.debug(f"    Using fallback columns: {symbol_col}, {meaning_col}")

    # Determine category from table_type
    category = categorize_legend(table_type)

    # Extract entries
    entries = []
    for row in rows:
        symbol = row.get(symbol_col) if symbol_col else None
        meaning = row.get(meaning_col) if meaning_col else None

        # Convert complex values to strings
        if isinstance(symbol, dict):
            symbol = symbol.get("display") or symbol.get("value") or str(symbol)
        if isinstance(meaning, dict):
            meaning = meaning.get("display") or meaning.get("value") or str(meaning)

        # Only include entries with at least one value
        if symbol or meaning:
            entries.append({
                "symbol": str(symbol) if symbol else None,
                "meaning": str(meaning) if meaning else None,
                "category": category,
            })

    status = "success" if entries else "no_entries"

    result = {
        "page": table.get("page"),
        "bbox": table.get("bbox"),
        "confidence": table.get("confidence"),
        "legend_type": table_type,
        "category": category,
        "entries": entries,
        "entry_count": len(entries),
        "status": status,
        "source_table_type": table_type,
    }

    logger.debug(f"    Extracted {len(entries)} entries, category: {category}")

    return result


class ExtractLegends(PipelineStep):
    """
    Pipeline step to extract and restructure legends from tables.

    This step post-processes tables extracted by ExtractTables to identify
    legend-type tables and restructure them into a legend-specific format
    with symbol/meaning entries and categories.

    Must run AFTER ExtractTables in the pipeline.
    """

    name = "extract_legends"

    def process(self, ctx: PipelineContext) -> PipelineContext:
        """
        Extract legends from previously extracted tables.

        Args:
            ctx: Pipeline context with extracted_tables in metadata

        Returns:
            Updated context with extracted_legends in metadata
        """
        tables = ctx.metadata.get("extracted_tables", [])

        if not tables:
            logger.info("  No tables found, skipping legend extraction")
            ctx.metadata["extracted_legends"] = []
            ctx.metadata["legends_extracted"] = 0
            return ctx

        logger.info(f"  Processing {len(tables)} tables for legends...")

        # Filter to legend-type tables
        legend_tables = [t for t in tables if is_legend(t)]
        logger.info(f"  Found {len(legend_tables)} legend-type tables")

        # Restructure into legend format
        extracted_legends = []
        for legend_table in legend_tables:
            restructured = restructure_as_legend(legend_table)
            extracted_legends.append(restructured)

            if restructured["status"] == "success":
                logger.info(
                    f"    {restructured['page']}: {restructured['legend_type']} "
                    f"({restructured['entry_count']} entries, category: {restructured['category']})"
                )
            else:
                logger.warning(
                    f"    {restructured['page']}: {restructured['legend_type']} - no entries extracted"
                )

        # Store results
        ctx.metadata["extracted_legends"] = extracted_legends
        ctx.metadata["legends_extracted"] = len([
            l for l in extracted_legends if l.get("status") == "success"
        ])

        logger.info(f"  Total: {ctx.metadata['legends_extracted']} legends extracted")

        return ctx
