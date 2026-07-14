from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.db.models import Integration, Conversation


def get_owned_integration(
    db: Session,
    integration_id: str,
    user_id: str,
    provider: str = None,
) -> Integration:
    """Fetch an integration, scoped to the requesting account.

    Always filters by user_id in the same query rather than fetching by
    id and checking ownership after - so an integration belonging to a
    different account comes back as a plain 404, the same as one that
    doesn't exist at all. No 403s that would confirm someone else's
    integration id is valid.
    """
    integration = (
        db.query(Integration)
        .filter(Integration.id == integration_id, Integration.user_id == user_id)
        .first()
    )

    if integration is None:
        raise HTTPException(status_code=404, detail="Integration not found.")

    if provider and integration.provider != provider:
        raise HTTPException(status_code=400, detail=f"Only available for {provider} integrations.")

    return integration


def get_owned_conversation(
    db: Session,
    conversation_id: str,
    user_id: str,
) -> Conversation:
    """Same pattern as get_owned_integration - a conversation belonging to
    a different account is indistinguishable from one that doesn't exist."""
    conversation = (
        db.query(Conversation)
        .filter(Conversation.id == conversation_id, Conversation.user_id == user_id)
        .first()
    )

    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found.")

    return conversation
