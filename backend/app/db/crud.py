from sqlalchemy.orm import Session
from app.db.models import Analysis


def save_analysis(db: Session, result: dict, session_id: str | None = None) -> Analysis:
    """Persist a structured analysis result dict (the same shape your routers
    already return to the frontend) as a row in the analyses table.

    Call this right before returning a result of type "analysis" from
    chat.py or analyze.py. Safe to call even if some fields are missing.
    """
    row = Analysis(
        indicator=result.get("indicator", ""),
        indicator_type=result.get("indicator_type", "unknown"),
        verdict=result.get("verdict", "unknown"),
        score=str(result.get("score", "")),
        headline=result.get("headline"),
        recommendation=result.get("recommendation"),
        findings=result.get("findings"),
        sources=result.get("sources"),
        raw=result.get("raw"),
        session_id=session_id or result.get("session_id"),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row
