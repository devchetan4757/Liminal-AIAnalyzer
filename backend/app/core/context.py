"""Builds a compact summary of a user's connected integrations and current
security posture, to be passed to the LLM as an extra system message (see
core/llm.py's `extra_system` param). Design doc: docs/ai-context-and-conversations.md

Deliberately summarized, not a raw dump -- only what a question like
"what's risky right now" needs (provider, posture score, open findings).
Full `detail`/`raw` JSON blobs never go into the prompt; if the user asks
about one specific finding in depth, that's a follow-up we can add later
rather than front-loading everything on every message.
"""
from sqlalchemy.orm import Session

from app.db.models import Integration, PostureScore, SecurityFinding

MAX_FINDINGS_PER_INTEGRATION = 5


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
        "The user has the following connected integrations and security "
        "posture. Use this to answer questions about their environment "
        "(e.g. \"what's my GitHub posture score\", \"do I have any "
        "critical findings\"). Never invent integrations, scores, or "
        "findings that aren't listed here."
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

    return "\n".join(lines)
