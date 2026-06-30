"""Adapters for the 6 existing service modules. These wrap the functions
that already exist in app/services/*.py -- no changes to that logic, just
giving each one a consistent lookup(indicator_type, indicator) interface
so the aggregator can call any of them the same way.
"""

from app.core.plugins.base import BaseIntelSource
from app.services import virustotal, malwarebazaar, urlhaus, threatfox, abuseipdb, otx


class VirusTotalSource(BaseIntelSource):
    key = "virustotal"
    label = "VirusTotal"
    supported_types = {"hash", "url", "ip", "domain"}

    async def lookup(self, indicator_type, indicator):
        if indicator_type == "hash":
            return await virustotal.lookup_hash(indicator)
        if indicator_type == "url":
            return await virustotal.lookup_url(indicator)
        if indicator_type == "ip":
            return await virustotal.lookup_ip(indicator)
        if indicator_type == "domain":
            return await virustotal.lookup_domain(indicator)
        return None


class MalwareBazaarSource(BaseIntelSource):
    key = "malwarebazaar"
    label = "MalwareBazaar"
    supported_types = {"hash"}

    async def lookup(self, indicator_type, indicator):
        return await malwarebazaar.lookup_hash(indicator)


class ThreatFoxSource(BaseIntelSource):
    key = "threatfox"
    label = "ThreatFox"
    # Original aggregator only called this for hashes -- preserved as-is.
    supported_types = {"hash"}

    async def lookup(self, indicator_type, indicator):
        return await threatfox.lookup_ioc(indicator)


class OTXSource(BaseIntelSource):
    key = "otx"
    label = "AlienVault OTX"
    supported_types = {"hash", "url", "ip", "domain"}

    async def lookup(self, indicator_type, indicator):
        return await otx.lookup(indicator_type, indicator)


class URLhausSource(BaseIntelSource):
    key = "urlhaus"
    label = "URLhaus"
    supported_types = {"url", "domain"}

    async def lookup(self, indicator_type, indicator):
        if indicator_type == "url":
            return await urlhaus.lookup_url(indicator)
        if indicator_type == "domain":
            return await urlhaus.lookup_host(indicator)
        return None


class AbuseIPDBSource(BaseIntelSource):
    key = "abuseipdb"
    label = "AbuseIPDB"
    supported_types = {"ip"}

    async def lookup(self, indicator_type, indicator):
        return await abuseipdb.lookup_ip(indicator)
