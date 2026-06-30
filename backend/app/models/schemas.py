from typing import Any, Dict, List, Optional
from pydantic import BaseModel


class ChatMessage(BaseModel):
    text: str
    session_id: Optional[str] = None


class HashLookupRequest(BaseModel):
    hash: str
    filename: Optional[str] = None
    size: Optional[int] = None
    session_id: Optional[str] = None


class IndicatorLookupRequest(BaseModel):
    """For the manual analysis page -- type is explicit (chosen via UI),
    unlike chat where it's auto-detected from free text.
    """
    indicator_type: str  # "hash" | "url" | "ip" | "domain"
    indicator: str
    session_id: Optional[str] = None


class AnalysisResult(BaseModel):
    type: str = "analysis"
    indicator: str
    indicator_type: str
    verdict: str
    score: str
    headline: str
    findings: List[str]
    recommendation: str
    sources: List[str]
    raw: Dict[str, Any]
    found: bool = True


class TextResult(BaseModel):
    type: str = "text"
    content: str
    found: Optional[bool] = None
    offerUpload: Optional[bool] = None
