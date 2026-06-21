import httpx

from app.config import settings

BASE = "https://threatfox-api.abuse.ch/api/v1/"


async def lookup_ioc(ioc: str):
    if not settings.ABUSECH_API_KEY:
        return None
    headers = {"Auth-Key": settings.ABUSECH_API_KEY}
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.post(
                BASE,
                json={"query": "search_ioc", "search_term": ioc},
                headers=headers,
            )
        if r.status_code == 200:
            try:
                return r.json()
            except ValueError:
                return {"error": "invalid_json_response"}
        return {"error": r.status_code}
    except httpx.RequestError as exc:
        return {"error": f"request_failed: {exc.__class__.__name__}"}
