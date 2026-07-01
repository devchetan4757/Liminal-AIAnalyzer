from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import asyncio
from datetime import datetime, timezone, timedelta

from app.services.integrations.github.sync import GitHubSyncService
from app.db.resources import upsert_resource
from app.db.session import get_db
from app.db.models import Integration
from app.core.encryption import encrypt, decrypt
from app.services.integrations.registry import manager

router = APIRouter(
    prefix="/api/integrations",
    tags=["Integrations"],
)


# -------------------------
# LIST INTEGRATIONS
# -------------------------
@router.get("/")
def list_integrations(db: Session = Depends(get_db)):
    return (
        db.query(Integration)
        .order_by(Integration.created_at.desc())
        .all()
    )


# -------------------------
# CREATE INTEGRATION
# -------------------------
@router.post("/")
async def create_integration(
    payload: dict,
    db: Session = Depends(get_db),
):
    provider = payload.get("provider")
    display_name = payload.get("display_name")
    authentication_type = payload.get("authentication_type")
    credentials = payload.get("credentials", {})

    if provider == "github":
        token = credentials.get("token")
        if not token:
            raise HTTPException(
                status_code=400,
                detail="GitHub token is required.",
            )

        github = manager.build("github", token=token)
        await github.validate()

    encrypted = {
        k: encrypt(v)
        for k, v in credentials.items()
    }

    integration = Integration(
        provider=provider,
        display_name=display_name,
        authentication_type=authentication_type,
        encrypted_credentials=encrypted,
        status="connected",
    )

    db.add(integration)
    db.commit()
    db.refresh(integration)

    return integration


# -------------------------
# VALIDATE INTEGRATION
# -------------------------
@router.post("/{integration_id}/validate")
async def validate_integration(
    integration_id: str,
    db: Session = Depends(get_db),
):
    integration = (
        db.query(Integration)
        .filter(Integration.id == integration_id)
        .first()
    )

    if integration is None:
        raise HTTPException(status_code=404, detail="Integration not found.")

    # -------------------------
    # MongoDB validation
    # -------------------------
    if integration.provider == "mongodb":
        creds = {
            key: decrypt(value)
            for key, value in integration.encrypted_credentials.items()
            if not key.startswith("_")
        }

        provider = manager.build(
            "mongodb",
            public_key=creds.get("public_key"),
            private_key=creds.get("private_key"),
            group_id=creds.get("group_id"),
        )

        try:
            return await provider.validate()
        except Exception as exc:
            raise HTTPException(status_code=400, detail=str(exc))

    # -------------------------
    # GitHub validation
    # -------------------------
    if integration.provider == "github":
        token = decrypt(integration.encrypted_credentials["token"])
        github = manager.build("github", token=token)
        return await github.validate()

    raise HTTPException(
        status_code=400,
        detail="Provider not implemented yet.",
    )


# -------------------------
# SYNC INTEGRATION
# -------------------------
@router.post("/{integration_id}/sync")
async def sync_integration(
    integration_id: str,
    db: Session = Depends(get_db),
):
    integration = (
        db.query(Integration)
        .filter(Integration.id == integration_id)
        .first()
    )

    if integration is None:
        raise HTTPException(status_code=404, detail="Integration not found.")

    # -------------------------
    # MongoDB Sync
    # -------------------------
    if integration.provider == "mongodb":
        creds = {
            key: decrypt(value)
            for key, value in integration.encrypted_credentials.items()
            if not key.startswith("_")
        }

        provider = manager.build(
            "mongodb",
            public_key=creds.get("public_key"),
            private_key=creds.get("private_key"),
            group_id=creds.get("group_id"),
        )

        try:
            data = await provider.sync()
        except Exception as exc:
            raise HTTPException(
                status_code=502,
                detail=f"MongoDB Atlas sync failed: {exc}",
            )

        integration.account_identifier = creds.get("group_id")
        integration.last_sync = datetime.now(timezone.utc)
        db.commit()

        return data

    # -------------------------
    # GitHub Sync
    # -------------------------
    if integration.provider == "github":
        token = decrypt(integration.encrypted_credentials["token"])

        provider = manager.build("github", token=token)

        try:
            data = await provider.sync()
        except Exception as exc:
            raise HTTPException(
                status_code=502,
                detail=f"GitHub sync failed: {exc}",
            )

        integration.account_identifier = data["account"]["login"]
        integration.last_sync = datetime.now(timezone.utc)
        db.commit()

        for repo in data["repositories"]:
            upsert_resource(
                db=db,
                integration_id=integration.id,
                provider="github",
                resource_type="repository",
                external_id=repo["id"],
                name=repo["full_name"],
                metadata_json=repo,
            )

        return data

    raise HTTPException(
        status_code=400,
        detail="Sync not implemented for this provider.",
    )


