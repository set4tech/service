"""
Pipeline steps for the agent service.
"""
from .extract_tables import ExtractTables
from .extract_text import ExtractText
from .ocr_bboxes import OCRBboxes, OCRTextBoxes, OCRAllRegions
from .extract_project_info import ExtractProjectInfo
from .extract_legends import ExtractLegends
from .extract_element_tags import ExtractElementTags
from .match_tags_to_legends import MatchTagsToLegends

__all__ = [
    "ExtractTables",
    "ExtractText",
    "OCRBboxes",
    "OCRTextBoxes",
    "OCRAllRegions",
    "ExtractProjectInfo",
    "ExtractLegends",
    "ExtractElementTags",
    "MatchTagsToLegends",
]
