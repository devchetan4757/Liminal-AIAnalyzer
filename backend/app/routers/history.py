from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc

from app.db.session import get_db
from app.db.models import Analysis
from app.core.deps import auth_guard

router = APIRouter()


@router.get("")
async def list_history(
    db: Session = Depends(get_db),
    user=Depends(auth_guard),
    limit: int = Query(default=50, le=200),
    verdict: Optional[str] = None,
    indicator_type: Optional[str] = None,
):
    """Recent analyses, newest first. Filter by verdict/indicator_type optionally.
    This is the data source for both a future history page and the dashboard.
    """
    q = db.query(Analysis)

    if verdict:
        q = q.filter(Analysis.verdict == verdict)
    if indicator_type:
        q = q.filter(Analysis.indicator_type == indicator_type)

    rows = q.order_by(desc(Analysis.created_at)).limit(limit).all()

    return [
        {
            "id": r.id,
            "created_at": r.created_at.isoformat(),
            "indicator": r.indicator,
            "indicator_type": r.indicator_type,
            "verdict": r.verdict,
            "score": r.score,
            "headline": r.headline,
            "sources": r.sources,
        }
        for r in rows
    ]


@router.get("/{analysis_id}")
async def get_analysis(
    analysis_id: str,
    db: Session = Depends(get_db),
    user=Depends(auth_guard),
):
    """Full record including raw payload -- used when someone clicks into
    a history item to see the complete original analysis again.
    """
    row = db.query(Analysis).filter(Analysis.id == analysis_id).first()
    if not row:
        return {"error": "not found"}

    return {
        "id": row.id,
        "created_at": row.created_at.isoformat(),
        "indicator": row.indicator,
        "indicator_type": row.indicator_type,
        "verdict": row.verdict,
        "score": row.score,
        "headline": row.headline,
        "recommendation": row.recommendation,
        "findings": row.findings,
        "sources": row.sources,
        "raw": row.raw,
    }


@router.delete("/{analysis_id}")
async def delete_analysis(
    analysis_id: str,
    db: Session = Depends(get_db),
    user=Depends(auth_guard),
):
    """Permanently delete a single history entry."""
    row = db.query(Analysis).filter(Analysis.id == analysis_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Analysis not found")

    db.delete(row)
    db.commit()
    return {"deleted": True, "id": analysis_id}
