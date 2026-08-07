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
from app.services.integrations.vercel.sync import VercelSyncService

# Reused as-is: this is a generic "GET a URL, time it" helper with no
# Render-specific logic (see its own module docstring), and the crud
# functions above already persist against the provider-agnostic
# ServiceUptimeCheck table. Same convention as sharing env_vars.py /
# ownership.py across every integration router instead of forking them.
from app.services.integrations.render.uptime import check_url, summarize

router = APIRouter(
    prefix="/api/integrations",
    tags=["Vercel"],
)

# Read-only status endpoint, plus project creation (a settings-form
# operation, not a one-click action - same convention as
# routers/render.py and routers/netlify.py). The one-click lifecycle
# actions (redeploy, cancel_deployment, promote, delete_deployment) are
# NOT here - those go through the shared, registry-driven
# /api/remote-actions router (see app/services/remote_actions/registry.py)
# since they're generic across providers - same split Render uses.

# Same TTL and reuse of the cached_scan / cached_scan_at columns that
# Render's status endpoint uses (see routers/render.py). Those columns
# are generic on the Integration model, so no migration is needed to
# reuse them here. A full status() fans out to one deployments request
# per project, so this avoids re-running that on every dashboard load/poll.
VERCEL_CACHE_TTL = timedelta(minutes=15)


class CreateProjectRequest(BaseModel):
    name: str
    repo: Optional[str] = None
    repo_provider: Optional[str] = "github"
    framework: Optional[str] = None
    root_directory: Optional[str] = None
    build_command: Optional[str] = None
    install_command: Optional[str] = None
    output_directory: Optional[str] = None
    env_vars: Optional[List[EnvVarItem]] = None

    @field_validator("env_vars")
    @classmethod
    def validate_env_vars(cls, v: Optional[List[EnvVarItem]]) -> Optional[List[EnvVarItem]]:
        return validate_env_var_list(v)


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


@router.get("/{integration_id}/vercel/projects/{project_id}/performance")
async def vercel_project_performance(
    integration_id: str,
    project_id: str,
    hours: int = Query(3, ge=1, le=168),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Real response-time / uptime history for a single project, keyed by
    project_id (stable) rather than deployment_id (a new one every
    deploy). Same approach as render_service_performance in
    routers/render.py: Vercel has no "current CPU/memory" metrics API
    for a project either, so this looks up the project's latest-
    deployment URL and makes a genuine HTTP request straight to it,
    timing the response, then persists that check alongside the
    project's past checks.
    """
    integration = get_owned_integration(db, integration_id, current_user.id, provider="vercel")
    creds = integration.encrypted_credentials
    api_key = decrypt(creds["api_key"])
    team_id = decrypt(creds["team_id"]) if creds.get("team_id") else None
    svc = VercelSyncService(api_key, team_id)

    try:
        project_url = await asyncio.wait_for(
            asyncio.get_event_loop().run_in_executor(None, lambda: svc.get_project_url(project_id)),
            timeout=20.0,
        )
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="Timed out looking up the project's URL.")
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Could not look up the project's URL: {exc}")

    try:
        result = await asyncio.wait_for(
            asyncio.get_event_loop().run_in_executor(None, lambda: check_url(project_url)),
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
        service_id=project_id,
        is_up=result["is_up"],
        status_code=result["status_code"],
        response_time_ms=result["response_time_ms"],
        error=result["error"],
    )

    since = datetime.now(timezone.utc) - timedelta(hours=hours)
    checks = get_uptime_checks(db, integration_id, project_id, since)

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
        "project_id": project_id,
        "project_url": project_url,
        "last_error": checks[-1].error if checks and not checks[-1].is_up else None,
        **summarize(checks),
        "points": points,
    }


@router.get("/{integration_id}/vercel/deployments/{deployment_id}/logs")
async def vercel_deployment_logs(
    integration_id: str,
    deployment_id: str,
    limit: int = 100,
    type: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    integration = get_owned_integration(db, integration_id, current_user.id, provider="vercel")
    creds = integration.encrypted_credentials
    api_key = decrypt(creds["api_key"])
    team_id = decrypt(creds["team_id"]) if creds.get("team_id") else None

    try:
        service = VercelSyncService(api_key, team_id)
        data = await asyncio.wait_for(
            asyncio.get_event_loop().run_in_executor(
                None, lambda: service.deployment_logs(deployment_id, limit=limit, log_type=type)
            ),
            timeout=30.0,
        )
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="Vercel log fetch timed out.")
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Vercel log fetch failed: {exc}")

    return data


@router.post("/{integration_id}/vercel/projects")
async def vercel_create_project(
    integration_id: str,
    req: CreateProjectRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    integration = get_owned_integration(db, integration_id, current_user.id, provider="vercel")

    creds = integration.encrypted_credentials
    api_key = decrypt(creds["api_key"])
    team_id = decrypt(creds["team_id"]) if creds.get("team_id") else None

    try:
        service = VercelSyncService(api_key, team_id)
        result = await asyncio.wait_for(
            asyncio.get_event_loop().run_in_executor(None, service.create_project, req.dict()),
            timeout=45.0,
        )
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="Vercel project creation timed out.")
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Vercel project creation failed: {exc}")

    # Invalidate the cached dashboard status so the next load reflects
    # the new project instead of a stale snapshot.
    integration.cached_scan_at = None
    db.commit()

    return result
