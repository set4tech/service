"""
Pipeline steps for the agent service.
"""
from .extract_tables import ExtractTables
from .extract_text import ExtractText
from .ocr_bboxes import OCRBboxes, OCRTextBoxes, OCRAllRegions
from .extract_project_info import ExtractProjectInfo

__all__ = [
    "ExtractTables",
    "ExtractText",
    "OCRBboxes",
    "OCRTextBoxes",
    "OCRAllRegions",
    "ExtractProjectInfo",
]
