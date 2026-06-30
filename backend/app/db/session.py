from pathlib import Path
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

# SQLite file lives next to the backend app, not tied to cwd at runtime.
DB_PATH = Path(__file__).resolve().parent.parent.parent / "sentrychat.db"
DATABASE_URL = f"sqlite:///{DB_PATH}"

# check_same_thread=False is required for SQLite + FastAPI's threaded request
# handling. Safe here because each request gets its own session (see get_db below).
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    """FastAPI dependency -- yields a session, always closes it after the request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Call once at app startup. Creates tables if they don't exist yet.

    Note: this is fine for now (single SQLite file, early stage). Once the
    schema starts changing often, switch to Alembic migrations instead of
    relying on create_all, since create_all never alters existing tables.
    """
    from app.db import models  # noqa: F401 -- ensures models are registered
    Base.metadata.create_all(bind=engine)
