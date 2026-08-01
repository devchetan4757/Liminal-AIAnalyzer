"""On-demand fetch of raw, line-level log entries for a specific named
service, triggered when the user's chat message looks like it's asking
for logs (e.g. "latest 4 logs from my-service").

Render is currently the only connected provider whose API exposes real
line-level application logs (RenderSyncService.service_logs). Every
other provider's "logs" are deploy/build/event *history* (site deploys,
project operations, monitor incidents, Atlas events) - which
core/context.py already summarizes from cached_scan - not individual
log lines. So this only ever needs to reach for Render, and only when a
Render service's name is actually mentioned (or was recently discussed
in this session) in the message; it never fetches logs speculatively on
every turn.
"""
import difflib
import re

from sqlalchemy.orm import Session

from app.core import memory
from app.core.encryption import decrypt
from app.db.models import Integration
from app.services.integrations.render.sync import RenderSyncService

_COUNT_RE = re.compile(r"\b(\d{1,3})\b")
DEFAULT_LOG_COUNT = 20
MAX_LOG_COUNT = 100
LOG_KEYWORDS = ("log", "logs")

# Minimum word length to try fuzzy-matching against a service name (short
# words like "my", "the", "app" are too noisy/likely to false-positive).
_MIN_FUZZY_WORD_LEN = 4
# SequenceMatcher ratio a word needs to hit against a service name to count
# as a typo/truncation match, e.g. "santrewalif" -> "santrewalitoffee".
_FUZZY_RATIO_THRESHOLD = 0.72


def _requested_count(text: str) -> int:
    """Picks up a number the user mentioned (e.g. "latest 4 logs" -> 4),
    defaulting to DEFAULT_LOG_COUNT if none is found."""
    match = _COUNT_RE.search(text)
    if match:
        return max(1, min(MAX_LOG_COUNT, int(match.group(1))))
    return DEFAULT_LOG_COUNT


def _find_render_service(text: str, integrations: list[Integration]):
    """Looks for a Render service whose name is mentioned in the message,
    using each Render integration's cached_scan - which
    live_sync.refresh_stale_integrations has already brought up to date
    for this turn before chat.py calls here. Returns (integration,
    service_dict) or (None, None) if no known service name appears in
    the text.

    Matching is deliberately forgiving, since users type service names
    from memory:
      1. Substring match in either direction (handles a name embedded in
         a longer/misspelled word, e.g. "santrewalitoffeeee" containing
         the real name "santrewalitoffee").
      2. Fuzzy ratio match against individual words in the message
         (handles typos/truncations, e.g. "santrewalif" for
         "santrewalitoffee").
    """
    words = [w for w in re.findall(r"[a-zA-Z0-9]+", text.lower()) if len(w) >= _MIN_FUZZY_WORD_LEN]
    if not words:
        return None, None

    best_match = None  # (ratio, integration, service)

    for integ in integrations:
        if integ.provider != "render":
            continue
        for svc in (integ.cached_scan or {}).get("services") or []:
            name = (svc.get("name") or "")
            if not name:
                continue
            name_lower = name.lower()

            for word in words:
                if word in name_lower or name_lower in word:
                    return integ, svc  # confident match, stop immediately

                ratio = difflib.SequenceMatcher(None, word, name_lower).ratio()
                if ratio >= _FUZZY_RATIO_THRESHOLD and (best_match is None or ratio > best_match[0]):
                    best_match = (ratio, integ, svc)

    if best_match:
        return best_match[1], best_match[2]

    return None, None


def _find_by_id(integrations: list[Integration], integration_id: str, service_id: str):
    """Looks up a specific (integration, service) pair by id - used to
    resume the last Render service discussed in this session when a
    follow-up message ("now show me the actual backend logs") doesn't
    repeat the service name."""
    for integ in integrations:
        if str(integ.id) != str(integration_id) or integ.provider != "render":
            continue
        for svc in (integ.cached_scan or {}).get("services") or []:
            if svc.get("id") == service_id:
                return integ, svc
    return None, None


def maybe_fetch_service_logs(text: str, user_id: str, db: Session, session_id: str = None) -> str | None:
    """Returns a system-message string with recent raw log lines for a
    named Render service mentioned in `text`, or None if the message
    doesn't mention logs, no matching service is found, or the live
    fetch fails - in which case chat.py proceeds without this extra
    context, same as before this existed.

    If the current message doesn't name a service (e.g. a follow-up
    like "now show me the actual backend logs" after already naming one
    this session), falls back to the last Render service discussed in
    this session."""
    text_lower = text.lower()
    if not any(kw in text_lower for kw in LOG_KEYWORDS):
        return None

    integrations = (
        db.query(Integration).filter(Integration.user_id == user_id).all()
    )

    integ, svc = _find_render_service(text, integrations)

    if (not integ or not svc) and session_id:
        last = memory.get_last_render_service(session_id)
        if last:
            integ, svc = _find_by_id(integrations, last["integration_id"], last["service_id"])

    if not integ or not svc:
        return None

    if session_id:
        memory.set_last_render_service(session_id, str(integ.id), svc.get("id"), svc.get("name"))

    try:
        api_key = decrypt(integ.encrypted_credentials["api_key"])
        service = RenderSyncService(api_key)
        data = service.service_logs(svc["id"], limit=_requested_count(text))
    except Exception:
        # A failed live fetch shouldn't break the chat reply - the model
        # just answers without line-level logs for this turn, same as
        # if the service name hadn't matched at all.
        return None

    entries = data.get("logs") or []
    service_name = svc.get("name")

    if not entries:
        return (
            f"The user asked about logs for the Render service "
            f"'{service_name}'. A live fetch just now returned no log "
            "entries. Tell them there are no recent log lines for it "
            "right now, rather than inventing any."
        )

    lines = [
        f"The user asked about logs for the Render service "
        f"'{service_name}'. Below are the {len(entries)} most recent raw "
        "log line(s), fetched live just now. Use only these lines - "
        "never invent log content, timestamps, or levels not shown here."
    ]
    for entry in entries:
        ts = entry.get("timestamp") or "?"
        level = f" {entry['level']}" if entry.get("level") else ""
        message = (entry.get("message") or "").strip()
        lines.append(f"[{ts}]{level} {message}")

    return "\n".join(lines)
