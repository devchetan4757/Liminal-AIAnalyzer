import httpx

from app.config import settings

BASE = "https://urlhaus-api.abuse.ch/v1"


async def _safe_post(url, data):
    if not settings.ABUSECH_API_KEY:
        return None
    headers = {"Auth-Key": settings.ABUSECH_API_KEY}
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.post(url, data=data, headers=headers)
        if r.status_code == 200:
            try:
                return r.json()
            except ValueError:
                return {"error": "invalid_json_response"}
        return {"error": r.status_code}
    except httpx.RequestError as exc:
        return {"error": f"request_failed: {exc.__class__.__name__}"}


async def lookup_url(url: str):
    return await _safe_post(f"{BASE}/url/", {"url": url})


async def lookup_host(host: str):
    return await _safe_post(f"{BASE}/host/", {"host": host})
