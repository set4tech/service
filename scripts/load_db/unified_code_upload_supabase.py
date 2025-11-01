#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Unified upload script for all building code data to Supabase (PostgreSQL).
Accepts any JSON file in the unified Code schema format.

The unified schema:
{
  "provider": "ICC" | "NYSBC" | etc,
  "version": 2017 | 2025 | etc,
  "jurisdiction": "CA" | "NY" | null,
  "source_id": "A117.1" | "CBC_Chapter11B" | "Chapter11",
  "title": "...",
  "source_url": "...",
  "sections": [
    {
      "key": "401",
      "number": "401",
      "title": "...",
      "text": "...",
      "chapter": "11B" | "11A" | etc (optional),
      "source_url": "...",
      "source_page": 123 (optional),
      "figures": [...] (optional),
      "tables": [...] (optional),
      "always_include": true/false (optional),
      "applicable_occupancies": ["A", "B", ...] (optional),
      "requires_parking": true/false (optional),
      "requires_elevator": true/false (optional),
      "min_building_size": 5000 (optional),
      "max_building_size": 50000 (optional),
      "applicable_work_types": ["new", "alteration", ...] (optional),
      "applicable_facility_categories": ["commercial", ...] (optional),
      "applicability_notes": "..." (optional),
      "drawing_assessable": true/false (optional, default: true),
      "assessability_tags": ["doors", "ramps", ...] (optional),
      "never_relevant": true/false (optional, default: false),
      "floorplan_relevant": true/false (optional, default: false),
      "subsections": [
        {
          "key": "401.1",
          "number": "401.1",
          "title": "...",
          "text": "...",
          "paragraphs": [...],
          "refers_to": [...],
          "tables": [...] (optional),
          "figures": [...] (optional),
          "source_url": "..." (optional),
          "source_page": 123 (optional),
          "chapter": "..." (optional),
          "always_include": true/false (optional),
          "applicable_occupancies": [...] (optional),
          "requires_parking": true/false (optional),
          "requires_elevator": true/false (optional),
          "min_building_size": 5000 (optional),
          "max_building_size": 50000 (optional),
          "applicable_work_types": [...] (optional),
          "applicable_facility_categories": [...] (optional),
          "applicability_notes": "..." (optional),
          "drawing_assessable": true/false (optional, default: true),
          "assessability_tags": [...] (optional),
          "never_relevant": true/false (optional, default: false),
          "floorplan_relevant": true/false (optional, default: false)
        }
      ]
    }
  ]
}

Usage:
    # ICC A117.1
    python scripts/load_db/unified_code_upload_supabase.py --file ./scripts/icc_a117.json

    # California CBC
    python scripts/load_db/unified_code_upload_supabase.py --file ./cbc_CA_2025.json

    # NYC Chapter 11
    python scripts/load_db/unified_code_upload_supabase.py --file ./nyc_ch11.json

    # From S3
    python scripts/load_db/unified_code_upload_supabase.py --file s3://set4-codes/cleaned/CA/2025/cbc_chapter11b.json
