"""The plugin registry. To add a new intel source:

1. Write a new class in builtin.py (or a new file) implementing BaseIntelSource.
2. Import it and add an instance to ALL_SOURCES below.

That's it -- aggregator.py loops over this list generically, no other
changes needed anywhere.
"""

from app.core.plugins.builtin import (
    VirusTotalSource,
    MalwareBazaarSource,
    ThreatFoxSource,
    OTXSource,
    URLhausSource,
    AbuseIPDBSource,
)

ALL_SOURCES = [
    VirusTotalSource(),
    MalwareBazaarSource(),
    ThreatFoxSource(),
    OTXSource(),
    URLhausSource(),
    AbuseIPDBSource(),
]


def sources_for(indicator_type: str):
    """All registered sources that support this indicator type."""
    return [s for s in ALL_SOURCES if s.supports(indicator_type)]
