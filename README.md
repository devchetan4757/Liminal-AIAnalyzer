# Liminal — Malware & Infrastructure Security Chatbot

Liminal is a security assistant that combines threat-intel indicator
analysis (hashes, URLs, IPs, domains) with read-only monitoring of your
connected infrastructure apps (GitHub, Render, Neon, UptimeRobot,
MongoDB Atlas) — all explained in plain English by an AI layer, with a
Watchlist to track and remediate anything that's currently broken.

---

## Features

### Security analysis
- Submit a file hash, URL, IP, domain, or upload a file for analysis.
- Aggregates results from VirusTotal, AbuseIPDB, OTX, URLhaus,
  MalwareBazaar, and ThreatFox (each optional — the app works with
  whichever API keys you configure).
- An AI layer (Groq / Llama 3.3) turns the raw JSON into a plain-English
  verdict, findings, and recommendation.
- Chat interface for follow-up questions ("is it safe to open that file?")
  using conversation memory of the most recently analyzed indicator.
- Full history of past analyses, filterable by verdict/type.

### Connected Apps (read-only monitoring)
- Connect GitHub, Render, Neon, UptimeRobot, and MongoDB Atlas with
  scoped API credentials (encrypted at rest).
- Per-provider dashboards: GitHub security findings, Render
  services/deploys, Neon projects/branches/operations, UptimeRobot
  monitors/incidents, MongoDB Atlas events.
- **Liminal never mutates a connected app.** Every integration is
  read-only by design — status/logs/events only.

### Watchlist
- From any dashboard, add a failing item (failed deploy, down monitor,
  failed DB operation) to the Watchlist with one click — no need to leave
  Liminal.
- Each item gets an AI-generated one-line summary of what's wrong.
- Where a verified, human-reviewed playbook exists for that
  provider/error type, you get concrete numbered remediation steps,
  clearly labeled **"Verified playbook."** Otherwise you get a
  best-effort AI suggestion, clearly labeled **"AI suggestion"** so it's
  never confused with tested instructions.
- Currently wired into Render (failed deploys), Neon (failed operations),
  and UptimeRobot (down monitors). GitHub and MongoDB dashboards are not
  wired into Watchlist yet (see Roadmap).
- Resolve or delete items once fixed. Fixing still happens in the
  provider's own dashboard — Watchlist only reads and tracks, it doesn't
  act on your behalf.

---

## Tech stack

| Layer      | Stack |
|------------|-------|
| Backend    | FastAPI, SQLAlchemy (SQLite), Groq (Llama 3.3 70B) |
| Frontend   | React 18, Vite, Tailwind CSS, lucide-react |
| Auth       | JWT (python-jose) |
| Storage    | SQLite (`backend/sentrychat.db`), no external DB required |

---

## Project structure

```
backend/
  app/
    core/            # auth, encryption, LLM calls, plugin/indicator logic
    db/               # SQLAlchemy models, session, CRUD
    models/           # Pydantic schemas
    routers/          # FastAPI route modules (one per feature/provider)
    services/         # threat-intel clients + per-provider integrations
      integrations/
        github/ render/ neon/ uptimerobot/ mongodb/
      remediation.py  # Watchlist playbooks + classification
  requirements.txt
  run.sh
  sentrychat.db       # SQLite file (created on first run)

frontend/
  src/
    api/client.js     # single axios client, all API calls
    components/        # shared UI + per-provider tab components
      watchlist/        # AddToWatchlistButton
      render/ neon/ uptimerobot/ mongodb/
    pages/              # top-level routed pages (Chat, History, Watchlist, dashboards)
    styles/
```

---

## Setup

### Prerequisites
- Python 3.11+
- Node.js 18+ / pnpm
- A free [Groq](https://console.groq.com) API key (required — powers all
  AI summaries and chat)

### 1. Backend

```bash
cd backend
python -m venv venv && source venv/bin/activate   # optional but recommended
pip install -r requirements.txt
cp .env.example .env
# edit .env and set at minimum GROQ_API_KEY
./run.sh
```

Backend runs on `http://localhost:8000`. On first run it creates
`sentrychat.db` automatically with the current schema.

> **Upgrading an existing DB?** If you already have a `sentrychat.db`
> from before the Watchlist feature, `create_all()` will **not** add the
> new columns to the existing `incidents` table. Run the one-time
> migration first:
> ```bash
> cd backend
> python migrate_watchlist.py
> ```
> It's idempotent — safe to run again or on a fresh DB (it just no-ops).

### 2. Frontend

```bash
cd frontend
pnpm install
cp .env.example .env
pnpm dev
```

Frontend runs on `http://localhost:5173` and talks to the backend at
whatever `VITE_API_URL` points to.

### 3. Environment variables

**`backend/.env`**

| Variable            | Required | Purpose |
|---------------------|----------|---------|
| `GROQ_API_KEY`      | ✅ | AI summaries + chat answers |
| `VT_API_KEY`        | optional | VirusTotal lookups |
| `ABUSEIPDB_API_KEY` | optional | AbuseIPDB lookups |
| `OTX_API_KEY`       | optional | AlienVault OTX lookups |
| `ABUSECH_API_KEY`   | optional | URLhaus / MalwareBazaar / ThreatFox (single key for all three) |
| `CORS_ORIGINS`      | ✅ (has default) | comma-separated origins allowed to call the API |

Any threat-intel key you skip is simply omitted from the aggregated
results — the app doesn't fail without them.

**`frontend/.env`**

| Variable        | Purpose |
|-----------------|---------|
| `VITE_API_URL`  | Base URL the frontend calls (`http://localhost:8000/api` for local dev) |

Connected App credentials (GitHub/Render/Neon/UptimeRobot/MongoDB API
keys) are **not** env vars — they're added per-user through the Connected
Apps page in the UI and stored encrypted in the database.

---

## Building for production

```bash
cd frontend
pnpm build          # outputs to frontend/dist
```

The FastAPI backend serves the built frontend directly — `app/main.py`
mounts `frontend/dist` and serves `index.html` for any unmatched route, so
a single backend process (`uvicorn app.main:app`) serves the whole app.

---

## Roadmap
- Wire GitHub security findings and MongoDB alerts into Watchlist (their
  dashboard cards have a different shape than Render/Neon/UptimeRobot and
  need dedicated wiring — see `WATCHLIST_PLAN.md`).
- **Remote Actions** — optional, confirm-gated remote operations
  (redeploy, restart, pause/resume, etc.) on connected apps, with a hard
  rule that medium/high-risk actions can never fire without explicit
  human confirmation. See `REMOTE_ACTIONS_PLAN.md` for the full design.
- Timeline view (currently a placeholder in the sidebar).

---

## Security notes
- All Connected App credentials are encrypted at rest
  (`app/core/encryption.py`).
- Every provider integration is strictly read-only today — no code path
  mutates a connected app's state.
- Auth is JWT-based; protected routes use the `auth_guard` dependency.
