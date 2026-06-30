import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core import llm
from app.core.aggregator import aggregate, quick_score
from app.core.indicator import detect_indicator
from app.core.deps import auth_guard
from app.db.session import get_db
from app.db.crud import save_analysis
from app.models.schemas import ChatMessage

router = APIRouter()


def get_username(user):
    return user.get("sub") or user.get("user") or "admin"


@router.post("/message")
async def handle_message(
    msg: ChatMessage,
    user=Depends(auth_guard),
    db: Session = Depends(get_db)
):
    session_id = msg.session_id or str(uuid.uuid4())

    indicator_type, indicator = detect_indicator(msg.text)

    if not indicator_type:
        reply = llm.answer_question(
            msg.text,
            session_id=session_id
        )

        return {
            "type": "text",
            "content": reply,
            "session_id": session_id,
            "user": get_username(user)
        }

    raw, sources, found = await aggregate(indicator_type, indicator)

    if not found:
        return {
            "type": "text",
            "content": (
                f"No threat-intel data found for this {indicator_type} across "
                f"{', '.join(sources) or 'the available sources'}. "
                "It may simply be unseen or benign."
            ),
            "found": False,
            "session_id": session_id,
            "user": get_username(user)
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
        "session_id": session_id,
    }

    save_analysis(db, result)

    return {
        **result,
        "user": get_username(user)
    }
