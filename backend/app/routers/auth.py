from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.auth import create_token
from app.core.security import hash_password, verify_password
from app.core.deps import get_current_user
from app.core.rate_limit import (
    client_ip,
    login_limiter,
    login_ip_limiter,
    register_ip_limiter,
)
from app.db.session import get_db
from app.db.models import User

router = APIRouter()

# Full account-based auth: every user registers their own username +
# password and only ever sees their own data (integrations, watchlist,
# history, etc - enforced in each of those routers via get_current_user).
# There is no shared APP_PASSWORD anymore.


class RegisterRequest(BaseModel):
    username: str = Field(min_length=3, max_length=64)
    password: str = Field(min_length=8, max_length=256)


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=256)


def _normalize_username(username: str) -> str:
    return username.strip().lower()


@router.post("/register")
def register(req: RegisterRequest, request: Request, db: Session = Depends(get_db)):
    register_ip_limiter.check(client_ip(request))

    username = _normalize_username(req.username)

    if not username:
        raise HTTPException(status_code=400, detail="Username is required.")

    existing = db.query(User).filter(User.username == username).first()
    if existing:
        raise HTTPException(status_code=409, detail="That username is already taken.")

    user = User(
        username=username,
        hashed_password=hash_password(req.password),
    )
    db.add(user)

    try:
        db.commit()
    except IntegrityError:
        # Two requests for the same username can both pass the check
        # above and race to commit - the DB's unique constraint on
        # `username` is the real guard, this just turns the resulting
        # crash into the same 409 a normal duplicate gets.
        db.rollback()
        raise HTTPException(status_code=409, detail="That username is already taken.")

    db.refresh(user)

    token = create_token(user_id=user.id, username=user.username)
    return {"token": token, "username": user.username}


@router.post("/login")
def login(req: LoginRequest, request: Request, db: Session = Depends(get_db)):
    ip = client_ip(request)
    username = _normalize_username(req.username)

    # Per-IP guard first (catches hammering regardless of username),
    # then per-account guard (catches targeted password guessing).
    login_ip_limiter.check(ip)
    login_limiter.check(f"{ip}:{username}")

    user = db.query(User).filter(User.username == username).first()

    # Same error for "no such user" and "wrong password" - don't leak
    # which one it was.
    if user is None or not verify_password(req.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid username or password")

    # Successful login clears this account's failed-attempt count so a
    # legitimate user who mistyped a few times isn't stuck waiting out
    # the window after they get it right.
    login_limiter.reset(f"{ip}:{username}")

    token = create_token(user_id=user.id, username=user.username)
    return {"token": token, "username": user.username}


@router.get("/me")
def me(current_user: User = Depends(get_current_user)):
    return {"id": current_user.id, "username": current_user.username}