"""

import argparse
import json
import os
import logging
import re
from typing import Dict, Any, List, Optional
from supabase import create_client, Client

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s"
)
logger = logging.getLogger(__name__)

ENV = os.getenv("ENV", "development")
REGION = "us-east-2" if ENV == "prod" else "us-east-1"
BUCKET_NAME = "set4-codes"


def section_key_func(
    provider: str, version: str, jurisdiction: Optional[str], source_id: str, number: str
) -> str:
    """Generate unique key for section/subsection."""
    if jurisdiction:
        return f"{provider}:{source_id}:{version}:{jurisdiction}:{number}"
    else:
        return f"{provider}:{source_id}:{version}:{number}"


def sha256_of(*parts: str) -> str:
    """Generate SHA256 hash of concatenated parts."""
    import hashlib

    h = hashlib.sha256()
    for p in parts:
        h.update((p or "").encode("utf-8"))
        h.update(b"\x1f")
    return h.hexdigest()


def load_data_from_path(file_path: str) -> Dict[str, Any]:
    """Load Code data from either S3 or local path."""
    if file_path.startswith("s3://"):
        import boto3

        s3_path = file_path[5:]  # drop s3://
        if s3_path.startswith(BUCKET_NAME + "/"):
            bucket = BUCKET_NAME
            key = s3_path[len(BUCKET_NAME) + 1 :]
        else:
            parts = s3_path.split("/", 1)
            bucket = parts[0]
            key = parts[1] if len(parts) > 1 else ""

        logger.info(f"Downloading s3://{bucket}/{key}")
        s3 = boto3.client("s3", region_name=REGION)
        response = s3.get_object(Bucket=bucket, Key=key)
        content = response["Body"].read().decode("utf-8")
        data = json.loads(content)
        logger.info("Successfully downloaded Code data from S3")
        return data
    else:
        logger.info(f"Loading data from local file: {file_path}")
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        logger.info(f"Successfully loaded Code data from {file_path}")
        return data


def clean_text(text: str) -> str:
    """Clean and normalize text."""
    if not text:
        return text
    return re.sub(r"\s+", " ", text).strip()


def determine_code_type(code_data: Dict[str, Any]) -> str:
    """Determine the code type based on the data."""
    source_id = code_data.get("source_id", "").lower()
    title = code_data.get("title", "").lower()

    # Check for accessibility codes
    if (
        "a117" in source_id
        or "accessibility" in title
        or "chapter 11" in title
        or "chapter11" in source_id
    ):
        return "accessibility"
    # Add other code type detection logic as needed
    elif "fire" in title or "fire" in source_id:
        return "fire"
    elif "plumbing" in title or "plumbing" in source_id:
        return "plumbing"
    elif "mechanical" in title or "mechanical" in source_id:
        return "mechanical"
    elif "energy" in title or "energy" in source_id:
        return "energy"
    # Default to building for general building codes
    return "building"


def upload_items_to_supabase(
    supabase: Client,
    all_items: List[dict],
    code_data: Dict[str, Any],
    code_id: str,
):
    """Upload sections and subsections to Supabase."""
    total_items = len(all_items)
    logger.info(f"Starting upload of {total_items} items")

    code_type = determine_code_type(code_data)
    logger.info(f"Determined code_type: {code_type}")

    # Batch insert sections (fresh insert after DELETE)
    batch_size = 100
    for i in range(0, total_items, batch_size):
        batch = all_items[i : i + batch_size]
        logger.info(
            f"Progress: {i}/{total_items} items uploaded ({(i/total_items)*100:.1f}%)"
        )

        # Prepare batch data for insert
        batch_data = []
        for item in batch:
            record = {
                "key": item["key"],
                "code_id": code_id,
                "parent_key": item.get("parent_key"),
                "number": item["number"],
                "title": item["title"],
                "text": item["text"],
                "item_type": item["item_type"],
                "code_type": code_type,
                "paragraphs": item.get("paragraphs", []),
                "tables": item.get("tables", []),
                "figures": item.get("figures", []),
                "source_url": item.get("source_url", ""),
                "source_page": item.get("source_page"),
                "hash": sha256_of(
                    item["provider"],
                    str(item["version"]),
                    item["jurisdiction"] or "",
                    item["source_id"],
                    item["number"],
                    item["title"],
                    item["text"] or "",
                ),
            }

            # Add optional fields only if they exist in the item
            optional_fields = [
                "chapter",
                "always_include",
                "applicable_occupancies",
                "requires_parking",
                "requires_elevator",
                "min_building_size",
                "max_building_size",
                "applicable_work_types",
                "applicable_facility_categories",
                "applicability_notes",
                "drawing_assessable",
                "assessability_tags",
                "never_relevant",
                "floorplan_relevant",
            ]

            for field in optional_fields:
                if field in item and item[field] is not None:
                    record[field] = item[field]

            batch_data.append(record)

        # Insert batch
        try:
            supabase.table("sections").insert(batch_data).execute()
        except Exception as e:
            logger.error(f"Error inserting batch: {e}")
            # Try individual inserts for this batch to identify problematic records
            for record in batch_data:
                try:
                    supabase.table("sections").insert(record).execute()
                except Exception as record_error:
                    logger.error(f"Failed to insert record {record['key']}: {record_error}")

    logger.info("All items uploaded successfully")

    # Create cross-references
    logger.info("Creating cross-references...")
    all_keys = {item["number"]: item["key"] for item in all_items}

    # Use a set to track unique references (deduplicate)
    unique_references = set()
    references_to_insert = []

    for item in all_items:
        src = item["number"]
        refers_to = item.get("refers_to", [])

        for ref_id in refers_to:
            if ref_id == src:
                continue
            if ref_id in all_keys:
                src_key = all_keys.get(src)
                target_key = all_keys.get(ref_id)
                if src_key and target_key:
                    # Create a unique tuple to check for duplicates
                    ref_tuple = (src_key, target_key)
                    if ref_tuple not in unique_references:
                        unique_references.add(ref_tuple)
                        references_to_insert.append(
                            {
                                "source_section_key": src_key,
                                "target_section_key": target_key,
                                "explicit": True,
                                "citation_text": "",
                            }
                        )

    # Batch insert references
    if references_to_insert:
        batch_size = 100
        for i in range(0, len(references_to_insert), batch_size):
            batch = references_to_insert[i : i + batch_size]
            try:
                supabase.table("section_references").insert(batch).execute()
            except Exception as e:
                logger.error(f"Error inserting reference batch: {e}")

    logger.info(f"Created {len(references_to_insert)} cross-references")


def upload_unified_code(code_data: Dict[str, Any], supabase: Client):
    """Upload unified Code data to Supabase using Option 4: DELETE + INSERT."""
    logger.info("Starting upload to Supabase (Option 4: Transaction DELETE + INSERT)")

    all_items: List[dict] = []

    provider = code_data["provider"]
    version = str(code_data["version"])
    jurisdiction = code_data.get("jurisdiction")
    source_id = code_data["source_id"]

    # Create the Code ID
    code_id = f"{provider}+{source_id}+{version}"
    if jurisdiction:
        code_id = f"{provider}+{source_id}+{version}+{jurisdiction}"

    logger.info(f"Code ID: {code_id}")
    logger.info(f"  Provider: {provider}")
    logger.info(f"  Source ID: {source_id}")
    logger.info(f"  Version: {version}")
    logger.info(f"  Jurisdiction: {jurisdiction}")
    logger.info(f"  Title: {code_data['title']}")

    # Delete existing code (CASCADE will delete all sections and references)
    try:
        logger.info("Deleting existing code (if exists)...")
        result = supabase.table("codes").delete().eq("id", code_id).execute()
        if result.data:
            logger.info(f"  ✓ Deleted existing code: {code_id}")
        else:
            logger.info("  ✓ No existing code found (first-time insert)")
    except Exception as e:
        logger.warning(f"Delete operation note: {e}")

    # Insert Code record
    try:
        logger.info("Inserting code record...")
        supabase.table("codes").insert(
            {
                "id": code_id,
                "provider": provider,
                "source_id": source_id,
                "version": version,
                "jurisdiction": jurisdiction,
                "title": code_data["title"],
                "source_url": code_data.get("source_url", ""),
            }
        ).execute()
        logger.info("  ✓ Code record created successfully")
    except Exception as e:
        logger.error(f"Error creating Code record: {e}")
        raise

    sections = code_data.get("sections", [])
    logger.info(f"Processing {len(sections)} sections...")

    for section in sections:
        section_number = section["number"]
        section_title = section["title"]
        section_text = section.get("text", "")

        section_key = section_key_func(
            provider, version, jurisdiction, source_id, section_number
        )

        section_item = {
            "key": section_key,
            "provider": provider,  # For key/hash generation only
            "version": version,  # For key/hash generation only
            "jurisdiction": jurisdiction,  # For key/hash generation only
            "source_id": source_id,  # For key/hash generation only
            "number": section_number,
            "title": section_title,
            "text": clean_text(section_text),
            "item_type": "section",
            "parent_key": None,
            "paragraphs": [],
            "refers_to": [],  # For cross-references only
            "tables": section.get("tables", []),
            "figures": section.get("figures", []),
            "source_url": section.get("source_url", ""),
            "source_page": section.get("source_page"),
            "chapter": section.get("chapter"),
            "always_include": section.get("always_include"),
            "applicable_occupancies": section.get("applicable_occupancies"),
            "requires_parking": section.get("requires_parking"),
            "requires_elevator": section.get("requires_elevator"),
            "min_building_size": section.get("min_building_size"),
            "max_building_size": section.get("max_building_size"),
            "applicable_work_types": section.get("applicable_work_types"),
            "applicable_facility_categories": section.get("applicable_facility_categories"),
            "applicability_notes": section.get("applicability_notes"),
            "drawing_assessable": section.get("drawing_assessable"),
            "assessability_tags": section.get("assessability_tags"),
            "never_relevant": section.get("never_relevant"),
            "floorplan_relevant": section.get("floorplan_relevant"),
        }
        all_items.append(section_item)

        # Process subsections
        for subsection in section.get("subsections", []):
            subsection_number = subsection["number"]
            subsection_title = subsection.get("title", "")
            paragraphs = subsection.get("paragraphs", [])
            refers_to = subsection.get("refers_to", [])

            subsection_text = subsection_title
            if paragraphs:
                subsection_text += " " + " ".join(paragraphs)
            subsection_text = clean_text(subsection_text)

            subsection_key = section_key_func(
                provider, version, jurisdiction, source_id, subsection_number
            )

            # Determine parent key based on subsection depth
            # For multi-level subsections like 11B-216.5.3.1, parent should be 11B-216.5.3
            # For single-level subsections like 11B-216.5, parent should be 11B-216 (the section)
            parts = subsection_number.split('.')
            if len(parts) > 2:
                # Multi-level subsection (e.g., 11B-216.5.3.1)
                # Parent is everything except the last part
                parent_number = '.'.join(parts[:-1])
                parent_key = section_key_func(
                    provider, version, jurisdiction, source_id, parent_number
                )
            else:
                # Single-level subsection (e.g., 11B-216.5)
                # Parent is the section
                parent_key = section_key

            subsection_item = {
                "key": subsection_key,
                "provider": provider,  # For key/hash generation only
                "version": version,  # For key/hash generation only
                "jurisdiction": jurisdiction,  # For key/hash generation only
                "source_id": source_id,  # For key/hash generation only
                "number": subsection_number,
                "title": subsection_title,
                "text": subsection_text,
                "item_type": "subsection",
                "parent_key": parent_key,
                "paragraphs": paragraphs,
                "refers_to": refers_to,  # For cross-references only
                "tables": subsection.get("tables", []),
                "figures": subsection.get("figures", []),
                "source_url": subsection.get("source_url", ""),
                "source_page": subsection.get("source_page"),
                "chapter": subsection.get("chapter"),
                "always_include": subsection.get("always_include"),
                "applicable_occupancies": subsection.get("applicable_occupancies"),
                "requires_parking": subsection.get("requires_parking"),
                "requires_elevator": subsection.get("requires_elevator"),
                "min_building_size": subsection.get("min_building_size"),
                "max_building_size": subsection.get("max_building_size"),
                "applicable_work_types": subsection.get("applicable_work_types"),
                "applicable_facility_categories": subsection.get("applicable_facility_categories"),
                "applicability_notes": subsection.get("applicability_notes"),
                "drawing_assessable": subsection.get("drawing_assessable"),
                "assessability_tags": subsection.get("assessability_tags"),
                "never_relevant": subsection.get("never_relevant"),
                "floorplan_relevant": subsection.get("floorplan_relevant"),
            }
            all_items.append(subsection_item)

    upload_items_to_supabase(supabase, all_items, code_data, code_id)

    logger.info(f"Supabase upload complete for {provider} {source_id} v{version}.")


def main():
    parser = argparse.ArgumentParser(
        description="Upload building code data to Supabase from unified Code schema JSON"
    )
    parser.add_argument(
        "--file",
        required=True,
        help="Path to JSON file in unified Code schema format. Can be local or s3://bucket/key",
    )
    args = parser.parse_args()

    # Initialize Supabase client
    supabase_url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

    if not supabase_url or not supabase_key:
        raise ValueError(
            "Missing Supabase credentials. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY"
        )

    supabase: Client = create_client(supabase_url, supabase_key)
    logger.info("Connected to Supabase")

    code_data = load_data_from_path(args.file)

    # Validate that this is Code schema data
    required_fields = ["provider", "version", "source_id", "title", "sections"]
    for field in required_fields:
        if field not in code_data:
            raise ValueError(f"Invalid Code schema: missing required field '{field}'")

    upload_unified_code(code_data, supabase)


if __name__ == "__main__":
    main()