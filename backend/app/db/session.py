import os
from pathlib import Path
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

load_dotenv()

# Real DB (e.g. Neon Postgres) via env var. Falls back to local SQLite
# only if DATABASE_URL isn't set, so local dev still works without Postgres.
DATABASE_URL = os.environ.get("DATABASE_URL")

if DATABASE_URL:
    # Postgres (Neon, etc.) doesn't need the SQLite-only connect_args.
    engine = create_engine(DATABASE_URL, pool_pre_ping=True)
else:
    DB_PATH = Path(__file__).resolve().parent.parent.parent / "sentrychat.db"
    DATABASE_URL = f"sqlite:///{DB_PATH}"
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
