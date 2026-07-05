from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import desc
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.db.models import Incident
from app.core import llm
from app.services import remediation

router = APIRouter(
    prefix="/api/watchlist",
    tags=["Watchlist"],
)


class WatchlistCreateRequest(BaseModel):
    integration_id: str
    provider: str
    resource_type: str
    external_id: str
    resource_name: str
    title: str
    severity: Optional[str] = "medium"
    raw: dict = {}


def _serialize(incident: Incident) -> dict:
    return {
        "id": incident.id,
        "title": incident.title,
        "severity": incident.severity,
        "status": incident.status,
        "summary": incident.summary,
        "recommendations": incident.recommendations,
        "integration_id": incident.integration_id,
        "provider": incident.provider,
        "resource_type": incident.resource_type,
        "external_id": incident.external_id,
        "resource_name": incident.resource_name,
        "has_playbook": incident.has_playbook,
        "metadata": incident.incident_metadata,
        "created_at": incident.created_at.isoformat() if incident.created_at else None,
        "updated_at": incident.updated_at.isoformat() if incident.updated_at else None,
        "resolved_at": incident.resolved_at.isoformat() if incident.resolved_at else None,
    }


@router.post("")
async def add_to_watchlist(req: WatchlistCreateRequest, db: Session = Depends(get_db)):
    # Dedupe: if an open incident already exists for this exact resource,
    # just return it instead of creating a duplicate.
    existing = (
        db.query(Incident)
        .filter(
            Incident.integration_id == req.integration_id,
            Incident.external_id == req.external_id,
            Incident.status == "open",
        )
        .first()
    )
    if existing:
        return _serialize(existing)

    category = remediation.classify(req.provider, req.resource_type, req.raw)
    playbook_steps = remediation.get_playbook(req.provider, category) if category else None

    result = llm.suggest_remediation(
        provider=req.provider,
        resource_type=req.resource_type,
        resource_name=req.resource_name,
        title=req.title,
        raw=req.raw,
        playbook_steps=playbook_steps,
    )

    incident = Incident(
        title=req.title,
        severity=req.severity or "medium",
        status="open",
        summary=result["summary"],
        recommendations=result["steps"],
        incident_metadata=req.raw,
        integration_id=req.integration_id,
        provider=req.provider,
        resource_type=req.resource_type,
        external_id=req.external_id,
        resource_name=req.resource_name,
        has_playbook=result["has_playbook"],
    )
    db.add(incident)
    db.commit()
    db.refresh(incident)

    return _serialize(incident)


@router.get("")
async def list_watchlist(status: Optional[str] = None, db: Session = Depends(get_db)):
    q = db.query(Incident).filter(Incident.integration_id.isnot(None))

    if status:
        q = q.filter(Incident.status == status)

    rows = q.order_by(desc(Incident.created_at)).all()
    return [_serialize(r) for r in rows]


@router.post("/{incident_id}/resolve")
async def resolve_watchlist_item(incident_id: str, db: Session = Depends(get_db)):
    incident = db.query(Incident).filter(Incident.id == incident_id).first()
    if not incident:
        raise HTTPException(status_code=404, detail="Watchlist item not found.")

    incident.status = "resolved"
    incident.resolved_at = datetime.now(timezone.utc)
    incident.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(incident)

    return _serialize(incident)


@router.delete("/{incident_id}")
async def delete_watchlist_item(incident_id: str, db: Session = Depends(get_db)):
    incident = db.query(Incident).filter(Incident.id == incident_id).first()
    if not incident:
        raise HTTPException(status_code=404, detail="Watchlist item not found.")

    db.delete(incident)
    db.commit()

    return {"deleted": True, "id": incident_id}
