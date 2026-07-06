import asyncio
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.db.models import User
from app.core.encryption import decrypt
from app.core.deps import get_current_user
from app.core.ownership import get_owned_integration
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


@router.get("/{integration_id}/mongodb/logs")
async def mongodb_logs(
    integration_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    integration = get_owned_integration(db, integration_id, current_user.id, provider="mongodb")

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
