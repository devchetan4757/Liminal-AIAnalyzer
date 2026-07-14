from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core import llm, memory
from app.core.aggregator import aggregate, quick_score
from app.core.context import build_integration_context
from app.core.indicator import detect_indicator
from app.core.deps import get_current_user
from app.core.ownership import get_owned_conversation
from app.db.session import get_db
from app.db.models import User
from app.db import crud
from app.db.crud import save_analysis
from app.models.schemas import ChatMessage

router = APIRouter()


def _get_or_create_conversation(db: Session, conversation_id: str | None, user: User):
    """Loads the caller's conversation if an id was given, otherwise mints
    a fresh one -- so "just start typing" without ever calling
    POST /conversations still works."""
    if conversation_id:
        return get_owned_conversation(db, conversation_id, user.id)
    return crud.create_conversation(db, user.id)


def _hydrate_memory(db: Session, conversation) -> None:
    """Replay persisted turns into the in-RAM session if this process
    hasn't seen this conversation_id yet (fresh backend restart, or first
    message after resuming an old conversation from the sidebar)."""
    turns = [
        {"role": m.role, "content": m.content}
        for m in conversation.messages
        if m.message_type != "analysis"  # analysis turns are re-added via memory.set_last_analysis elsewhere; keep replay to plain Q&A text
    ]
    memory.hydrate(conversation.id, turns)


@router.post("/message")
async def handle_message(
    msg: ChatMessage,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    conversation = _get_or_create_conversation(db, msg.conversation_id, current_user)
    session_id = conversation.id
    _hydrate_memory(db, conversation)

    crud.append_message(db, conversation, role="user", content=msg.text)

    indicator_type, indicator = detect_indicator(msg.text)

    if not indicator_type:
        integration_context = build_integration_context(current_user.id, db)
        reply = llm.answer_question(
            msg.text,
            session_id=session_id,
            extra_system=integration_context,
        )
        crud.append_message(db, conversation, role="assistant", content=reply)

        return {
            "type": "text",
            "content": reply,
            "conversation_id": session_id,
            "user": current_user.username
        }

    raw, sources, found = await aggregate(indicator_type, indicator)

    if not found:
        reply = (
            f"No threat-intel data found for this {indicator_type} across "
            f"{', '.join(sources) or 'the available sources'}. "
            "It may simply be unseen or benign."
        )
        crud.append_message(db, conversation, role="assistant", content=reply)
        return {
            "type": "text",
            "content": reply,
            "found": False,
            "conversation_id": session_id,
            "user": current_user.username
        }

    structured = llm.summarize_analysis(
        indicator_type,
        indicator,
        raw,
        session_id=session_id
    )

    result = {
        "type": "analysis",
        "indicator": indicator,
        "indicator_type": indicator_type,
        "verdict": structured["verdict"],
        "score": quick_score(raw),
        "headline": structured["headline"],
        "findings": structured["findings"],
        "recommendation": structured["recommendation"],
        "sources": sources,
        "raw": raw,
        "found": True,
        "conversation_id": session_id,
    }

    analysis_row = save_analysis(db, result, session_id=session_id, user_id=current_user.id)
    crud.append_message(
        db,
        conversation,
        role="assistant",
        content=structured["headline"],
        message_type="analysis",
        analysis_id=analysis_row.id,
    )

    return {
        **result,
        "user": current_user.username
    }