# -------------------------
# DELETE INTEGRATION
# -------------------------
@router.delete("/{integration_id}")
def delete_integration(
    integration_id: str,
    db: Session = Depends(get_db),
):
    integration = (
        db.query(Integration)
        .filter(Integration.id == integration_id)
        .first()
    )

    if integration is None:
        raise HTTPException(status_code=404, detail="Integration not found.")

    db.delete(integration)
    db.commit()

    return {"success": True}


# -------------------------
# GITHUB SECURITY SCAN
# -------------------------
GITHUB_SCAN_CACHE_TTL = timedelta(minutes=15)


@router.get("/{integration_id}/github/security")
async def github_security(
    integration_id: str,
    refresh: bool = False,
    db: Session = Depends(get_db),
):
    integration = (
        db.query(Integration)
        .filter(Integration.id == integration_id)
        .first()
    )

    if integration is None:
        raise HTTPException(status_code=404, detail="Integration not found.")

    if integration.provider != "github":
        raise HTTPException(
            status_code=400,
            detail="Only available for GitHub integrations.",
        )

    # Serve from cache unless it's missing, stale, or the caller asked to
    # bypass it. security_scan() fans out to several API calls per repo, so
    # this avoids re-running the whole thing on every page load.
    if not refresh and integration.cached_scan and integration.cached_scan_at:
        cached_at = integration.cached_scan_at
        if isinstance(cached_at, str):
            cached_at = datetime.fromisoformat(cached_at)
        if cached_at.tzinfo is None:
            cached_at = cached_at.replace(tzinfo=timezone.utc)

        age = datetime.now(timezone.utc) - cached_at
        if age < GITHUB_SCAN_CACHE_TTL:
            return {
                **integration.cached_scan,
                "_cache": {
                    "hit": True,
                    "cached_at": cached_at.isoformat(),
                    "age_seconds": int(age.total_seconds()),
                },
            }

    token = decrypt(integration.encrypted_credentials["token"])

    try:
        service = GitHubSyncService(token)

        data = await asyncio.wait_for(
            asyncio.get_event_loop().run_in_executor(
                None,
                service.security_scan,
            ),
            timeout=90.0,
        )

    except asyncio.TimeoutError:
        raise HTTPException(
            status_code=504,
            detail="GitHub scan timed out. Try again or reduce repo count.",
        )
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"GitHub scan failed: {exc}",
        )

    now = datetime.now(timezone.utc)

    integration.last_sync = now
    integration.cached_scan = data
    integration.cached_scan_at = now
    db.commit()

    return {
        **data,
        "_cache": {"hit": False, "cached_at": now.isoformat(), "age_seconds": 0},
    }

# -------------------------
# GITHUB REPO PEEK
# -------------------------
@router.get("/{integration_id}/github/repo-peek")
async def github_repo_peek(
    integration_id: str,
    repo: str,
    db: Session = Depends(get_db),
):
    integration = (
        db.query(Integration)
        .filter(Integration.id == integration_id)
        .first()
    )

    if integration is None:
        raise HTTPException(status_code=404, detail="Integration not found.")

    token = decrypt(integration.encrypted_credentials["token"])

    try:
        service = GitHubSyncService(token)

        data = await asyncio.wait_for(
            asyncio.get_event_loop().run_in_executor(
                None,
                service.repo_peek,
                repo,
            ),
            timeout=30.0,
        )

    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="Repo peek timed out.")
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Repo peek failed: {exc}")

    return data
