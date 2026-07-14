from sqlalchemy.orm import Session
from app.db.models import Analysis, Conversation, ConversationMessage


def save_analysis(db: Session, result: dict, session_id: str | None = None, user_id: str | None = None) -> Analysis:
    """Persist a structured analysis result dict (the same shape your routers
    already return to the frontend) as a row in the analyses table.

    Call this right before returning a result of type "analysis" from
    chat.py or analyze.py. Safe to call even if some fields are missing.

    user_id ties the row to the account that ran the analysis so history
    (see routers/history.py) only ever shows that account's own lookups.
    """
    row = Analysis(
        indicator=result.get("indicator", ""),
        indicator_type=result.get("indicator_type", "unknown"),
        verdict=result.get("verdict", "unknown"),
        score=str(result.get("score", "")),
        headline=result.get("headline"),
        recommendation=result.get("recommendation"),
        findings=result.get("findings"),
        sources=result.get("sources"),
        raw=result.get("raw"),
        session_id=session_id or result.get("session_id"),
        user_id=user_id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


# ==========================================================
# Conversations
# ==========================================================

TITLE_MAX_LEN = 40


def create_conversation(db: Session, user_id: str) -> Conversation:
    convo = Conversation(user_id=user_id)
    db.add(convo)
    db.commit()
    db.refresh(convo)
    return convo


def list_conversations(db: Session, user_id: str) -> list[Conversation]:
    return (
        db.query(Conversation)
        .filter(Conversation.user_id == user_id)
        .order_by(Conversation.last_message_at.desc())
        .all()
    )


def get_conversation(db: Session, conversation_id: str, user_id: str) -> Conversation | None:
    """Scoped to user_id in the query itself (same pattern as
    core/ownership.get_owned_integration) so another account's
    conversation id just looks like a 404, not a 403."""
    return (
        db.query(Conversation)
        .filter(Conversation.id == conversation_id, Conversation.user_id == user_id)
        .first()
    )


def delete_conversation(db: Session, conversation: Conversation) -> None:
    db.delete(conversation)
    db.commit()


def rename_conversation(db: Session, conversation: Conversation, title: str) -> Conversation:
    conversation.title = title
    db.commit()
    db.refresh(conversation)
    return conversation


def append_message(
    db: Session,
    conversation: Conversation,
    role: str,
    content: str,
    message_type: str = "text",
    analysis_id: str | None = None,
) -> ConversationMessage:
    """Persist one turn and bump the conversation's last_message_at (which
    drives sidebar ordering). Auto-titles the conversation from the first
    user message if it doesn't have a title yet -- cheap truncation rather
    than a separate LLM call, see design doc section 4.3.
    """
    from datetime import datetime, timezone

    msg = ConversationMessage(
        conversation_id=conversation.id,
        role=role,
        content=content,
        message_type=message_type,
        analysis_id=analysis_id,
    )
    db.add(msg)

    conversation.last_message_at = datetime.now(timezone.utc)

    if not conversation.title and role == "user":
        stripped = content.strip()
        conversation.title = (
            stripped[:TITLE_MAX_LEN] + "…" if len(stripped) > TITLE_MAX_LEN else stripped
        ) or "New chat"

    db.commit()
    db.refresh(msg)
    return msg
