# Liminal

**Threat Intel, Live Infra Watch**

Liminal is a blue-team security toolkit that ties together indicator-of-compromise
analysis, an AI assistant that explains what it finds, live monitoring of your
connected infrastructure, and the ability to actually act on threats — not just
report them.

Every account is fully isolated: your integrations, analyses, watchlist, and
history are visible only to you, enforced at the database query level, not
just the UI.

---

## What it does

### 🔍 Manual Analysis
Look up a file hash, IP, domain, or URL and get an aggregated verdict pulled
from multiple threat-intel sources:
- VirusTotal
- AbuseIPDB
- AlienVault OTX
- abuse.ch (URLhaus, MalwareBazaar, ThreatFox)

### 🤖 Liminal (AI)
A chat assistant that reasons over analysis results, answers follow-up
questions, and gives plain-English recommendations instead of leaving you to
interpret raw scores.

### 🔌 Connected Apps
Connect your real infrastructure and get security-relevant signal pulled
automatically:

| Provider | What it watches |
|---|---|
| GitHub | Secret leaks, `.env` pushes, vulnerable dependencies, security events |
| Render | Failed/suspended deploys, service health |
| Neon | Project & branch operations |
| MongoDB Atlas | Project activity/events (read-only, never cluster data) |
| UptimeRobot | Monitor status, outages |

All credentials are encrypted at rest (Fernet/AES) and every provider
integration is strictly read-only unless you explicitly trigger a remote
action.

### 📋 Watchlist & Incidents
Flag resources from any connected app and track them as incidents over time —
status, severity, root cause, recommendations.

### ⚡ Remote Actions
Redeploy, roll back, suspend, or resume — with every action logged to an
audit trail (who, what, when, result) whether it was triggered manually or
from the watchlist.

### 🎛️ Adaptive layout
The nav sidebar and the Connected Apps panel both collapse to an icon rail,
resize by dragging their edge, or respond to a left/right swipe on touch —
so you can reclaim horizontal space for dashboards when you need it.

---

## Tech stack

**Backend:** FastAPI, SQLAlchemy, SQLite (swap-in ready for Postgres via
`psycopg2`), JWT auth (`python-jose`), PBKDF2-HMAC-SHA256 password hashing,
Fernet-encrypted credential storage, Groq for LLM inference.

**Frontend:** React 18, Vite, Tailwind CSS, `lucide-react` icons,
`react-markdown` for rendering AI responses.

---

## Project structure

```
liminal/
├── backend/
│   ├── app/
│   │   ├── core/          # auth, security, encryption, rate limiting, ownership
│   │   ├── db/            # models, session, crud
│   │   ├── routers/        # auth, analyze, chat, history, integrations, ...
│   │   └── services/       # per-provider API clients (github, render, neon, ...)
│   ├── requirements.txt
│   └── run.sh
└── frontend/
    ├── src/
    │   ├── components/     # ui primitives + feature components
    │   ├── hooks/          # useResizablePanel, useSidebarWidth
    │   ├── pages/           # ConnectedApps, HistoryPage, Watchlist, Login, ...
    │   └── api/             # axios client
    └── package.json
```

---

## Getting started

### 1. Backend

```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

Fill in `.env`. Two values are **required** and must be generated yourself
(they're not in `.env.example` as placeholders on purpose — never commit real
secrets):

```bash
# JWT_SECRET — signs auth tokens
python -c "import secrets; print(secrets.token_hex(32))"

# FERNET_KEY — encrypts stored integration credentials
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

Then:

```bash
./run.sh   # starts uvicorn on :8000
```

### 2. Frontend

```bash
cd frontend
cp .env.example .env   # points at http://localhost:8000/api by default
npm install
npm run dev            # starts Vite on :5173
```

Open `http://localhost:5173`, create an account, and you're in.

---

## Security notes

- Passwords: PBKDF2-HMAC-SHA256, 260k iterations, unique salt per user,
  constant-time verification.
- Every account-owned row (integrations, analyses, incidents) is scoped by
  `user_id` and filtered at the query level — a request for someone else's
  resource 404s, it never leaks a 403 that would confirm the resource exists.
- Login and registration are rate-limited (per-IP and per-account) to blunt
  brute-force and mass-registration attempts.
- Integration credentials are encrypted at rest and never returned to the
  client after creation.

---

## Roadmap

- [ ] Timeline view (cross-integration event feed)
- [ ] Additional providers
- [ ] Webhook-based real-time sync (currently poll/manual sync)

---

## License

Add a license before making this repo public — MIT is a reasonable default
if you want others to freely use/fork it.
