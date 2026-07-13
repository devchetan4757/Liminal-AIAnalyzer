from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.db.models import User, SecurityFinding, PostureScore
from app.core.deps import get_current_user
from app.core.ownership import get_owned_integration
from app.core.posture.scan import run_posture_scan

router = APIRouter(
    prefix="/api/posture",
    tags=["Security Posture"],
)


def _serialize_finding(f: SecurityFinding) -> dict:
    return {
        "id": f.id,
        "integration_id": f.integration_id,
        "category": f.category,
        "severity": f.severity,
        "title": f.title,
        "detail": f.detail,
        "status": f.status,
        "detected_at": f.detected_at.isoformat() if f.detected_at else None,
        "resolved_at": f.resolved_at.isoformat() if f.resolved_at else None,
    }


@router.get("/{integration_id}")
def get_posture(
    integration_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Current score + open findings for one integration."""
    integration = get_owned_integration(db, integration_id, user.id)

    latest_score = (
        db.query(PostureScore)
        .filter(PostureScore.integration_id == integration.id)
        .order_by(PostureScore.computed_at.desc())
        .first()
    )
    open_findings = (
        db.query(SecurityFinding)
        .filter(SecurityFinding.integration_id == integration.id, SecurityFinding.status == "open")
        .order_by(SecurityFinding.severity.desc(), SecurityFinding.detected_at.desc())
        .all()
    )

    return {
        "integration_id": integration.id,
        "score": latest_score.score if latest_score else None,
        "breakdown": latest_score.breakdown if latest_score else {},
        "computed_at": latest_score.computed_at.isoformat() if latest_score else None,
        "findings": [_serialize_finding(f) for f in open_findings],
    }


@router.get("/{integration_id}/history")
def get_posture_history(
    integration_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    limit: int = 50,
):
    """Score over time, for a trend chart. Most recent last (chart-friendly order)."""
    integration = get_owned_integration(db, integration_id, user.id)

    rows = (
        db.query(PostureScore)
        .filter(PostureScore.integration_id == integration.id)
        .order_by(PostureScore.computed_at.desc())
        .limit(limit)
        .all()
    )

    return {
        "integration_id": integration.id,
        "history": [
            {"score": r.score, "computed_at": r.computed_at.isoformat()}
            for r in reversed(rows)
        ],
    }


@router.post("/{integration_id}/scan")
async def trigger_posture_scan(
    integration_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Run every registered check for this integration's provider now."""
    integration = get_owned_integration(db, integration_id, user.id)

    try:
        result = await run_posture_scan(integration.id, db)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    return result


@router.post("/findings/{finding_id}/resolve")
def resolve_finding(
    finding_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Manually acknowledge/resolve a finding (e.g. accepted risk, false positive)."""
    finding = (
        db.query(SecurityFinding)
        .join(SecurityFinding.integration)
        .filter(SecurityFinding.id == finding_id)
        .first()
    )

    # Scope through ownership the same way every other route does --
    # a finding belonging to another account's integration is a 404,
    # not a 403.
    if finding is None or finding.integration.user_id != user.id:
        raise HTTPException(status_code=404, detail="Finding not found.")

    from datetime import datetime, timezone

    finding.status = "resolved"
    finding.resolved_at = datetime.now(timezone.utc)
    db.commit()

    return _serialize_finding(finding)
