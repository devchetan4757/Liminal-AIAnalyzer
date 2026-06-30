from abc import ABC, abstractmethod
from typing import Optional


class BaseIntelSource(ABC):
    """One class per external threat-intel source.

    To add a new source later: subclass this, implement lookup(), register
    it in registry.py. Nothing in aggregator.py needs to change.
    """

    #: internal key -- used as the dict key in the raw results and must
    #: stay stable, since quick_score() and the frontend key off these names
    key: str = "unknown"

    #: human-readable name shown in the "Sources" list on the analysis card
    label: str = "Unknown"

    #: which indicator types this source can look up:
    #: any subset of {"hash", "url", "ip", "domain"}
    supported_types: set[str] = set()

    def supports(self, indicator_type: str) -> bool:
        return indicator_type in self.supported_types

    @abstractmethod
    async def lookup(self, indicator_type: str, indicator: str) -> Optional[dict]:
        """Return the raw API response dict, an {"error": ...} dict on failure,
        or None if this source isn't configured (e.g. missing API key) --
        None means "skip silently", matching the existing service behavior.
        """
        raise NotImplementedError
