import asyncio
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.db.models import Integration
from app.core.encryption import decrypt
from app.services.integrations.mongodb.sync import MongoDBSyncService

router = APIRouter(
    prefix="/api/integrations",
    tags=["MongoDB"],
)

# Intentionally the ONLY endpoint in this file. MongoDB integrations are
# scoped to project activity logs for security analysis - there is no
# route here (and there should never be one) that reads cluster data,
# collections, or documents. The Atlas Admin API used by
# MongoDBSyncService physically cannot reach that data anyway; it only
# ever returns project/event metadata.


def _get_mongodb_integration_or_404(integration_id: str, db: Session) -> Integration:
    integration = (
        db.query(Integration)
        .filter(Integration.id == integration_id)
        .first()
    )

    if integration is None:
        raise HTTPException(status_code=404, detail="Integration not found.")

    if integration.provider != "mongodb":
        raise HTTPException(status_code=400, detail="Only available for MongoDB integrations.")

    return integration


@router.get("/{integration_id}/mongodb/logs")
async def mongodb_logs(
    integration_id: str,
    db: Session = Depends(get_db),
):
    integration = _get_mongodb_integration_or_404(integration_id, db)
    creds = {
        key: decrypt(value)
        for key, value in integration.encrypted_credentials.items()
    }

    try:
        service = MongoDBSyncService(
            public_key=creds.get("public_key"),
            private_key=creds.get("private_key"),
            group_id=creds.get("group_id"),
        )
        data = await asyncio.wait_for(
            asyncio.get_event_loop().run_in_executor(None, service.logs),
            timeout=30.0,
        )
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="MongoDB Atlas log fetch timed out.")
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"MongoDB Atlas log fetch failed: {exc}")

    integration.last_sync = datetime.now(timezone.utc)
    db.commit()

    return data
