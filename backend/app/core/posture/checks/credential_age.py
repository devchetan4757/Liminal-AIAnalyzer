"""Flags integrations whose stored credential hasn't been rotated in a
while. No external API calls -- everything needed is already on the
Integration row -- so this is the fastest check to get the whole
finding -> score -> dashboard pipeline working end to end.

Requires: Integration.credentials_rotated_at (DateTime). If that column
doesn't exist yet on your model, this falls back to created_at so the
check still runs without crashing -- just note in your report that the
"real" rotation timestamp needs the migration described in the design
doc.
"""
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session

from app.core.posture.base import PostureCheck
from app.core.posture.registry import register


@register
class CredentialAgeCheck(PostureCheck):
    id = "credential_rotation_overdue"
    category = "credential_age"
    severity = "medium"
    applies_to = "*"  # runs for every provider, not just one

    MAX_AGE_DAYS = 90

    async def run(self, integration, credential: Optional[str], db: Session) -> list[dict]:
        rotated_at = getattr(integration, "credentials_rotated_at", None) or integration.created_at
        if rotated_at is None:
            return []

        if rotated_at.tzinfo is None:
            rotated_at = rotated_at.replace(tzinfo=timezone.utc)

        age_days = (datetime.now(timezone.utc) - rotated_at).days

        if age_days <= self.MAX_AGE_DAYS:
            return []

        severity = "high" if age_days > self.MAX_AGE_DAYS * 2 else "medium"

        return [
            self.finding(
                title=f"Credential for '{integration.display_name}' hasn't been rotated in {age_days} days",
                detail={"age_days": age_days, "max_age_days": self.MAX_AGE_DAYS},
                severity=severity,
            )
        ]
