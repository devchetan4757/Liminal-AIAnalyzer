import asyncio
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.db.models import User
from app.core.encryption import decrypt
from app.core.deps import get_current_user
from app.core.ownership import get_owned_integration
from app.services.integrations.supabase.sync import SupabaseSyncService

router = APIRouter(
    prefix="/api/integrations",
    tags=["Supabase"],
)

# Intentionally the ONLY endpoint in this file. Supabase integrations are
# scoped to project/branch metadata for security monitoring - there is
# no route here (and there should never be one) that reads connection
# strings, service-role/anon keys, or database contents.

# Same cached_scan / cached_scan_at columns and 15-minute TTL reuse as
# GitHub, Render, Neon, and Vercel - generic columns on the Integration
# model, no migration needed.
SUPABASE_CACHE_TTL = timedelta(minutes=15)


@router.get("/{integration_id}/supabase/status")
async def supabase_status(
    integration_id: str,
    refresh: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    integration = get_owned_integration(db, integration_id, current_user.id, provider="supabase")

    # Serve from cache unless it's missing, stale, or the caller asked to
    # bypass it.
    if not refresh and integration.cached_scan and integration.cached_scan_at:
        cached_at = integration.cached_scan_at
        if isinstance(cached_at, str):
            cached_at = datetime.fromisoformat(cached_at)
        if cached_at.tzinfo is None:
            cached_at = cached_at.replace(tzinfo=timezone.utc)

        age = datetime.now(timezone.utc) - cached_at
        if age < SUPABASE_CACHE_TTL:
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
        service = SupabaseSyncService(api_key)
        data = await asyncio.wait_for(
            asyncio.get_event_loop().run_in_executor(None, service.logs),
            timeout=45.0,
        )
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="Supabase status fetch timed out.")
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Supabase status fetch failed: {exc}")

    now = datetime.now(timezone.utc)

    integration.last_sync = now
    integration.cached_scan = data
    integration.cached_scan_at = now
    db.commit()

    return {
        **data,
        "_cache": {"hit": False, "cached_at": now.isoformat(), "age_seconds": 0},
    }
