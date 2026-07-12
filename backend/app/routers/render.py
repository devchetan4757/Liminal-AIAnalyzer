import asyncio
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.db.models import User
from app.core.encryption import decrypt
from app.core.deps import get_current_user
from app.core.ownership import get_owned_integration
from app.services.integrations.render.sync import RenderSyncService

router = APIRouter(
    prefix="/api/integrations",
    tags=["Render"],
)

# Read-only status endpoint, plus owners/create for the "New service"
# form. The one-click lifecycle actions (redeploy, rollback, restart,
# scale, suspend, resume, delete, run_job) are NOT here - those go
# through the shared, registry-driven /api/remote-actions router (see
# app/services/remote_actions/registry.py) since they're generic across
# providers. Create is a settings-form operation specific to Render's
# service config, so - same split as UptimeRobot's create_monitor - it
# gets its own dedicated route instead of being shoehorned into the
# generic remote-actions shape.

# Same TTL and reuse of the cached_scan / cached_scan_at columns that
# GitHub's security scan uses (see routers/integrations.py). Those
# columns are generic on the Integration model - not GitHub-specific -
# so no migration is needed to reuse them here. A full status() fans
# out to one deploys request per service, so this avoids re-running
# that on every dashboard load/poll.
RENDER_CACHE_TTL = timedelta(minutes=15)


class CreateServiceRequest(BaseModel):
    name: str
    type: str  # web_service | static_site | background_worker | private_service | cron_job
    owner_id: str
    repo: Optional[str] = None
    branch: Optional[str] = None
    root_dir: Optional[str] = None
    auto_deploy: bool = True
    runtime: Optional[str] = None  # node | python | ruby | go | rust | elixir | docker | image
    build_command: Optional[str] = None
    start_command: Optional[str] = None
    publish_path: Optional[str] = None  # static_site only
    image_url: Optional[str] = None  # runtime == image
    dockerfile_path: Optional[str] = None
    docker_context: Optional[str] = None
    region: Optional[str] = None
    plan: Optional[str] = None
    num_instances: Optional[int] = 1
    schedule: Optional[str] = None  # cron_job only
    pull_request_previews: Optional[bool] = None
    # Escape hatch for anything without a dedicated field above -
    # merged directly into serviceDetails, same pattern as
    # MonitorConfigRequest.advanced_config for UptimeRobot.
    advanced_config: Optional[dict] = None


@router.get("/{integration_id}/render/status")
async def render_status(
    integration_id: str,
    refresh: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    integration = get_owned_integration(db, integration_id, current_user.id, provider="render")

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


@router.get("/{integration_id}/render/services/{service_id}/logs")
async def render_service_logs(
    integration_id: str,
    service_id: str,
    limit: int = 100,
    type: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    On-demand raw log lines for a single service - fetched only when
    the user opens that service's log panel, not part of the cached
    /status summary above. Intentionally uncached: logs are a live-tail
    view, not something that should ever serve stale data out of
    cached_scan.
    """
    integration = get_owned_integration(db, integration_id, current_user.id, provider="render")
    api_key = decrypt(integration.encrypted_credentials["api_key"])

    try:
        service = RenderSyncService(api_key)
        data = await asyncio.wait_for(
            asyncio.get_event_loop().run_in_executor(
                None, lambda: service.service_logs(service_id, limit=limit, log_type=type)
            ),
            timeout=30.0,
        )
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="Render log fetch timed out.")
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Render log fetch failed: {exc}")

    return data


@router.get("/{integration_id}/render/owners")
async def render_list_owners(
    integration_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Workspaces/accounts this key can create services under - populates the owner dropdown."""
    integration = get_owned_integration(db, integration_id, current_user.id, provider="render")
    api_key = decrypt(integration.encrypted_credentials["api_key"])

    try:
        service = RenderSyncService(api_key)
        data = await asyncio.wait_for(
            asyncio.get_event_loop().run_in_executor(None, service.owners),
            timeout=15.0,
        )
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="Render request timed out.")
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Could not fetch owners: {exc}")

    return data


@router.post("/{integration_id}/render/services")
async def render_create_service(
    integration_id: str,
    req: CreateServiceRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    integration = get_owned_integration(db, integration_id, current_user.id, provider="render")
    api_key = decrypt(integration.encrypted_credentials["api_key"])

    try:
        service = RenderSyncService(api_key)
        data = await asyncio.wait_for(
            asyncio.get_event_loop().run_in_executor(None, service.create_service, req.dict()),
            timeout=30.0,
        )
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="Render request timed out.")
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Could not create service: {exc}")

    # Invalidate the cached status so the next dashboard load picks up
    # the new service instead of a stale cache.
    integration.cached_scan_at = None
    db.commit()

    return data
