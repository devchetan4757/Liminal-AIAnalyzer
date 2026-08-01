"""Refreshes each connected integration's cached_scan with live data from
its provider, right before core/context.py builds the LLM's integration
context - so chat answers reflect what's actually happening in the
user's services right now, not whatever was last loaded on a dashboard
visit (or never, if the user has never opened that dashboard).

Credential unpacking mirrors app/routers/integrations.py's
sync_integration endpoint (one block per provider, since each provider's
__init__ takes different kwargs) - this is the exact same
manager.build(...) + provider.sync() call each dashboard's own sync
button makes, just triggered from chat instead. provider.sync() already
returns the same "stats + buckets" shape the dashboards render from (see
e.g. RenderProvider.sync() / NetlifyProvider.sync()), so writing it
straight into cached_scan keeps this consistent with every dashboard,
which will show the same fresh data next time it's opened.

All stale integrations are synced concurrently (not one at a time) and
each is capped at PER_PROVIDER_TIMEOUT - with N integrations this keeps
total wait bounded at roughly one provider's worst-case latency instead
of N of them added together, which is what was blowing past the
frontend's chat request timeout.
"""
import asyncio
from datetime import datetime, timezone, timedelta

from sqlalchemy.orm import Session

from app.core.encryption import decrypt
from app.db.models import Integration
from app.services.integrations.registry import manager

# Skip re-syncing an integration that was refreshed more recently than
# this - keeps a burst of chat messages from hammering every provider's
# API on every single turn.
LIVE_SYNC_MIN_INTERVAL = timedelta(seconds=30)

# Hard cap per integration. A slow/unreachable provider gets skipped for
# this turn (it just keeps whatever was cached before, if anything)
# rather than holding up the whole chat reply.
PER_PROVIDER_TIMEOUT = 12.0


def _decrypt(creds: dict, key: str):
    return decrypt(creds[key]) if creds.get(key) else None


def _build_provider(integration: Integration):
    """Returns a live provider instance for this integration, or None if
    the provider isn't recognized (shouldn't happen in practice, but
    fails closed rather than raising and blocking the whole chat turn)."""
    creds = integration.encrypted_credentials or {}
    provider_name = integration.provider

    if provider_name == "mongodb":
        return manager.build(
            "mongodb",
            public_key=_decrypt(creds, "public_key"),
            private_key=_decrypt(creds, "private_key"),
            group_id=_decrypt(creds, "group_id"),
        )
    if provider_name == "github":
        return manager.build("github", token=_decrypt(creds, "token"))
    if provider_name == "render":
        return manager.build("render", api_key=_decrypt(creds, "api_key"))
    if provider_name == "uptimerobot":
        return manager.build("uptimerobot", api_key=_decrypt(creds, "api_key"))
    if provider_name == "neon":
        return manager.build("neon", api_key=_decrypt(creds, "api_key"))
    if provider_name == "netlify":
        return manager.build("netlify", token=_decrypt(creds, "token"))
    if provider_name == "vercel":
        return manager.build(
            "vercel", api_key=_decrypt(creds, "api_key"), team_id=_decrypt(creds, "team_id")
        )
    if provider_name == "supabase":
        return manager.build("supabase", api_key=_decrypt(creds, "api_key"))

    return None


def _is_stale(cached_scan_at, now) -> bool:
    if not cached_scan_at:
        return True
    if isinstance(cached_scan_at, str):
        cached_scan_at = datetime.fromisoformat(cached_scan_at)
    if cached_scan_at.tzinfo is None:
        cached_scan_at = cached_scan_at.replace(tzinfo=timezone.utc)
    return now - cached_scan_at >= LIVE_SYNC_MIN_INTERVAL


async def _sync_one(integration: Integration, now: datetime):
    """Returns (integration, data) on success, or (integration, None) on
    any failure/timeout - never raises, so gather() below can't have one
    bad integration take the others down with it."""
    try:
        provider = _build_provider(integration)
        if provider is None:
            return integration, None
        data = await asyncio.wait_for(provider.sync(), timeout=PER_PROVIDER_TIMEOUT)
        return integration, data
    except Exception:
        return integration, None


async def refresh_stale_integrations(user_id: str, db: Session) -> None:
    """Best-effort: syncs every connected integration whose cached_scan is
    missing or older than LIVE_SYNC_MIN_INTERVAL, so the context built
    right after this returns reflects live data. Runs all of them at
    once (see module docstring) - a single provider failing or timing
    out never blocks the others or the chat reply; that integration is
    just left with whatever was cached before, if anything.
    """
    integrations = (
        db.query(Integration).filter(Integration.user_id == user_id).all()
    )
    if not integrations:
        return

    now = datetime.now(timezone.utc)
    stale = [i for i in integrations if _is_stale(i.cached_scan_at, now)]
    if not stale:
        return

    results = await asyncio.gather(*(_sync_one(i, now) for i in stale))

    changed = False
    for integration, data in results:
        if data is None:
            continue
        integration.cached_scan = data
        integration.cached_scan_at = now
        integration.last_sync = now
        changed = True

    if changed:
        db.commit()
