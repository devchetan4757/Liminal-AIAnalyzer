import httpx

from app.config import settings

BASE = "https://otx.alienvault.com/api/v1/indicators"

TYPE_MAP = {"hash": "file", "url": "url", "ip": "IPv4", "domain": "domain"}


async def lookup(indicator_type: str, indicator: str):
    otx_type = TYPE_MAP.get(indicator_type)
    if not otx_type:
        return None
    headers = {"X-OTX-API-KEY": settings.OTX_API_KEY} if settings.OTX_API_KEY else {}
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(f"{BASE}/{otx_type}/{indicator}/general", headers=headers)
        if r.status_code == 200:
            try:
                return r.json()
            except ValueError:
                return {"error": "invalid_json_response"}
        return {"error": r.status_code}
    except httpx.RequestError as exc:
        return {"error": f"request_failed: {exc.__class__.__name__}"}
