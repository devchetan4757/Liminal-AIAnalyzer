import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Column,
    String,
    Boolean,
    DateTime,
    JSON,
    Text,
    ForeignKey,
)
from sqlalchemy.orm import relationship

from app.db.session import Base


def _uuid():
    return str(uuid.uuid4())


def _now():
    return datetime.now(timezone.utc)


# ==========================================================
# Existing Models
# ==========================================================

class Analysis(Base):
    __tablename__ = "analyses"

    id = Column(String, primary_key=True, default=_uuid)
    created_at = Column(DateTime, default=_now, index=True)

    indicator = Column(String, index=True, nullable=False)
    indicator_type = Column(String, index=True, nullable=False)
    verdict = Column(String, index=True, nullable=False)
    score = Column(String, nullable=True)

    headline = Column(Text, nullable=True)
    recommendation = Column(Text, nullable=True)
    findings = Column(JSON, nullable=True)
    sources = Column(JSON, nullable=True)
    raw = Column(JSON, nullable=True)

    session_id = Column(String, index=True, nullable=True)

    case_id = Column(String, ForeignKey("cases.id"), nullable=True)
    case = relationship("Case", back_populates="analyses")


class Case(Base):
    __tablename__ = "cases"

    id = Column(String, primary_key=True, default=_uuid)
    created_at = Column(DateTime, default=_now)

    title = Column(String, nullable=False)
    status = Column(String, default="open")
    severity = Column(String, default="unknown")
    notes = Column(Text, nullable=True)

    analyses = relationship("Analysis", back_populates="case")


# ==========================================================
# Integrations
# ==========================================================

class Integration(Base):
    __tablename__ = "integrations"

    id = Column(String, primary_key=True, default=_uuid)

    provider = Column(String, nullable=False, index=True)

    display_name = Column(String, nullable=False)

    account_identifier = Column(String)

    authentication_type = Column(String, nullable=False)

    encrypted_credentials = Column(JSON, nullable=False)

    status = Column(String, default="connected")

    auto_sync = Column(Boolean, default=True)

    last_sync = Column(DateTime)
    cached_scan = Column(JSON)

    cached_scan_at = Column(DateTime)

    created_at = Column(DateTime, default=_now)

    updated_at = Column(DateTime, default=_now)

    events = relationship(
        "Event",
        back_populates="integration",
        cascade="all, delete",
    )
    resources = relationship(
    "Resource",
    backref="integration",
    cascade="all, delete",
    )


# ==========================================================
# Events
# ==========================================================

class Event(Base):
    __tablename__ = "events"

    id = Column(String, primary_key=True, default=_uuid)

    integration_id = Column(
        String,
        ForeignKey("integrations.id"),
        nullable=False,
    )

    resource_type = Column(String, nullable=False)

    resource_id = Column(String, nullable=False)

    event_type = Column(String, nullable=False)

    severity = Column(String, default="info")

    title = Column(String, nullable=False)

    description = Column(Text)

    event_metadata = Column(JSON)

    provider_timestamp = Column(DateTime)

    created_at = Column(DateTime, default=_now)

    integration = relationship(
        "Integration",
        back_populates="events",
    )


# ==========================================================
# Incidents
# ==========================================================

class Incident(Base):
    __tablename__ = "incidents"

    id = Column(String, primary_key=True, default=_uuid)

    title = Column(String, nullable=False)

    severity = Column(String, default="medium")

    status = Column(String, default="open")

    summary = Column(Text)

    root_cause = Column(Text)

    recommendations = Column(JSON)

    incident_metadata = Column(JSON)

    created_at = Column(DateTime, default=_now)

    updated_at = Column(DateTime, default=_now)

    # --- Watchlist fields -------------------------------------------------
    # Link back to the Connected App resource this incident was raised
    # from. All nullable so pre-existing rows (there shouldn't be any --
    # this table was unused -- and any manually-created incidents) stay
    # valid.
    integration_id = Column(String, ForeignKey("integrations.id"), nullable=True)

    provider = Column(String, nullable=True)  # render / neon / uptimerobot / github / mongodb

    resource_type = Column(String, nullable=True)  # deploy / operation / monitor / ...

    external_id = Column(String, nullable=True)  # provider's own ID, used for dedupe

    resource_name = Column(String, nullable=True)  # human-readable name for the list UI

    has_playbook = Column(Boolean, nullable=True)  # True = verified steps, False = AI best-effort

    resolved_at = Column(DateTime, nullable=True)

class Resource(Base):
    __tablename__ = "resources"

    id = Column(String, primary_key=True, default=_uuid)

    integration_id = Column(
        String,
        ForeignKey("integrations.id"),
        nullable=True,
    )

    provider = Column(String, nullable=False)

    resource_type = Column(String, nullable=False)

    external_id = Column(String)

    name = Column(String, nullable=False)

    display_name = Column(String)

    status = Column(String, default="active")

    metadata_json = Column(JSON)

    created_at = Column(DateTime, default=_now)

    updated_at = Column(DateTime, default=_now)


# ==========================================================
# Remote Actions (audit trail for mutating operations)
# ==========================================================
# See REMOTE_ACTIONS_PLAN.md. Every remote action - regardless of
# whether it was fired from a dashboard button or a Watchlist item -
# gets a row here before/after the provider call, success or failure.

class RemoteAction(Base):
    __tablename__ = "remote_actions"

    id = Column(String, primary_key=True, default=_uuid)

    integration_id = Column(String, ForeignKey("integrations.id"), nullable=False)

    provider = Column(String, nullable=False, index=True)  # render / neon / ...

    action = Column(String, nullable=False, index=True)  # redeploy / rollback / suspend / resume

    resource_id = Column(String, nullable=False)  # provider's resource ID acted on

    resource_name = Column(String, nullable=True)  # human-readable name for the log/UI

    triggered_by = Column(String, default="manual")  # manual / watchlist / auto

    incident_id = Column(String, ForeignKey("incidents.id"), nullable=True)

    status = Column(String, default="pending")  # pending / succeeded / failed

    result = Column(JSON, nullable=True)  # raw response / error from provider

    requested_at = Column(DateTime, default=_now)

    completed_at = Column(DateTime, nullable=True)
