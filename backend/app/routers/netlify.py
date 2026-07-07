import asyncio
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.db.models import User
from app.core.encryption import decrypt
from app.core.deps import get_current_user
from app.core.ownership import get_owned_integration
from app.services.integrations.netlify.sync import NetlifySyncService

router = APIRouter(
    prefix="/api/integrations",
    tags=["Netlify"],
)

# Read-only status endpoint, plus site creation (a settings-form
# operation, not a one-click action - same convention as
# routers/render.py and routers/uptimerobot.py). One-click lifecycle
# actions (redeploy, rollback, cancel, suspend, resume) live in
# app/routers/remote_actions.py - a single generic, registry-driven
# router shared across providers - not here.

# Same TTL/cache-column reuse pattern as render.py - cached_scan /
# cached_scan_at are generic columns on the Integration model, not
# provider-specific, so no migration is needed to reuse them here.
NETLIFY_CACHE_TTL = timedelta(minutes=15)


class CreateSiteRequest(BaseModel):
    name: Optional[str] = Field(default=None, max_length=100)
    repo: str
    repo_provider: Optional[str] = "github"
    branch: Optional[str] = "main"
    build_command: Optional[str] = None
    publish_dir: Optional[str] = None
    account_slug: Optional[str] = None


def _service_for(integration) -> NetlifySyncService:
    token = decrypt(integration.encrypted_credentials["token"])
    return NetlifySyncService(token)


@router.get("/{integration_id}/netlify/status")
async def netlify_status(
    integration_id: str,
    refresh: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    integration = get_owned_integration(db, integration_id, current_user.id, provider="netlify")

    if not refresh and integration.cached_scan and integration.cached_scan_at:
        cached_at = integration.cached_scan_at
        if isinstance(cached_at, str):
            cached_at = datetime.fromisoformat(cached_at)
        if cached_at.tzinfo is None:
            cached_at = cached_at.replace(tzinfo=timezone.utc)

        age = datetime.now(timezone.utc) - cached_at
        if age < NETLIFY_CACHE_TTL:
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
            timeout=45.0,
        )
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="Netlify status fetch timed out.")
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Netlify status fetch failed: {exc}")

    now = datetime.now(timezone.utc)

    integration.last_sync = now
    integration.cached_scan = data
    integration.cached_scan_at = now
    db.commit()

    return {
        **data,
        "_cache": {"hit": False, "cached_at": now.isoformat(), "age_seconds": 0},
    }


@router.get("/{integration_id}/netlify/accounts")
async def netlify_accounts(
    integration_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Teams this token can create a new site under - the create-site
    form needs this list before it can submit anything."""
    integration = get_owned_integration(db, integration_id, current_user.id, provider="netlify")
    service = _service_for(integration)

    try:
        return await asyncio.wait_for(
            asyncio.get_event_loop().run_in_executor(None, service.list_accounts),
            timeout=20.0,
        )
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="Netlify accounts fetch timed out.")
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Netlify accounts fetch failed: {exc}")


@router.post("/{integration_id}/netlify/sites")
async def netlify_create_site(
    integration_id: str,
    req: CreateSiteRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    integration = get_owned_integration(db, integration_id, current_user.id, provider="netlify")
    service = _service_for(integration)

    try:
        result = await asyncio.wait_for(
            asyncio.get_event_loop().run_in_executor(None, service.create_site, req.dict()),
            timeout=45.0,
        )
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="Netlify site creation timed out.")
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Netlify site creation failed: {exc}")

    # Invalidate the cached dashboard status so the next load reflects
    # the new site instead of a stale snapshot.
    integration.cached_scan_at = None
    db.commit()

    return result
