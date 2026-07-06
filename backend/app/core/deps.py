from fastapi import Header, HTTPException, Depends
from sqlalchemy.orm import Session

from app.core.auth import verify_token
from app.db.session import get_db
from app.db.models import User


def auth_guard(authorization: str = Header(None)):
    """Legacy dependency - returns the raw token payload (dict), not a
    User row. Kept for call sites that only need `sub`/`username` and
    don't touch the database. Prefer get_current_user for anything that
    reads or writes account-owned data.
    """
    if not authorization:
        raise HTTPException(status_code=401, detail="No token")

    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid auth format")

    token = authorization.split(" ", 1)[1].strip()

    if not token:
        raise HTTPException(status_code=401, detail="Empty token")

    payload = verify_token(token)

    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    return payload


def get_current_user(
    payload: dict = Depends(auth_guard),
    db: Session = Depends(get_db),
) -> User:
    """The real dependency to use everywhere that touches account-owned
    data (integrations, analyses, watchlist, remote actions, etc). Loads
    the actual User row so callers get a stable id to filter/assign
    ownership with - not just whatever claims happen to be in the token.
    """
    user_id = payload.get("sub")

    user = db.query(User).filter(User.id == user_id).first() if user_id else None

    if user is None:
        raise HTTPException(status_code=401, detail="Account no longer exists.")

    return user
