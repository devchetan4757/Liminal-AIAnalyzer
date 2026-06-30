import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, String, Float, DateTime, JSON, Text, ForeignKey
from sqlalchemy.orm import relationship

from app.db.session import Base


def _uuid():
    return str(uuid.uuid4())


def _now():
    return datetime.now(timezone.utc)


class Analysis(Base):
    """One row per indicator lookup -- this is the history/audit trail.

    Written every time analyze.py or chat.py produces an "analysis" result.
    This table alone unlocks: a history view, the dashboard, and "have I
    seen this indicator before" checks -- before cases/watchlists exist.
    """
    __tablename__ = "analyses"

    id = Column(String, primary_key=True, default=_uuid)
    created_at = Column(DateTime, default=_now, index=True)

    indicator = Column(String, index=True, nullable=False)
    indicator_type = Column(String, index=True, nullable=False)  # hash / url / ip / domain
    verdict = Column(String, index=True, nullable=False)         # malicious / suspicious / clean / unknown
    score = Column(String, nullable=True)

    headline = Column(Text, nullable=True)
    recommendation = Column(Text, nullable=True)
    findings = Column(JSON, nullable=True)   # list[str]
    sources = Column(JSON, nullable=True)    # list[str]
    raw = Column(JSON, nullable=True)        # full raw payload from aggregator

    session_id = Column(String, index=True, nullable=True)

    # nullable for now -- wire to a real Case model in the next phase
    case_id = Column(String, ForeignKey("cases.id"), nullable=True)
    case = relationship("Case", back_populates="analyses")


class Case(Base):
    """Stub for the next phase (case management). Created now so Analysis
    can reference it without a schema migration later.
    """
    __tablename__ = "cases"

    id = Column(String, primary_key=True, default=_uuid)
    created_at = Column(DateTime, default=_now)
    title = Column(String, nullable=False)
    status = Column(String, default="open")  # open / investigating / contained / closed
    severity = Column(String, default="unknown")
    notes = Column(Text, nullable=True)

    analyses = relationship("Analysis", back_populates="case")
