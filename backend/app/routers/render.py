import asyncio
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.db.models import Integration
from app.core.encryption import decrypt
from app.services.integrations.render.sync import RenderSyncService

router = APIRouter(
    prefix="/api/integrations",
    tags=["Render"],
)

# Read-only status endpoint. Mutating actions (redeploy, rollback,
# suspend, resume) live in app/routers/remote_actions.py - a single
# generic, registry-driven router shared across providers - not here.
# See REMOTE_ACTIONS_PLAN.md.

# Same TTL and reuse of the cached_scan / cached_scan_at columns that
# GitHub's security scan uses (see routers/integrations.py). Those
# columns are generic on the Integration model - not GitHub-specific -
# so no migration is needed to reuse them here. A full status() fans
# out to one deploys request per service, so this avoids re-running
# that on every dashboard load/poll.
RENDER_CACHE_TTL = timedelta(minutes=15)


def _get_render_integration_or_404(integration_id: str, db: Session) -> Integration:
    integration = (
        db.query(Integration)
        .filter(Integration.id == integration_id)
        .first()
    )

    if integration is None:
        raise HTTPException(status_code=404, detail="Integration not found.")

    if integration.provider != "render":
        raise HTTPException(status_code=400, detail="Only available for Render integrations.")

    return integration


@router.get("/{integration_id}/render/status")
async def render_status(
    integration_id: str,
    refresh: bool = False,
    db: Session = Depends(get_db),
):
    integration = _get_render_integration_or_404(integration_id, db)

    # Serve from cache unless it's missing, stale, or the caller asked to
    # bypass it.
    if not refresh and integration.cached_scan and integration.cached_scan_at:
        cached_at = integration.cached_scan_at
        if isinstance(cached_at, str):
            cached_at = datetime.fromisoformat(cached_at)
        if cached_at.tzinfo is None:
            cached_at = cached_at.replace(tzinfo=timezone.utc)

        age = datetime.now(timezone.utc) - cached_at
        if age < RENDER_CACHE_TTL:
            return {
                **integration.cached_scan,
                "_cache": {
                    "hit": True,
                    "cached_at": cached_at.isoformat(),
                    "age_seconds": int(age.total_seconds()),
                },
            }

    api_key = decrypt(integration.encrypted_credentials["api_key"])

    try:
        service = RenderSyncService(api_key)
        data = await asyncio.wait_for(
            asyncio.get_event_loop().run_in_executor(None, service.logs),
            timeout=45.0,
        )
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="Render status fetch timed out.")
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Render status fetch failed: {exc}")

    now = datetime.now(timezone.utc)

    integration.last_sync = now
    integration.cached_scan = data
    integration.cached_scan_at = now
    db.commit()

    return {
        **data,
        "_cache": {"hit": False, "cached_at": now.isoformat(), "age_seconds": 0},
    }
