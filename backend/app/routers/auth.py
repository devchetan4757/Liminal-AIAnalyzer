from fastapi import APIRouter, HTTPException
import os
import datetime
from jose import jwt, JWTError

router = APIRouter()

SECRET = os.getenv("JWT_SECRET", "dev-secret")

@router.post("/login")
def login(data: dict):
    password = data.get("password")

    if password != os.getenv("APP_PASSWORD"):
        raise HTTPException(status_code=401, detail="Invalid password")

    payload = {
        "user": "admin",
        "exp": datetime.datetime.utcnow() + datetime.timedelta(days=1)
    }

    token = jwt.encode(payload, SECRET, algorithm="HS256")

    return {"token": token}
