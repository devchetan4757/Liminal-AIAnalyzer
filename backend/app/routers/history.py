from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc

from app.db.session import get_db
from app.db.models import Analysis, User
from app.core.deps import get_current_user

router = APIRouter()


@router.get("")
async def list_history(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    limit: int = Query(default=50, le=200),
    verdict: Optional[str] = None,
    indicator_type: Optional[str] = None,
):
    """Recent analyses for THIS account only, newest first. Filter by
    verdict/indicator_type optionally. This is the data source for both
    the history page and the dashboard.
    """
    q = db.query(Analysis).filter(Analysis.user_id == current_user.id)

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


def _get_owned_analysis(analysis_id: str, db: Session, user_id: str) -> Analysis:
    row = (
        db.query(Analysis)
        .filter(Analysis.id == analysis_id, Analysis.user_id == user_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Analysis not found")
    return row


@router.get("/{analysis_id}")
async def get_analysis(
    analysis_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Full record including raw payload -- used when someone clicks into
    a history item to see the complete original analysis again.
    """
    row = _get_owned_analysis(analysis_id, db, current_user.id)

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
    current_user: User = Depends(get_current_user),
):
    """Permanently delete a single history entry."""
    row = _get_owned_analysis(analysis_id, db, current_user.id)

    db.delete(row)
    db.commit()
    return {"deleted": True, "id": analysis_id}
