import asyncio
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.db.models import Integration
from app.core.encryption import decrypt
from app.services.integrations.neon.sync import NeonSyncService

router = APIRouter(
    prefix="/api/integrations",
    tags=["Neon"],
)

# Intentionally the ONLY endpoint in this file. Neon integrations are
# scoped to project/branch/operation metadata for security monitoring -
# there is no route here (and there should never be one) that reads
# connection strings, role passwords, or database contents.

# Same cached_scan / cached_scan_at columns and 15-minute TTL reuse as
# GitHub, Render, and UptimeRobot - generic columns on the Integration
# model, no migration needed.
NEON_CACHE_TTL = timedelta(minutes=15)


def _get_neon_integration_or_404(integration_id: str, db: Session) -> Integration:
    integration = (
        db.query(Integration)
        .filter(Integration.id == integration_id)
        .first()
    )

    if integration is None:
        raise HTTPException(status_code=404, detail="Integration not found.")

    if integration.provider != "neon":
        raise HTTPException(status_code=400, detail="Only available for Neon integrations.")

    return integration


@router.get("/{integration_id}/neon/status")
async def neon_status(
    integration_id: str,
    refresh: bool = False,
    db: Session = Depends(get_db),
):
    integration = _get_neon_integration_or_404(integration_id, db)

    # Serve from cache unless it's missing, stale, or the caller asked to
    # bypass it.
    if not refresh and integration.cached_scan and integration.cached_scan_at:
        cached_at = integration.cached_scan_at
        if isinstance(cached_at, str):
            cached_at = datetime.fromisoformat(cached_at)
        if cached_at.tzinfo is None:
            cached_at = cached_at.replace(tzinfo=timezone.utc)

        age = datetime.now(timezone.utc) - cached_at
        if age < NEON_CACHE_TTL:
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
        service = NeonSyncService(api_key)
        data = await asyncio.wait_for(
            asyncio.get_event_loop().run_in_executor(None, service.logs),
            timeout=45.0,
        )
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="Neon status fetch timed out.")
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Neon status fetch failed: {exc}")

    now = datetime.now(timezone.utc)

    integration.last_sync = now
    integration.cached_scan = data
    integration.cached_scan_at = now
    db.commit()

    return {
        **data,
        "_cache": {"hit": False, "cached_at": now.isoformat(), "age_seconds": 0},
    }
