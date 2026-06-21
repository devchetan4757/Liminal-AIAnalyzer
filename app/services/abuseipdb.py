import httpx

from app.config import settings

BASE = "https://api.abuseipdb.com/api/v2/check"


async def lookup_ip(ip: str):
    if not settings.ABUSEIPDB_API_KEY:
        return None
    headers = {"Key": settings.ABUSEIPDB_API_KEY, "Accept": "application/json"}
    params = {"ipAddress": ip, "maxAgeInDays": 90}
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(BASE, headers=headers, params=params)
        if r.status_code == 200:
            try:
                return r.json()
            except ValueError:
                return {"error": "invalid_json_response"}
        return {"error": r.status_code}
    except httpx.RequestError as exc:
        return {"error": f"request_failed: {exc.__class__.__name__}"}
