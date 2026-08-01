import asyncio
from datetime import datetime, timezone, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, field_validator
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.db.models import User
from app.db.crud import record_uptime_check, get_uptime_checks
from app.core.encryption import decrypt
from app.core.deps import get_current_user
from app.core.ownership import get_owned_integration
from app.core.env_vars import EnvVarItem, validate_env_var_list
from app.services.integrations.render.sync import RenderSyncService
from app.services.integrations.render.uptime import check_url, summarize

router = APIRouter(
    prefix="/api/integrations",
    tags=["Render"],
)

RENDER_CACHE_TTL = timedelta(minutes=15)


class CreateServiceRequest(BaseModel):
    name: str
    type: str
    owner_id: str
    repo: Optional[str] = None
    branch: Optional[str] = None
    root_dir: Optional[str] = None
    auto_deploy: bool = True
    runtime: Optional[str] = None
    build_command: Optional[str] = None
    start_command: Optional[str] = None
    publish_path: Optional[str] = None
    image_url: Optional[str] = None
    dockerfile_path: Optional[str] = None
    docker_context: Optional[str] = None
    region: Optional[str] = None
    plan: Optional[str] = None
    num_instances: Optional[int] = 1
    schedule: Optional[str] = None
    pull_request_previews: Optional[bool] = None
    env_vars: Optional[List[EnvVarItem]] = None
    advanced_config: Optional[dict] = None

    @field_validator("env_vars")
    @classmethod
    def validate_env_vars(cls, v: Optional[List[EnvVarItem]]) -> Optional[List[EnvVarItem]]:
        return validate_env_var_list(v)


@router.get("/{integration_id}/render/status")
async def render_status(
    integration_id: str,
    refresh: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    integration = get_owned_integration(db, integration_id, current_user.id, provider="render")

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


@router.get("/{integration_id}/render/services/{service_id}/performance")
async def render_service_performance(
    integration_id: str,
    service_id: str,
    hours: int = Query(3, ge=1, le=168),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Real response-time / uptime history for a single service.

    Replaces the old CPU%/memory panel, which called Render's /metrics
    endpoint - that 403/422s for Free-tier instance types, so it was
    permanently broken for most services. This instead looks up the
    service's own public URL (a plain /services/{id} call, available on
    every plan) and makes a genuine HTTP request straight to it, timing
    the response. That single fresh check is persisted alongside every
    past check for this service, and the full history for the requested
    window is returned - so "how the web app is actually performing"
    (is it up, how fast does it answer) builds up over time regardless
    of Render plan, instead of depending on a paid-only metrics API.
    """
    integration = get_owned_integration(db, integration_id, current_user.id, provider="render")
    api_key = decrypt(integration.encrypted_credentials["api_key"])
    svc = RenderSyncService(api_key)

    try:
        service_url = await asyncio.wait_for(
            asyncio.get_event_loop().run_in_executor(None, lambda: svc.get_service_url(service_id)),
            timeout=20.0,
        )
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="Timed out looking up the service's URL.")
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Could not look up the service's URL: {exc}")

    try:
        result = await asyncio.wait_for(
            asyncio.get_event_loop().run_in_executor(None, lambda: check_url(service_url)),
            timeout=15.0,
        )
    except asyncio.TimeoutError:
        result = {
            "is_up": False,
            "status_code": None,
            "response_time_ms": None,
            "error": "Live check timed out after 15s.",
        }

    record_uptime_check(
        db,
        integration_id=integration_id,
        service_id=service_id,
        is_up=result["is_up"],
        status_code=result["status_code"],
        response_time_ms=result["response_time_ms"],
        error=result["error"],
    )

    since = datetime.now(timezone.utc) - timedelta(hours=hours)
    checks = get_uptime_checks(db, integration_id, service_id, since)

    points = [
        {
            "timestamp": (
                c.checked_at if c.checked_at.tzinfo else c.checked_at.replace(tzinfo=timezone.utc)
            ).isoformat(),
            "response_time_ms": c.response_time_ms,
            "is_up": c.is_up,
            "status_code": c.status_code,
        }
        for c in checks
    ]

    return {
        "service_id": service_id,
        "service_url": service_url,
        "last_error": checks[-1].error if checks and not checks[-1].is_up else None,
        **summarize(checks),
        "points": points,
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

    integration.cached_scan_at = None
    db.commit()

    return data
