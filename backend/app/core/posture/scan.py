"""Orchestrates a posture scan for one integration:

1. Decrypt its credential
2. Run every check registered for its provider (registry.py) concurrently
3. Diff the results against existing *open* SecurityFinding rows for
   this integration, keyed by (check_id, title) -- checks that no
   longer fire get auto-resolved, new ones get inserted, ones that
   still fire are left alone (so "detected_at" doesn't reset every
   scan and "resolve" isn't lost on a re-run).
4. Recompute the score from the (now up to date) open findings and
   store a PostureScore snapshot for the trend chart.

Requires the SecurityFinding / PostureScore models and the
credentials_rotated_at column described in the design doc -- see
db/models.py additions.
"""
import asyncio
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.core.encryption import decrypt
from app.core.posture.registry import get_checks_for_provider
from app.core.posture.scoring import compute_score
from app.db.models import Integration, SecurityFinding, PostureScore

# Same idea as PROVIDER_CREDENTIAL_KWARG in routers/remote_actions.py --
# which key in encrypted_credentials holds the thing a check actually
# needs (a bearer token / api key). Providers that don't fit either
# shape simply get no credential (checks for them should treat
# `credential` as optional).
PROVIDER_CREDENTIAL_KEY = {
    "github": "token",
    "netlify": "token",
    "render": "api_key",
    "neon": "api_key",
    "uptimerobot": "api_key",
    "mongodb": "api_key",
    "vercel": "api_key",
    "supabase": "api_key",
}


def _decrypt_primary_credential(integration: Integration) -> str | None:
    key_name = PROVIDER_CREDENTIAL_KEY.get(integration.provider)
    if not key_name:
        return None

    encrypted = integration.encrypted_credentials.get(key_name)
    return decrypt(encrypted) if encrypted else None


async def run_posture_scan(integration_id: str, db: Session) -> dict:
    integration = db.query(Integration).filter(Integration.id == integration_id).first()
    if integration is None:
        raise ValueError(f"No integration with id {integration_id}")

    credential = _decrypt_primary_credential(integration)
    checks = get_checks_for_provider(integration.provider)

    results = await asyncio.gather(
        *(check.run(integration, credential, db) for check in checks),
        return_exceptions=True,
    )

    fresh_findings: list[dict] = []
    for check, result in zip(checks, results):
        if isinstance(result, Exception):
            # One check failing (e.g. a transient API error) shouldn't
            # blank out every other check's findings for this scan.
            continue
        fresh_findings.extend(result)

    existing_open = (
        db.query(SecurityFinding)
        .filter(SecurityFinding.integration_id == integration.id, SecurityFinding.status == "open")
        .all()
    )
    existing_by_key = {(f.category, f.title): f for f in existing_open}
    fresh_by_key = {(f["category"], f["title"]): f for f in fresh_findings}

    now = datetime.now(timezone.utc)

    # Anything open before that didn't fire this time -> resolved.
    for key, row in existing_by_key.items():
        if key not in fresh_by_key:
            row.status = "resolved"
            row.resolved_at = now

    # Anything new this time that wasn't already open -> insert.
    for key, data in fresh_by_key.items():
        if key not in existing_by_key:
            db.add(
                SecurityFinding(
                    integration_id=integration.id,
                    category=data["category"],
                    severity=data["severity"],
                    title=data["title"],
                    detail=data.get("detail"),
                    status="open",
                    detected_at=now,
                )
            )

    db.flush()

    still_open = (
        db.query(SecurityFinding)
        .filter(SecurityFinding.integration_id == integration.id, SecurityFinding.status == "open")
        .all()
    )
    score, breakdown = compute_score(still_open)

    snapshot = PostureScore(
        integration_id=integration.id,
        score=score,
        computed_at=now,
        breakdown=breakdown,
    )
    db.add(snapshot)
    db.commit()

    return {
        "integration_id": integration.id,
        "score": score,
        "breakdown": breakdown,
        "open_findings": len(still_open),
        "checks_run": len(checks),
    }
