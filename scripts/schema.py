"""Pydantic models for building code data structures."""

from pydantic import BaseModel, Field
from typing import List, Optional


class TableBlock(BaseModel):
    """Represents a table within a code section."""
    number: str
    title: str
    csv: str  # CSV-formatted table data


class Subsection(BaseModel):
    """Represents a subsection within a code section."""
    key: str
    number: str
    title: str
    paragraphs: List[str] = Field(default_factory=list)
    refers_to: List[str] = Field(default_factory=list)
    tables: List[TableBlock] = Field(default_factory=list)
    figures: List[str] = Field(default_factory=list)  # URLs or figure references


class Section(BaseModel):
    """Represents a main code section."""
    key: str
    number: str
    title: str
    subsections: List[Subsection] = Field(default_factory=list)
    source_url: Optional[str] = None
    figures: List[str] = Field(default_factory=list)  # URLs or figure references


class Code(BaseModel):
    """Represents an entire building code document."""
    provider: str  # e.g., "ICC"
    version: int  # e.g., 2025
    jurisdiction: str  # e.g., "CA"
    source_id: str  # e.g., "CBC_Chapter11A_11B"
    title: str
    source_url: str
    sections: List[Section] = Field(default_factory=list)
