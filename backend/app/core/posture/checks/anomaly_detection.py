"""Flags an unusual spike in remote-action activity for an integration.

Uses only data you already collect in RemoteAction (see
routers/remote_actions.py) -- no new external API calls, so this is
safe to build right after credential_age.py and still exercises a
"real" security use case: a compromised or misused credential often
shows up first as unusual volume/timing of actions, not as a single
obviously-bad request.

The baseline is deliberately simple (average actions/hour over the
trailing 7 days) rather than anything statistical -- easy to explain
and defend, and good enough to catch an obvious spike for a demo.
"""
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy.orm import Session

from app.core.posture.base import PostureCheck
from app.core.posture.registry import register
from app.db.models import RemoteAction


@register
class AnomalousActionVolumeCheck(PostureCheck):
    id = "unusual_remote_action_volume"
    category = "anomaly"
    severity = "medium"
    applies_to = "*"

    # Spike must clear both a relative threshold (vs. baseline) and an
    # absolute floor, so a quiet integration going from 0 to 1 action
    # doesn't get flagged as a 100x spike.
    SPIKE_MULTIPLIER = 5
    MIN_ABSOLUTE_COUNT = 5
    BASELINE_WINDOW_DAYS = 7

    async def run(self, integration, credential: Optional[str], db: Session) -> list[dict]:
        now = datetime.now(timezone.utc)

        last_hour_count = (
            db.query(RemoteAction)
            .filter(
                RemoteAction.integration_id == integration.id,
                RemoteAction.requested_at > now - timedelta(hours=1),
            )
            .count()
        )

        if last_hour_count < self.MIN_ABSOLUTE_COUNT:
            return []

        window_start = now - timedelta(days=self.BASELINE_WINDOW_DAYS)
        window_total = (
            db.query(RemoteAction)
            .filter(
                RemoteAction.integration_id == integration.id,
                RemoteAction.requested_at > window_start,
                RemoteAction.requested_at <= now - timedelta(hours=1),
            )
            .count()
        )
        window_hours = max(1, self.BASELINE_WINDOW_DAYS * 24 - 1)
        baseline_per_hour = window_total / window_hours

        # No real baseline yet (new/quiet integration) -- don't flag off
        # a comparison against ~0, that's just noisy false positives.
        if baseline_per_hour < 0.1:
            return []

        if last_hour_count >= baseline_per_hour * self.SPIKE_MULTIPLIER:
            return [
                self.finding(
                    title=(
                        f"{last_hour_count} remote actions in the last hour for "
                        f"'{integration.display_name}' (baseline ~{baseline_per_hour:.1f}/hr)"
                    ),
                    detail={
                        "last_hour_count": last_hour_count,
                        "baseline_per_hour": round(baseline_per_hour, 2),
                    },
                )
            ]

        return []
