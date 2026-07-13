"""Base class every security posture check implements.

Mirrors the shape of app.core.plugins.base -- each check is a small,
self-contained unit that inspects one thing about one (or every)
provider and returns a list of findings. The registry (registry.py)
is what maps a provider to the list of checks that apply to it, and
scoring.py turns the accumulated findings into a single 0-100 score.

A check never writes to the DB itself -- it just returns finding
dicts. The caller (posture scan runner) is responsible for diffing
those against existing open SecurityFinding rows and persisting them.
This keeps checks easy to unit test in isolation (no DB needed).
"""
from abc import ABC, abstractmethod
from typing import Optional

from sqlalchemy.orm import Session


class PostureCheck(ABC):
    # Unique, stable id -- stored on findings so re-runs can be matched
    # against previously-seen ones instead of creating duplicates.
    id: str

    # One of: "misconfig" | "secret_leak" | "vuln_dependency" | "anomaly" | "credential_age"
    category: str

    # Default severity if the check doesn't override it per-finding:
    # "low" | "medium" | "high" | "critical"
    severity: str

    # Provider name this check runs for (e.g. "supabase"), or "*" to run
    # for every provider regardless of type.
    applies_to: str

    @abstractmethod
    async def run(self, integration, credential: Optional[str], db: Session) -> list[dict]:
        """Run the check against one integration.

        Returns a list of finding dicts, or [] if nothing was found.
        Each dict should at minimum have "title" and may include
        "detail" (raw evidence, JSON-serializable) and "severity"
        (overriding the class default for that specific finding).

        `credential` is the already-decrypted credential for this
        integration (see routers/posture.py) -- never log or persist
        it directly from inside a check.
        """
        raise NotImplementedError

    def finding(self, title: str, detail: dict | None = None, severity: str | None = None) -> dict:
        """Helper so check implementations don't repeat this boilerplate."""
        return {
            "check_id": self.id,
            "category": self.category,
            "severity": severity or self.severity,
            "title": title,
            "detail": detail or {},
        }
