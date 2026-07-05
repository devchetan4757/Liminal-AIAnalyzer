import asyncio
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.db.models import Integration
from app.core.encryption import decrypt
from app.services.integrations.uptimerobot.sync import UptimeRobotSyncService

router = APIRouter(
    prefix="/api/integrations",
    tags=["UptimeRobot"],
)

# Status/read endpoint plus monitor create/edit/detail live here. The
# one-click lifecycle actions (pause/resume/reset/delete) are NOT here -
# those go through the shared, registry-driven /api/remote-actions
# router (see app/services/remote_actions/registry.py) since they're
# generic across providers. Create/edit are settings-form operations
# specific to UptimeRobot's monitor config, so they get dedicated routes
# instead of being shoehorned into the generic remote-actions shape.

# Reuses the same cached_scan / cached_scan_at columns and 15-minute TTL
# as GitHub and Render - generic columns on the Integration model, no
# migration needed.
UPTIMEROBOT_CACHE_TTL = timedelta(minutes=15)


class MonitorConfigRequest(BaseModel):
    friendly_name: str
    type: str
    url: Optional[str] = None
    interval: Optional[int] = 300
    timeout: Optional[int] = 30
    port: Optional[int] = None
    keyword_type: Optional[str] = None
    keyword_case_type: Optional[str] = None
    keyword_value: Optional[str] = None
    # Escape hatch for monitor-type-specific fields (DNS, API assertions,
    # UDP thresholds, custom headers, etc.) that don't have a dedicated
    # form field. Passed straight through into the "config" object v3
    # expects - see _build_monitor_body in sync.py.
    advanced_config: Optional[dict] = None


def _get_uptimerobot_integration_or_404(integration_id: str, db: Session) -> Integration:
    integration = (
        db.query(Integration)
        .filter(Integration.id == integration_id)
        .first()
    )

    if integration is None:
        raise HTTPException(status_code=404, detail="Integration not found.")

    if integration.provider != "uptimerobot":
        raise HTTPException(status_code=400, detail="Only available for UptimeRobot integrations.")

    return integration


def _service_for(integration: Integration) -> UptimeRobotSyncService:
    api_key = decrypt(integration.encrypted_credentials["api_key"])
    return UptimeRobotSyncService(api_key)


@router.get("/{integration_id}/uptimerobot/status")
async def uptimerobot_status(
    integration_id: str,
    refresh: bool = False,
    db: Session = Depends(get_db),
):
    integration = _get_uptimerobot_integration_or_404(integration_id, db)

    if not refresh and integration.cached_scan and integration.cached_scan_at:
        cached_at = integration.cached_scan_at
        if isinstance(cached_at, str):
            cached_at = datetime.fromisoformat(cached_at)
        if cached_at.tzinfo is None:
            cached_at = cached_at.replace(tzinfo=timezone.utc)

        age = datetime.now(timezone.utc) - cached_at
        if age < UPTIMEROBOT_CACHE_TTL:
            return {
                **integration.cached_scan,
                "_cache": {
                    "hit": True,
                    "cached_at": cached_at.isoformat(),
                    "age_seconds": int(age.total_seconds()),
                },
            }

    try:
        service = _service_for(integration)
        data = await asyncio.wait_for(
            asyncio.get_event_loop().run_in_executor(None, service.logs),
            timeout=30.0,
        )
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="UptimeRobot status fetch timed out.")
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"UptimeRobot status fetch failed: {exc}")

    now = datetime.now(timezone.utc)

    integration.last_sync = now
    integration.cached_scan = data
    integration.cached_scan_at = now
    db.commit()

    return {
        **data,
        "_cache": {"hit": False, "cached_at": now.isoformat(), "age_seconds": 0},
    }


@router.get("/{integration_id}/uptimerobot/monitors/{monitor_id}")
async def uptimerobot_get_monitor(
    integration_id: str,
    monitor_id: str,
    db: Session = Depends(get_db),
):
    """Full monitor config, used to pre-fill the edit form."""
    integration = _get_uptimerobot_integration_or_404(integration_id, db)

    try:
        service = _service_for(integration)
        data = await asyncio.wait_for(
            asyncio.get_event_loop().run_in_executor(None, service.get_monitor, monitor_id),
            timeout=20.0,
        )
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="UptimeRobot request timed out.")
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Could not fetch monitor: {exc}")

    return data


@router.post("/{integration_id}/uptimerobot/monitors")
async def uptimerobot_create_monitor(
    integration_id: str,
    req: MonitorConfigRequest,
    db: Session = Depends(get_db),
):
    integration = _get_uptimerobot_integration_or_404(integration_id, db)

    try:
        service = _service_for(integration)
        data = await asyncio.wait_for(
            asyncio.get_event_loop().run_in_executor(None, service.create_monitor, req.dict()),
            timeout=30.0,
        )
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="UptimeRobot request timed out.")
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Could not create monitor: {exc}")

    # Invalidate the cached status so the next dashboard load picks up
    # the new monitor instead of a stale cache.
    integration.cached_scan_at = None
    db.commit()

    return data


@router.patch("/{integration_id}/uptimerobot/monitors/{monitor_id}")
async def uptimerobot_update_monitor(
    integration_id: str,
    monitor_id: str,
    req: MonitorConfigRequest,
    db: Session = Depends(get_db),
):
    integration = _get_uptimerobot_integration_or_404(integration_id, db)

    try:
        service = _service_for(integration)
        data = await asyncio.wait_for(
            asyncio.get_event_loop().run_in_executor(None, service.update_monitor, monitor_id, req.dict()),
            timeout=30.0,
        )
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="UptimeRobot request timed out.")
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Could not update monitor: {exc}")

    integration.cached_scan_at = None
    db.commit()

    return data
