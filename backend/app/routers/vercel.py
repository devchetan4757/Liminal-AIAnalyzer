import asyncio
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.db.models import User
from app.core.encryption import decrypt
from app.core.deps import get_current_user
from app.core.ownership import get_owned_integration
from app.services.integrations.vercel.sync import VercelSyncService

router = APIRouter(
    prefix="/api/integrations",
    tags=["Vercel"],
)

# Read-only status endpoint. The one-click lifecycle actions (redeploy,
# cancel_deployment, promote, delete_deployment) are NOT here - those go
# through the shared, registry-driven /api/remote-actions router (see
# app/services/remote_actions/registry.py) since they're generic across
# providers - same split Render uses.

# Same TTL and reuse of the cached_scan / cached_scan_at columns that
# Render's status endpoint uses (see routers/render.py). Those columns
# are generic on the Integration model, so no migration is needed to
# reuse them here. A full status() fans out to one deployments request
# per project, so this avoids re-running that on every dashboard load/poll.
VERCEL_CACHE_TTL = timedelta(minutes=15)


@router.get("/{integration_id}/vercel/status")
async def vercel_status(
    integration_id: str,
    refresh: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    integration = get_owned_integration(db, integration_id, current_user.id, provider="vercel")

    if not refresh and integration.cached_scan and integration.cached_scan_at:
        cached_at = integration.cached_scan_at
        if isinstance(cached_at, str):
            cached_at = datetime.fromisoformat(cached_at)
        if cached_at.tzinfo is None:
            cached_at = cached_at.replace(tzinfo=timezone.utc)

        age = datetime.now(timezone.utc) - cached_at
        if age < VERCEL_CACHE_TTL:
            return {
                **integration.cached_scan,
                "_cache": {
                    "hit": True,
                    "cached_at": cached_at.isoformat(),
                    "age_seconds": int(age.total_seconds()),
                },
            }

    creds = integration.encrypted_credentials
    api_key = decrypt(creds["api_key"])
    team_id = decrypt(creds["team_id"]) if creds.get("team_id") else None

    try:
        service = VercelSyncService(api_key, team_id)
        data = await asyncio.wait_for(
            asyncio.get_event_loop().run_in_executor(None, service.logs),
            timeout=45.0,
        )
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="Vercel status fetch timed out.")
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Vercel status fetch failed: {exc}")

    now = datetime.now(timezone.utc)

    integration.last_sync = now
    integration.cached_scan = data
    integration.cached_scan_at = now
    db.commit()

    return {
        **data,
        "_cache": {"hit": False, "cached_at": now.isoformat(), "age_seconds": 0},
    }
