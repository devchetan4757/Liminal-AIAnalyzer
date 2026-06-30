"""
Server-side conversation memory.

Keeps the last N turns + the last analysis result per session_id so the LLM
can actually use prior context on follow-up questions. This is in-process
and resets on restart -- fine for a single-instance deployment. If you scale
to multiple backend workers/instances, swap _store for Redis (the interface
below is intentionally tiny so that's a drop-in change).
"""

import time
from collections import OrderedDict
from threading import Lock

MAX_TURNS = 12          # how many past user/assistant turns we keep per session
SESSION_TTL_SECONDS = 60 * 60 * 2   # 2 hours of inactivity -> session is dropped
MAX_SESSIONS = 500       # simple cap so memory can't grow unbounded

_store: "OrderedDict[str, dict]" = OrderedDict()
_lock = Lock()


def _purge_expired():
    now = time.time()
    expired = [sid for sid, s in _store.items() if now - s["last_seen"] > SESSION_TTL_SECONDS]
    for sid in expired:
        _store.pop(sid, None)
    # Hard cap: drop oldest sessions if we exceed MAX_SESSIONS
    while len(_store) > MAX_SESSIONS:
        _store.popitem(last=False)


def get_session(session_id: str) -> dict:
    with _lock:
        _purge_expired()
        session = _store.get(session_id)
        if session is None:
            session = {"turns": [], "last_analysis": None, "pending_sandbox_job": None, "last_seen": time.time()}
            _store[session_id] = session
        else:
            session["last_seen"] = time.time()
            _store.move_to_end(session_id)
        return session


def add_turn(session_id: str, role: str, content: str):
    session = get_session(session_id)
    session["turns"].append({"role": role, "content": content})
    # Keep only the most recent MAX_TURNS*2 messages (user+assistant pairs)
    if len(session["turns"]) > MAX_TURNS * 2:
        session["turns"] = session["turns"][-MAX_TURNS * 2:]


def get_history(session_id: str) -> list:
    return list(get_session(session_id)["turns"])


def set_last_analysis(session_id: str, indicator_type: str, indicator: str, raw: dict, summary: str):
    session = get_session(session_id)
    session["last_analysis"] = {
        "indicator_type": indicator_type,
        "indicator": indicator,
        "raw": raw,
        "summary": summary,
    }


def get_last_analysis(session_id: str):
    return get_session(session_id).get("last_analysis")


def set_pending_sandbox_job(session_id: str, analysis_id: str, file_hash: str, filename: str):
    session = get_session(session_id)
    session["pending_sandbox_job"] = {
        "analysis_id": analysis_id,
        "file_hash": file_hash,
        "filename": filename,
        "started_at": time.time(),
    }


def get_pending_sandbox_job(session_id: str):
    return get_session(session_id).get("pending_sandbox_job")


def clear_pending_sandbox_job(session_id: str):
    session = get_session(session_id)
    session["pending_sandbox_job"] = None


def clear_session(session_id: str):
    with _lock:
        _store.pop(session_id, None)
