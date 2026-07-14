import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Column,
    String,
    Boolean,
    DateTime,
    Integer,
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
# Users
# ==========================================================
# Every account-owned row below (Integration, Analysis, Incident) carries
# a user_id so one account can never see or touch another's data. There
# is no shared/admin view - ownership is the only access control.

class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=_uuid)

    username = Column(String, nullable=False, unique=True, index=True)

    # PBKDF2-HMAC-SHA256 hash, "pbkdf2_sha256$<iterations>$<salt_hex>$<hash_hex>" -
    # see app/core/security.py. Never a plaintext or reversibly-encrypted password.
    hashed_password = Column(String, nullable=False)

    created_at = Column(DateTime, default=_now)

    integrations = relationship("Integration", back_populates="owner", cascade="all, delete")
    analyses = relationship("Analysis", back_populates="owner", cascade="all, delete")
    incidents = relationship("Incident", back_populates="owner", cascade="all, delete")
    conversations = relationship("Conversation", back_populates="owner", cascade="all, delete")


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

    # Nullable so any pre-existing rows from before accounts existed don't
    # break, but every row created going forward always sets this - see
    # save_analysis() in app/db/crud.py.
    user_id = Column(String, ForeignKey("users.id"), nullable=True, index=True)
    owner = relationship("User", back_populates="analyses")

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

    # Nullable only so a pre-account SQLite file doesn't hard-crash on
    # startup - every route that reads/writes integrations requires and
    # filters on this, so a null-owner row is simply unreachable by
    # anyone. New rows always set it (see routers/integrations.py).
    user_id = Column(String, ForeignKey("users.id"), nullable=True, index=True)
    owner = relationship("User", back_populates="integrations")

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

    # Required by the credential-age posture check (see
    # core/posture/checks/credential_age.py). Nullable + falls back to
    # created_at in that check so existing rows don't need a backfill.
    credentials_rotated_at = Column(DateTime, nullable=True)

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
    # Added alongside events/resources above - remote_actions has a
    # NOT NULL FK to integrations.id with no ON DELETE clause, so
    # without this cascade, deleting an integration that ever had a
    # remote action (redeploy, pause, delete monitor, etc.) run
    # against it fails with a ForeignKeyViolation.
    remote_actions = relationship(
        "RemoteAction",
        backref="integration",
        cascade="all, delete",
    )
    security_findings = relationship(
        "SecurityFinding",
        back_populates="integration",
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

    # Set from the integration's owner at creation time (see
    # routers/watchlist.py) - kept as its own column rather than only
    # inferred via integration_id so ownership checks don't need a join.
    user_id = Column(String, ForeignKey("users.id"), nullable=True, index=True)
    owner = relationship("User", back_populates="incidents")

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


# ==========================================================
# Security Posture
# ==========================================================
# Backs the /api/posture routes (routers/posture.py) and the scan
# pipeline (core/posture/scan.py). A scan diffs freshly-run checks
# against existing *open* SecurityFinding rows (keyed on
# category+title) and snapshots a score afterward -- see scan.py's
# docstring for the full flow.

class SecurityFinding(Base):
    __tablename__ = "security_findings"

    id = Column(String, primary_key=True, default=_uuid)

    integration_id = Column(String, ForeignKey("integrations.id"), nullable=False, index=True)
    integration = relationship("Integration", back_populates="security_findings")

    category = Column(String, nullable=False, index=True)
    # "misconfig" | "secret_leak" | "vuln_dependency" | "anomaly" | "credential_age"

    severity = Column(String, nullable=False, index=True)
    # "low" | "medium" | "high" | "critical"

    title = Column(String, nullable=False)
    detail = Column(JSON, nullable=True)

    status = Column(String, default="open", index=True)  # "open" | "resolved"

    detected_at = Column(DateTime, default=_now)
    resolved_at = Column(DateTime, nullable=True)


class PostureScore(Base):
    __tablename__ = "posture_scores"

    id = Column(String, primary_key=True, default=_uuid)

    integration_id = Column(String, ForeignKey("integrations.id"), nullable=False, index=True)

    score = Column(Integer, nullable=False)  # 0-100
    computed_at = Column(DateTime, default=_now, index=True)
    breakdown = Column(JSON, nullable=True)


# ==========================================================
# Conversations (saved chat history)
# ==========================================================
# Backs routers/conversations.py + the chat/analyze flows. Replaces the
# old "session_id only lives in an in-process dict" approach -- the dict
# in core/memory.py is still used as a fast working-memory cache for the
# LLM within a request, but every turn is now durably persisted here too,
# keyed by conversation_id (which doubles as the memory.py session_id).

class Conversation(Base):
    __tablename__ = "conversations"

    id = Column(String, primary_key=True, default=_uuid)

    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    owner = relationship("User", back_populates="conversations")

    title = Column(String, nullable=True)
    # Auto-generated from the first user message once it arrives (see
    # crud.append_message) -- null until then, rendered as "New chat".

    created_at = Column(DateTime, default=_now, index=True)
    last_message_at = Column(DateTime, default=_now, index=True)
    # Drives sidebar ordering -- most recently active conversation first.

    messages = relationship(
        "ConversationMessage",
        back_populates="conversation",
        cascade="all, delete",
        order_by="ConversationMessage.created_at",
    )


class ConversationMessage(Base):
    __tablename__ = "conversation_messages"

    id = Column(String, primary_key=True, default=_uuid)

    conversation_id = Column(String, ForeignKey("conversations.id"), nullable=False, index=True)
    conversation = relationship("Conversation", back_populates="messages")

    role = Column(String, nullable=False)  # "user" | "assistant"
    content = Column(Text, nullable=False)

    message_type = Column(String, default="text")  # "text" | "analysis" | "file"

    # Set only for message_type="analysis" -- lets a resumed conversation
    # re-render the full analysis card (verdict/findings/sources/etc.)
    # by joining back to the Analysis row, instead of duplicating that
    # JSON into every message row.
    analysis_id = Column(String, ForeignKey("analyses.id"), nullable=True)

    created_at = Column(DateTime, default=_now, index=True)
