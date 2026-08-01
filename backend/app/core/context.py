"""Builds a compact summary of a user's connected integrations, current
security posture, and live service data, to be passed to the LLM as an
extra system message (see core/llm.py's `extra_system` param). Design
doc: docs/ai-context-and-conversations.md

Two layers per integration:
  1. Posture score + open findings (from our own DB - unchanged).
  2. A compact digest of integration.cached_scan - the same "stats +
     buckets" JSON every provider's dashboard already renders from (see
     e.g. NetlifySyncService.logs(), RenderSyncService.logs()). This is
     where real site/project/service/monitor *names*, deploy/build
     *states*, and error messages live, so the LLM can answer things
     like "which of my Render services failed to deploy" using real
     names instead of only aggregate scores.

Still deliberately summarized, not a raw dump: each list is capped at
MAX_ITEMS_PER_LIST, and only a handful of identifying fields are pulled
per item. Every provider's sync layer already refuses to fetch env vars
or secret values in the first place (see the NOTE at the top of each
services/integrations/<provider>/sync.py) - cached_scan simply never
contains them, so nothing here can leak one into the prompt either.
"""
from sqlalchemy.orm import Session

from app.db.models import Integration, PostureScore, SecurityFinding

MAX_FINDINGS_PER_INTEGRATION = 5
MAX_ITEMS_PER_LIST = 6

# Fields checked, in order, to find something human-identifying for a
# cached_scan list item - different providers name this differently
# (Netlify site "name", GitHub "full_name", UptimeRobot "monitor_name"...).
_NAME_KEYS = (
    "name", "full_name", "site_name", "project_name", "monitor_name",
    "service_name", "title", "login", "key", "type",
)
# Same idea for a status-ish field to show alongside the name.
_STATE_KEYS = (
    "state", "status", "published_deploy_state", "readyState", "severity",
)
# Same idea for a short error/detail string worth surfacing.
_DETAIL_KEYS = ("error_message", "error", "commit_message", "category")


def _item_label(item) -> str:
    if not isinstance(item, dict):
        return str(item)

    name = next((item[k] for k in _NAME_KEYS if item.get(k)), None) or item.get("id") or "?"
    label = str(name)

    state = next((item[k] for k in _STATE_KEYS if item.get(k)), None)
    if state:
        label += f" ({state})"

    detail = next((item[k] for k in _DETAIL_KEYS if item.get(k)), None)
    if detail:
        label += f" — {str(detail)[:80]}"

    return label


def _summarize_cached_scan(cached_scan, prefix: str = "") -> list[str]:
    """Turns a provider's cached_scan dict into a few compact lines:
    one for `stats`, then one per bucket listing up to MAX_ITEMS_PER_LIST
    item labels (name/state/detail).

    Most providers put stats/buckets at the top level (Netlify, Render,
    Vercel, ...). A few nest their own "stats + buckets" shape one level
    down under a single key (MongoDB's cached_scan is `{"logs": {...}}`).
    We recurse into a nested dict only when it looks like another such
    container - i.e. it has its own "stats" key or any list-valued key -
    so it still gets broken out bucket-by-bucket instead of being
    mislabeled as one unnamed item. A nested dict that's just a single
    entity (e.g. GitHub's "account") has neither, so it still gets one
    readable label via _item_label.
    """
    lines: list[str] = []

    if not isinstance(cached_scan, dict):
        return lines

    stats = cached_scan.get("stats")
    if isinstance(stats, dict) and stats:
        label = f"{prefix}stats" if prefix else "stats"
        lines.append(f"    {label}: " + ", ".join(f"{k}={v}" for k, v in stats.items()))

    for key, value in cached_scan.items():
        if key == "stats":
            continue
        full_key = f"{prefix}{key}"

        if isinstance(value, list) and value:
            labels = [_item_label(v) for v in value[:MAX_ITEMS_PER_LIST]]
            lines.append(f"    {full_key}: " + "; ".join(labels))
            remainder = len(value) - MAX_ITEMS_PER_LIST
            if remainder > 0:
                lines.append(f"      …and {remainder} more not shown")

        elif isinstance(value, dict) and value:
            looks_like_container = "stats" in value or any(
                isinstance(v, list) for v in value.values()
            )
            if looks_like_container:
                lines.extend(_summarize_cached_scan(value, prefix=f"{full_key}."))
            else:
                lines.append(f"    {full_key}: {_item_label(value)}")

    return lines


def build_integration_context(user_id: str, db: Session) -> str | None:
    """Returns a system-message string, or None if the user has nothing
    connected yet (in which case chat.py skips adding an extra_system at
    all, rather than passing a pointless "no integrations" sentence on
    every single message)."""
    integrations = (
        db.query(Integration).filter(Integration.user_id == user_id).all()
    )

    if not integrations:
        return None

    lines = [
        "The user has the following connected integrations, security "
        "posture, and live service data pulled directly from each "
        "provider (site/project/service/monitor names, deploy or build "
        "states, recent errors, and similar details). Use this to "
        "answer questions about their environment (e.g. \"what's my "
        "GitHub posture score\", \"do I have any critical findings\", "
        "\"which of my Netlify sites failed to deploy\", \"what's the "
        "status of my UptimeRobot monitors\") - always refer to the "
        "exact names shown here. Never invent integrations, scores, "
        "findings, service names, or states that aren't listed here."
    ]

    for integ in integrations:
        latest_score = (
            db.query(PostureScore)
            .filter(PostureScore.integration_id == integ.id)
            .order_by(PostureScore.computed_at.desc())
            .first()
        )
        open_findings = (
            db.query(SecurityFinding)
            .filter(
                SecurityFinding.integration_id == integ.id,
                SecurityFinding.status == "open",
            )
            .order_by(SecurityFinding.severity.desc())
            .all()
        )

        score_text = f"{latest_score.score}/100" if latest_score else "not scanned yet"
        lines.append(
            f"- {integ.provider} ('{integ.display_name}'): posture score "
            f"{score_text}, {len(open_findings)} open finding(s), status={integ.status}"
        )

        for finding in open_findings[:MAX_FINDINGS_PER_INTEGRATION]:
            lines.append(f"    · [{finding.severity}/{finding.category}] {finding.title}")

        remainder = len(open_findings) - MAX_FINDINGS_PER_INTEGRATION
        if remainder > 0:
            lines.append(f"    · …and {remainder} more open finding(s) not shown here")

        lines.extend(_summarize_cached_scan(integ.cached_scan))

    return "\n".join(lines)
