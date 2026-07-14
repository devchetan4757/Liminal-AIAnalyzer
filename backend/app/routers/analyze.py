import os
import tempfile
import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.core import llm, memory
from app.core.aggregator import aggregate, quick_score
from app.core.indicator import sha256_of_file
from app.core.deps import get_current_user
from app.core.ownership import get_owned_conversation
from app.db.session import get_db
from app.db.models import User
from app.db import crud
from app.db.crud import save_analysis
from app.models.schemas import HashLookupRequest, IndicatorLookupRequest
from app.services import virustotal

router = APIRouter()

# Anything goes for *hashing* purposes, but we cap size to keep the API responsive
# and avoid someone uploading a multi-GB file to a free-tier backend.
MAX_UPLOAD_BYTES = 50 * 1024 * 1024  # 50 MB


def _get_or_create_conversation(db: Session, conversation_id: str | None, user: User):
    """Same pattern as routers/chat.py -- kept local rather than imported
    to avoid a chat.py <-> analyze.py import cycle."""
    if conversation_id:
        return get_owned_conversation(db, conversation_id, user.id)
    return crud.create_conversation(db, user.id)


async def _build_analysis(indicator_type: str, indicator: str, session_id: str = None):
    """Generalized to any indicator type. Previously hardcoded to "hash" --
    the hash-specific callers below now just pass indicator_type="hash" explicitly.
    """
    raw, sources, found = await aggregate(indicator_type, indicator)
    if not found:
        return None
    structured = llm.summarize_analysis(indicator_type, indicator, raw, session_id=session_id)
    return {
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


@router.post("/indicator")
async def analyze_indicator(
    req: IndicatorLookupRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Manual analysis entry point -- type is explicit, not auto-detected.
    This is what the Manual Analysis page calls directly, independent of chat,
    so it intentionally stays on its own ephemeral session_id rather than
    the persisted Conversation model (see docs/ai-context-and-conversations.md).
    """
    indicator_type = req.indicator_type.strip().lower()
    if indicator_type not in {"hash", "url", "ip", "domain"}:
        raise HTTPException(status_code=400, detail=f"Unsupported indicator_type: {indicator_type}")

    session_id = req.session_id or str(uuid.uuid4())

    try:
        result = await _build_analysis(indicator_type, req.indicator.strip(), session_id=session_id)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Threat-intel lookup failed: {exc}")

    if result is None:
        return {
            "type": "text",
            "content": (
                f"No threat-intel data found for this {indicator_type} across any "
                "configured source. It may simply be unseen or benign."
            ),
            "found": False,
            "session_id": session_id,
        }

    save_analysis(db, result, session_id=session_id, user_id=current_user.id)
    return result


@router.post("/hash")
async def analyze_hash(
    req: HashLookupRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Step 1: frontend computed the SHA256 client-side, no file left the browser yet."""
    conversation = _get_or_create_conversation(db, req.conversation_id, current_user)
    session_id = conversation.id

    crud.append_message(
        db, conversation, role="user",
        content=f"[Uploaded file: {req.filename or 'unnamed'} (hash {req.hash[:16]}…)]",
        message_type="file",
    )

    try:
        result = await _build_analysis("hash", req.hash, session_id=session_id)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Threat-intel lookup failed: {exc}")

    if result is None:
        crud.append_message(
            db, conversation, role="assistant",
            content="not_found", message_type="text",
        )
        return {
            "type": "text",
            "content": "not_found",
            "found": False,
            "conversation_id": session_id,
        }

    analysis_row = save_analysis(db, result, session_id=session_id, user_id=current_user.id)
    crud.append_message(
        db, conversation, role="assistant",
        content=result["headline"], message_type="analysis",
        analysis_id=analysis_row.id,
    )
    return result


@router.post("/upload")
async def analyze_upload(
    file: UploadFile = File(...),
    conversation_id: str = Form(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Step 2 (fallback): hash was unknown everywhere, user confirmed a real upload.

    Note: this endpoint hashes ANY file type -- malware doesn't announce itself via
    extension, and a .css/.txt/.jpg can just as easily be a renamed payload or contain
    embedded content. We don't reject by file type. We do cap size and we surface real
    errors instead of swallowing them.
    """
    conversation = _get_or_create_conversation(db, conversation_id, current_user)
    session_id = conversation.id

    contents = await file.read()
    if len(contents) == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")
    if len(contents) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File too large ({len(contents) / 1_000_000:.1f} MB). Max is "
            f"{MAX_UPLOAD_BYTES / 1_000_000:.0f} MB.",
        )

    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False) as tmp:
            tmp.write(contents)
            tmp_path = tmp.name

        file_hash = sha256_of_file(tmp_path)
    finally:
        if tmp_path:
            os.unlink(tmp_path)

    try:
        result = await _build_analysis("hash", file_hash, session_id=session_id)
    except Exception as exc:
        # Previously an unhandled exception here (e.g. a timed-out/failed call to one
        # of the threat-intel services) would bubble up as a raw 500 and the frontend
        # would show a generic "Upload scan failed." with no detail. Now we return a
        # clear, specific error instead of failing silently.
        raise HTTPException(
            status_code=502,
            detail=f"One or more threat-intel services failed to respond: {exc}",
        )

    if result is not None:
        analysis_row = save_analysis(db, result, session_id=session_id, user_id=current_user.id)
        crud.append_message(
            db, conversation, role="assistant",
            content=result["headline"], message_type="analysis",
            analysis_id=analysis_row.id,
        )
        return result

    # Nothing in our threat-intel sources knows this hash. Submit the actual
    # file bytes to VirusTotal for fresh static + dynamic sandbox analysis,
    # rather than just reporting "not found" and stopping there.
    submission = await virustotal.submit_file(contents, file.filename or "upload")

    if submission is None:
        # No VT_API_KEY configured -- fall back to the old "not found" message.
        content = (
            f"File hash {file_hash} wasn't found in any free threat-intel database. "
            "That means it's either brand new/unseen or benign -- no automatic verdict "
            "is available from these sources."
        )
        crud.append_message(db, conversation, role="assistant", content=content)
        return {
            "type": "text",
            "content": content,
            "found": False,
            "conversation_id": session_id,
        }

    if "error" in submission:
        raise HTTPException(
            status_code=502,
            detail=f"Could not submit file to VirusTotal sandbox: {submission['error']}",
        )

    memory.set_pending_sandbox_job(
        session_id,
        analysis_id=submission["analysis_id"],
        file_hash=file_hash,
        filename=file.filename or "upload",
    )

    content = (
        f"This file ({file.filename or file_hash[:16] + '…'}) hasn't been seen by any "
        "threat-intel source before. Submitting it to VirusTotal's sandbox for live "
        "analysis -- this can take anywhere from 30 seconds to a few minutes."
    )
    crud.append_message(db, conversation, role="assistant", content=content)

    return {
        "type": "sandbox_pending",
        "content": content,
        "analysis_id": submission["analysis_id"],
        "file_hash": file_hash,
        "conversation_id": session_id,
        "found": False,
    }


@router.get("/sandbox-status")
async def sandbox_status(
    conversation_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Poll this to check on a pending VT sandbox submission for this conversation."""
    conversation = get_owned_conversation(db, conversation_id, current_user.id)
    session_id = conversation.id

    job = memory.get_pending_sandbox_job(session_id)
    if not job:
        raise HTTPException(status_code=404, detail="No pending sandbox job for this conversation.")

    status_result = await virustotal.get_analysis_status(job["analysis_id"])

    if status_result is None:
        memory.clear_pending_sandbox_job(session_id)
        raise HTTPException(status_code=502, detail="VirusTotal is not configured.")

    if "error" in status_result:
        memory.clear_pending_sandbox_job(session_id)
        raise HTTPException(
            status_code=502,
            detail=f"Failed to check sandbox status: {status_result['error']}",
        )

    status = status_result["status"]

    if status != "completed":
        return {
            "type": "sandbox_status",
            "status": status,
            "conversation_id": session_id,
        }

    # Analysis finished -- fetch the full report and build the same structured
    # card the rest of the app uses, now enriched with sandbox behavior data.
    memory.clear_pending_sandbox_job(session_id)

    try:
        result = await _build_analysis("hash", job["file_hash"], session_id=session_id)
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Sandbox finished but the follow-up lookup failed: {exc}",
        )

    if result is None:
        # Sandbox ran but produced no report data we could fetch (rare).
        content = (
            f"VirusTotal finished analyzing {job['filename']}, but no report data "
            "could be retrieved. It may still be processing on VirusTotal's side -- "
            "try checking again in a moment."
        )
        crud.append_message(db, conversation, role="assistant", content=content)
        return {
            "type": "text",
            "content": content,
            "found": False,
            "conversation_id": session_id,
        }

    analysis_row = save_analysis(db, result, session_id=session_id, user_id=current_user.id)
    crud.append_message(
        db, conversation, role="assistant",
        content=result["headline"], message_type="analysis",
        analysis_id=analysis_row.id,
    )
    return result
