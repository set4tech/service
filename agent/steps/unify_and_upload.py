"""
Unify and Upload Pipeline Step

Final pipeline step that:
1. Unifies all extracted data into a single structured JSON
2. Uploads the unified JSON to S3
3. Uploads page images to S3
"""
import json
import logging
import re
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path

import boto3

from pipeline import PipelineStep, PipelineContext
import config

logger = logging.getLogger(__name__)


def get_s3():
    """Get S3 client (uses same pattern as main.py)."""
    return boto3.client(
        's3',
        region_name=config.AWS_REGION,
        aws_access_key_id=config.AWS_ACCESS_KEY_ID,
        aws_secret_access_key=config.AWS_SECRET_ACCESS_KEY,
    )


def extract_page_number(filename: str) -> str:
    """
    Extract page number from filename like 'page_001.png' or 'achieve_page_1.png'.

    Returns string page number for use as dict key.
    """
    match = re.search(r'page_?(\d+)', filename, re.IGNORECASE)
    if match:
        return str(int(match.group(1)))  # Remove leading zeros
    return Path(filename).stem


class UnifyAndUpload(PipelineStep):
    """
    Pipeline step to unify all extracted data and upload to S3.

    This step:
    1. Builds a unified JSON document from ctx.data (detections) and ctx.metadata
    2. Uploads unified JSON to S3 at preprocessed/{assessment_id}/unified_document_data.json
    3. Uploads page images to S3 at preprocessed/{assessment_id}/pages/

    The unified JSON format matches what chat_tools.py expects:
    {
        "metadata": {...},
        "project_info": {...},
        "pages": {
            "1": {
                "page_file": "page_001.png",
                "sheet_number": "A1.01",
                "sheet_title": "FIRST FLOOR PLAN",
                "page_text": {"raw": "...", "cleaned": "..."},
                "sections": [...]
            },
            ...
        }
    }
    """

    name = "unify_and_upload"

    def process(self, ctx: PipelineContext) -> PipelineContext:
        """
        Unify extracted data and upload to S3.
        """
        assessment_id = ctx.assessment_id
        images_dir = ctx.metadata.get("images_dir")

        logger.info(f"[UnifyAndUpload] Starting for assessment {assessment_id}")

        # Build unified document
        unified = self._build_unified_document(ctx)

        # Upload to S3
        s3 = get_s3()
        bucket = config.S3_BUCKET_NAME

        # Upload unified JSON
        json_key = f"preprocessed/{assessment_id}/unified_document_data.json"
        json_bytes = json.dumps(unified, indent=2, default=str).encode('utf-8')

        logger.info(f"[UnifyAndUpload] Uploading unified JSON to s3://{bucket}/{json_key}")
        s3.put_object(
            Bucket=bucket,
            Key=json_key,
            Body=json_bytes,
            ContentType='application/json'
        )

        # Upload page images
        if images_dir:
            images_dir = Path(images_dir)
            if images_dir.exists():
                self._upload_images(s3, bucket, assessment_id, images_dir)

        # Store unified document in metadata for downstream use
        ctx.metadata["unified_document"] = unified
        ctx.metadata["unified_json_s3_key"] = json_key

        logger.info(f"[UnifyAndUpload] Complete - {len(unified.get('pages', {}))} pages processed")

        return ctx

    def _build_unified_document(self, ctx: PipelineContext) -> dict:
        """
        Build unified document from ctx.data and ctx.metadata.

        Maps detections and extracted info into the expected format.
        """
        # Get extracted metadata
        extracted_text = ctx.metadata.get("extracted_text", {})
        sheet_info = ctx.metadata.get("sheet_info", {})
        project_info = ctx.metadata.get("project_info", {})
        extracted_tables = ctx.metadata.get("extracted_tables", {})
        extracted_legends = ctx.metadata.get("extracted_legends", {})
        bbox_ocr = ctx.metadata.get("bbox_ocr", {})
        element_tags = ctx.metadata.get("element_tags", {})
        tag_legend_matches = ctx.metadata.get("tag_legend_matches", {})

        # Build pages dict
        pages = {}

        # ctx.data is keyed by filename (e.g., "page_001.png")
        for filename, page_data in ctx.data.items():
            page_num = extract_page_number(filename)

            # Get sheet info for this page
            page_sheet_info = sheet_info.get(page_num, {})
            if not page_sheet_info:
                # Try with filename as key
                page_sheet_info = sheet_info.get(filename, {})

            # Get extracted text
            page_text_data = extracted_text.get(page_num, extracted_text.get(filename, {}))
            if isinstance(page_text_data, str):
                page_text_data = {"raw": page_text_data}

            # Build sections from detections
            sections = []
            detections = page_data.get("detections", []) if isinstance(page_data, dict) else page_data

            if isinstance(detections, list):
                for det in detections:
                    section = self._build_section(
                        det,
                        page_num,
                        filename,
                        extracted_tables,
                        extracted_legends,
                        bbox_ocr,
                        element_tags,
                        tag_legend_matches
                    )
                    if section:
                        sections.append(section)

            pages[page_num] = {
                "page_file": filename,
                "sheet_number": page_sheet_info.get("sheet_number"),
                "sheet_title": page_sheet_info.get("sheet_title"),
                "page_text": page_text_data,
                "sections": sections,
            }

        # Build final unified document
        unified = {
            "metadata": {
                "assessment_id": ctx.assessment_id,
                "generated_at": datetime.now(timezone.utc).isoformat(),
                "total_pages": len(pages),
                "summary": ctx.metadata.get("summary", {}),
            },
            "project_info": project_info if isinstance(project_info, dict) else {},
            "pages": pages,
        }

        return unified

    def _build_section(
        self,
        detection: dict,
        page_num: str,
        filename: str,
        extracted_tables: dict,
        extracted_legends: dict,
        bbox_ocr: dict,
        element_tags: dict,
        tag_legend_matches: dict,
    ) -> dict:
        """
        Build a section dict from a detection and associated extracted data.
        """
        section = {
            "bbox": detection.get("bbox"),
            "section_type": detection.get("class_name", "unknown"),
            "detection_confidence": detection.get("confidence"),
        }

        # Add OCR text if available
        page_ocr = bbox_ocr.get(page_num, bbox_ocr.get(filename, {}))
        if isinstance(page_ocr, dict):
            # Find matching bbox OCR (using some tolerance)
            for bbox_key, ocr_text in page_ocr.items():
                if self._bboxes_match(detection.get("bbox"), bbox_key):
                    section["ocr_text"] = ocr_text
                    break

        # Add table data if this is a table
        if detection.get("class_name") == "table":
            # extracted_tables is a list with each item having a "page" field
            if isinstance(extracted_tables, list):
                page_tables = [t for t in extracted_tables if t.get("page") in (page_num, filename)]
            else:
                # Fallback for dict format (keyed by page)
                page_tables = extracted_tables.get(page_num, extracted_tables.get(filename, []))
            if isinstance(page_tables, list):
                for table in page_tables:
                    if self._bboxes_match(detection.get("bbox"), table.get("bbox")):
                        section["table_data"] = table
                        break

        # Add legend data if this is a legend
        if detection.get("class_name") == "legend":
            # extracted_legends is a list with each item having a "page" field
            if isinstance(extracted_legends, list):
                page_legends = [l for l in extracted_legends if l.get("page") in (page_num, filename)]
            else:
                # Fallback for dict format (keyed by page)
                page_legends = extracted_legends.get(page_num, extracted_legends.get(filename, []))
            if isinstance(page_legends, list):
                for legend in page_legends:
                    if self._bboxes_match(detection.get("bbox"), legend.get("bbox")):
                        section["legend_data"] = legend
                        break

        # Add element tags if this is an image
        if detection.get("class_name") == "image":
            page_tags = element_tags.get(page_num, element_tags.get(filename, {}))
            if page_tags:
                section["element_tags"] = page_tags

            page_matches = tag_legend_matches.get(page_num, tag_legend_matches.get(filename, {}))
            if page_matches:
                section["tag_legend_matches"] = page_matches

        return section

    def _bboxes_match(self, bbox1, bbox2, tolerance: float = 0.7) -> bool:
        """
        Check if two bboxes are similar (IoU > tolerance).

        bbox can be:
        - list: [x1, y1, x2, y2]
        - str: "x1,y1,x2,y2"
        """
        if bbox1 is None or bbox2 is None:
            return False

        # Parse bboxes to lists
        if isinstance(bbox1, str):
            try:
                bbox1 = [float(x) for x in bbox1.split(",")]
            except (ValueError, AttributeError):
                return False

        if isinstance(bbox2, str):
            try:
                bbox2 = [float(x) for x in bbox2.split(",")]
            except (ValueError, AttributeError):
                return False

        if len(bbox1) < 4 or len(bbox2) < 4:
            return False

        # Calculate IoU
        x1 = max(bbox1[0], bbox2[0])
        y1 = max(bbox1[1], bbox2[1])
        x2 = min(bbox1[2], bbox2[2])
        y2 = min(bbox1[3], bbox2[3])

        if x2 < x1 or y2 < y1:
            return False

        intersection = (x2 - x1) * (y2 - y1)
        area1 = (bbox1[2] - bbox1[0]) * (bbox1[3] - bbox1[1])
        area2 = (bbox2[2] - bbox2[0]) * (bbox2[3] - bbox2[1])
        union = area1 + area2 - intersection

        if union <= 0:
            return False

        iou = intersection / union
        return iou >= tolerance

    def _upload_images(self, s3, bucket: str, assessment_id: str, images_dir: Path):
        """
        Upload page images to S3.
        """
        image_files = list(images_dir.glob("*.png")) + list(images_dir.glob("*.jpg"))
        logger.info(f"[UnifyAndUpload] Uploading {len(image_files)} page images...")

        for img_path in image_files:
            s3_key = f"preprocessed/{assessment_id}/pages/{img_path.name}"
            logger.info(f"  Uploading {img_path.name}")
            s3.upload_file(str(img_path), bucket, s3_key)

        logger.info(f"[UnifyAndUpload] Uploaded {len(image_files)} images to S3")
