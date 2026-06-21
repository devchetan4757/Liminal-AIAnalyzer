from fastapi import Header, HTTPException
from app.core.auth import verify_token


def auth_guard(authorization: str = Header(None)):
    if not authorization:
        raise HTTPException(status_code=401, detail="No token")

    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid auth format")

    token = authorization.split(" ", 1)[1].strip()

    if not token:
        raise HTTPException(status_code=401, detail="Empty token")

    user = verify_token(token)

    if not user:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    return user
