import asyncio
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import desc
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.db.models import RemoteAction, User
from app.core.encryption import decrypt
from app.core.deps import get_current_user
from app.core.ownership import get_owned_integration
from app.services.integrations.registry import manager
from app.services.remote_actions.registry import get_action, list_actions

router = APIRouter(
    prefix="/api/remote-actions",
    tags=["Remote Actions"],
)

# Generic, provider-agnostic entry point for mutating actions on a
# connected app. See REMOTE_ACTIONS_PLAN.md. This intentionally does
# NOT special-case "render" anywhere below - the registry + each
# provider's own ACTIONS map (see e.g. RenderProvider.ACTIONS) are what
# make an action available at all. Only Render has entries today.
#
# Every route here requires get_current_user and scopes both the
# integration lookup and the remote_actions history query to that
# account - one account can never see or trigger actions against
# another account's connected apps.


class RemoteActionRequest(BaseModel):
    integration_id: str
    provider: str
    action: str
    resource_id: str
    resource_name: Optional[str] = None
    triggered_by: str = "manual"  # manual | watchlist  (never "auto" in this pass - see below)
    incident_id: Optional[str] = None
    extra: dict = {}


def _serialize(row: RemoteAction) -> dict:
    return {
        "id": row.id,
        "integration_id": row.integration_id,
        "provider": row.provider,
        "action": row.action,
        "resource_id": row.resource_id,
        "resource_name": row.resource_name,
        "triggered_by": row.triggered_by,
        "incident_id": row.incident_id,
        "status": row.status,
        "result": row.result,
        "requested_at": row.requested_at.isoformat() if row.requested_at else None,
        "completed_at": row.completed_at.isoformat() if row.completed_at else None,
    }


@router.get("/registry")
def get_registry(provider: Optional[str] = None):
    """Action metadata (label / risk tier / consequence) the frontend renders off of."""
    return list_actions(provider)


@router.get("")
def list_remote_actions(
    integration_id: Optional[str] = None,
    provider: Optional[str] = None,
    incident_id: Optional[str] = None,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Filter via the integration relationship rather than trusting a raw
    # integration_id param, so this can never return another account's
    # action history even if integration_id is supplied.
    q = db.query(RemoteAction).filter(
        RemoteAction.integration.has(user_id=current_user.id)
    )

    if integration_id:
        q = q.filter(RemoteAction.integration_id == integration_id)
    if provider:
        q = q.filter(RemoteAction.provider == provider)
    if incident_id:
        q = q.filter(RemoteAction.incident_id == incident_id)

    rows = q.order_by(desc(RemoteAction.requested_at)).limit(limit).all()
    return [_serialize(r) for r in rows]


@router.post("")
async def trigger_remote_action(
    req: RemoteActionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    meta = get_action(req.provider, req.action)
    if meta is None:
        raise HTTPException(
            status_code=404,
            detail=f"No such action '{req.action}' for provider '{req.provider}'.",
        )

    # Hard rule (PLAN section 3 & 6): there is no unattended trigger path
    # in this pass at all, regardless of risk tier. Reject explicitly
    # rather than silently treating it as manual.
    if req.triggered_by == "auto":
        raise HTTPException(
            status_code=400,
            detail="Automatic/unattended triggering isn't implemented yet - every action currently requires a human to confirm.",
        )

    missing = [f for f in meta["requires"] if f not in req.extra]
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"Action '{req.action}' requires: {', '.join(missing)}.",
        )

    integration = get_owned_integration(db, req.integration_id, current_user.id)
    if integration.provider != req.provider:
        raise HTTPException(status_code=400, detail="Integration provider mismatch.")

    row = RemoteAction(
        integration_id=integration.id,
        provider=req.provider,
        action=req.action,
        resource_id=req.resource_id,
        resource_name=req.resource_name,
        triggered_by=req.triggered_by,
        incident_id=req.incident_id,
        status="pending",
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    # Build the provider client and fire the call. Credential scope
    # problems (e.g. a read-only key) surface here as a normal provider
    # error - caught below and recorded, not passed through raw.
    try:
        api_key = decrypt(integration.encrypted_credentials["api_key"])
        provider = manager.build(req.provider, api_key=api_key)

        result = await asyncio.wait_for(
            provider.execute_action(req.action, service_id=req.resource_id, **req.extra),
            timeout=30.0,
        )

        row.status = "succeeded"
        row.result = result

        # Invalidate this integration's cached status so the next
        # dashboard load reflects the change instead of a stale cache.
        integration.cached_scan_at = None

    except asyncio.TimeoutError:
        row.status = "failed"
        row.result = {"error": "Action timed out."}
    except Exception as exc:
        row.status = "failed"
        row.result = {"error": str(exc)}

    row.completed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(row)

    return _serialize(row)
