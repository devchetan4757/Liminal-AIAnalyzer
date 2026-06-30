from jose import jwt, JWTError
from datetime import datetime, timedelta, timezone
import os
from dotenv import load_dotenv

load_dotenv()

JWT_SECRET = os.getenv("JWT_SECRET")
ALGO = "HS256"


if not JWT_SECRET:
    raise RuntimeError("JWT_SECRET is not set in environment variables")


def create_token():
    payload = {
        "sub": "admin",
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + timedelta(days=1)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=ALGO)


def verify_token(token: str):
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[ALGO])
        return payload
    except JWTError:
        return None
