from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.core.ownership import get_owned_conversation
from app.db import crud
from app.db.models import Analysis, User
from app.db.session import get_db
from app.models.schemas import ConversationRenameRequest

router = APIRouter(
    prefix="/api/conversations",
    tags=["Conversations"],
)


def _serialize_summary(convo) -> dict:
    """List-view shape -- no messages, keeps the sidebar payload light."""
    return {
        "id": convo.id,
        "title": convo.title,
        "created_at": convo.created_at,
        "last_message_at": convo.last_message_at,
    }


def _serialize_message(db: Session, msg) -> dict:
    """Full-view shape for one turn. Analysis turns get re-hydrated from
    the Analysis row so the frontend can re-render the full card (verdict,
    findings, sources, etc.) instead of just the flattened text summary
    that's stored in `content`.
    """
    base = {
        "id": msg.id,
        "role": msg.role,
        "type": msg.message_type,
        "content": msg.content,
        "created_at": msg.created_at,
    }

    if msg.message_type == "analysis" and msg.analysis_id:
        analysis = db.query(Analysis).filter(Analysis.id == msg.analysis_id).first()
        if analysis:
            base.update(
                {
                    "indicator": analysis.indicator,
                    "indicator_type": analysis.indicator_type,
                    "verdict": analysis.verdict,
                    "score": analysis.score,
                    "headline": analysis.headline,
                    "findings": analysis.findings or [],
                    "recommendation": analysis.recommendation,
                    "sources": analysis.sources or [],
                    "found": True,
                }
            )

    return base


@router.get("")
def list_conversations(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    convos = crud.list_conversations(db, current_user.id)
    return [_serialize_summary(c) for c in convos]


@router.post("")
def create_conversation(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    convo = crud.create_conversation(db, current_user.id)
    return _serialize_summary(convo)


@router.get("/{conversation_id}")
def get_conversation(
    conversation_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    convo = get_owned_conversation(db, conversation_id, current_user.id)
    return {
        **_serialize_summary(convo),
        "messages": [_serialize_message(db, m) for m in convo.messages],
    }


@router.patch("/{conversation_id}")
def rename_conversation(
    conversation_id: str,
    req: ConversationRenameRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    convo = get_owned_conversation(db, conversation_id, current_user.id)
    convo = crud.rename_conversation(db, convo, req.title.strip() or "Untitled")
    return _serialize_summary(convo)


@router.delete("/{conversation_id}")
def delete_conversation(
    conversation_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    convo = get_owned_conversation(db, conversation_id, current_user.id)
    crud.delete_conversation(db, convo)
    return {"deleted": True, "id": conversation_id}
