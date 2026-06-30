import asyncio

from app.services import abuseipdb, malwarebazaar, otx, threatfox, urlhaus, virustotal


async def aggregate(indicator_type: str, indicator: str):
    raw, sources = {}, []

    if indicator_type == "hash":
        vt, mb, tf, otx_r = await asyncio.gather(
            virustotal.lookup_hash(indicator),
            malwarebazaar.lookup_hash(indicator),
            threatfox.lookup_ioc(indicator),
            otx.lookup("hash", indicator),
        )
        results = {"virustotal": vt, "malwarebazaar": mb, "threatfox": tf, "otx": otx_r}

    elif indicator_type == "url":
        vt, uh, otx_r = await asyncio.gather(
            virustotal.lookup_url(indicator),
            urlhaus.lookup_url(indicator),
            otx.lookup("url", indicator),
        )
        results = {"virustotal": vt, "urlhaus": uh, "otx": otx_r}

    elif indicator_type == "ip":
        vt, ab, otx_r = await asyncio.gather(
            virustotal.lookup_ip(indicator),
            abuseipdb.lookup_ip(indicator),
            otx.lookup("ip", indicator),
        )
        results = {"virustotal": vt, "abuseipdb": ab, "otx": otx_r}

    elif indicator_type == "domain":
        vt, uh, otx_r = await asyncio.gather(
            virustotal.lookup_domain(indicator),
            urlhaus.lookup_host(indicator),
            otx.lookup("domain", indicator),
        )
        results = {"virustotal": vt, "urlhaus": uh, "otx": otx_r}

    else:
        return {}, [], False

    label_map = {
        "virustotal": "VirusTotal",
        "malwarebazaar": "MalwareBazaar",
        "threatfox": "ThreatFox",
        "otx": "AlienVault OTX",
        "urlhaus": "URLhaus",
        "abuseipdb": "AbuseIPDB",
    }

    for key, value in results.items():
        if value is None:
            continue  # not configured (missing API key), skip silently
        raw[key] = value
        if not (isinstance(value, dict) and value.get("error")):
            sources.append(label_map[key])

    found = any(
        v and not (isinstance(v, dict) and v.get("error")) for v in raw.values()
    )
    return raw, sources, found


def quick_score(raw: dict) -> str:
    """Best-effort human-friendly confidence score, trying multiple sources
    in order since not every source will have data for every indicator."""

    # 1. VirusTotal detection ratio (most informative when available)
    vt = raw.get("virustotal") or {}
    try:
        stats = vt["data"]["attributes"]["last_analysis_stats"]
        malicious = stats.get("malicious", 0)
        total = sum(stats.values())
        if total > 0:
            return f"{malicious}/{total} engines"
    except Exception:
        pass

    # 2. AbuseIPDB confidence score (IPs)
    ab = raw.get("abuseipdb") or {}
    try:
        score = ab["data"]["abuseConfidenceScore"]
        return f"{score}% abuse score"
    except Exception:
        pass

    # 3. ThreatFox confidence level (any IOC type)
    tf = raw.get("threatfox")
    try:
        if isinstance(tf, dict) and tf.get("query_status") == "ok" and tf.get("data"):
            levels = [item.get("confidence_level") for item in tf["data"] if item.get("confidence_level") is not None]
            if levels:
                return f"{max(levels)}% confidence (ThreatFox)"
    except Exception:
        pass

    # 4. MalwareBazaar — presence alone means it's a confirmed malware sample
    mb = raw.get("malwarebazaar")
    try:
        if isinstance(mb, dict) and mb.get("query_status") == "ok" and mb.get("data"):
            return "confirmed malware (MalwareBazaar)"
    except Exception:
        pass

    # 5. URLhaus — presence means it's a known malicious URL/host
    uh = raw.get("urlhaus")
    try:
        if isinstance(uh, dict) and uh.get("query_status") == "ok":
            return "listed (URLhaus)"
    except Exception:
        pass

    # 6. OTX pulse count as a rough signal
    otx = raw.get("otx") or {}
    try:
        pulse_count = otx["pulse_info"]["count"]
        if pulse_count > 0:
            return f"{pulse_count} OTX pulses"
    except Exception:
        pass

    return "n/a"
