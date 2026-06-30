import base64

import httpx

from app.config import settings

BASE = "https://www.virustotal.com/api/v3"


def _headers():
    return {"x-apikey": settings.VT_API_KEY}


async def _safe_get(url, headers=None):
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(url, headers=headers)
        if r.status_code == 200:
            try:
                return r.json()
            except ValueError:
                return {"error": "invalid_json_response"}
        return {"error": r.status_code}
    except httpx.RequestError as exc:
        return {"error": f"request_failed: {exc.__class__.__name__}"}


async def lookup_hash(file_hash: str):
    if not settings.VT_API_KEY:
        return None
    return await _safe_get(f"{BASE}/files/{file_hash}", headers=_headers())


async def lookup_url(url: str):
    if not settings.VT_API_KEY:
        return None
    url_id = base64.urlsafe_b64encode(url.encode()).decode().strip("=")
    return await _safe_get(f"{BASE}/urls/{url_id}", headers=_headers())


async def lookup_ip(ip: str):
    if not settings.VT_API_KEY:
        return None
    return await _safe_get(f"{BASE}/ip_addresses/{ip}", headers=_headers())


async def lookup_domain(domain: str):
    if not settings.VT_API_KEY:
        return None
    return await _safe_get(f"{BASE}/domains/{domain}", headers=_headers())


async def submit_file(file_bytes: bytes, filename: str):
    """Upload a file for fresh scanning + sandbox detonation. Returns the
    analysis_id to poll, or an {"error": ...} dict on failure, or None if
    no VT key is configured."""
    if not settings.VT_API_KEY:
        return None
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            r = await client.post(
                f"{BASE}/files",
                headers=_headers(),
                files={"file": (filename, file_bytes)},
            )
        if r.status_code in (200, 201):
            try:
                data = r.json()
                return {"analysis_id": data["data"]["id"]}
            except (ValueError, KeyError):
                return {"error": "invalid_json_response"}
        return {"error": r.status_code}
    except httpx.RequestError as exc:
        return {"error": f"request_failed: {exc.__class__.__name__}"}


async def get_analysis_status(analysis_id: str):
    """Poll an in-progress analysis. Returns dict with 'status' field:
    'queued' | 'in progress' | 'completed', or {"error": ...}."""
    if not settings.VT_API_KEY:
        return None
    result = await _safe_get(f"{BASE}/analyses/{analysis_id}", headers=_headers())
    if isinstance(result, dict) and "error" not in result:
        try:
            status = result["data"]["attributes"]["status"]
            return {"status": status, "raw": result}
        except (KeyError, TypeError):
            return {"error": "unexpected_response_shape"}
    return result
