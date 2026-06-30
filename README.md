# SentryChat — Malware Analysis Chatbot

A chat UI that answers normal questions AND analyzes hashes / URLs / IPs / domains /
uploaded files by pulling results from free threat-intel APIs and having an LLM
explain them in plain English.

## Project structure

```
malware-chatbot/
├── backend/                     FastAPI app
│   ├── app/
│   │   ├── main.py              app entrypoint, CORS, routes
│   │   ├── config.py            env var loading
│   │   ├── core/
│   │   │   ├── indicator.py     detects hash/url/ip/domain in free text
│   │   │   ├── aggregator.py    fans out to services, builds a quick score
│   │   │   └── llm.py           summarizes raw JSON via Claude API
│   │   ├── services/            one file per external API (each fails independently)
│   │   │   ├── virustotal.py
│   │   │   ├── malwarebazaar.py
│   │   │   ├── urlhaus.py
│   │   │   ├── threatfox.py
│   │   │   ├── abuseipdb.py
│   │   │   └── otx.py
│   │   ├── routers/
│   │   │   ├── chat.py          POST /api/chat/message
│   │   │   └── analyze.py       POST /api/analyze/hash, /api/analyze/upload
│   │   └── models/schemas.py    pydantic request/response shapes
│   ├── requirements.txt
│   └── .env.example
│
└── frontend/                    React (Vite) app
    ├── src/
    │   ├── api/client.js         all backend calls in one place
    │   ├── hooks/useChat.js       chat state machine
    │   ├── utils/hash.js          client-side SHA256 (crypto.subtle)
    │   ├── components/
    │   │   ├── ChatWindow.jsx
    │   │   ├── Header.jsx
    │   │   ├── MessageList.jsx
    │   │   ├── MessageBubble.jsx
    │   │   ├── AnalysisCard.jsx
    │   │   ├── VerdictBadge.jsx
    │   │   ├── MessageInput.jsx
    │   │   ├── FileUpload.jsx
    │   │   └── UploadPrompt.jsx
    │   └── styles/index.css
    └── .env.example
```

## How the file-upload flow works

1. User attaches a file. The browser hashes it locally (SHA256) — nothing is
   uploaded yet.
2. Frontend sends just the hash to `/api/analyze/hash`.
3. If the hash is known to VirusTotal/MalwareBazaar/etc, you get an instant
   verdict with zero bandwidth cost.
4. If unknown everywhere, the bot offers an "Upload full file" button. Only
   then does the actual file go to `/api/analyze/upload`, which hashes it
   server-side and re-checks.

This keeps you within free API rate limits almost all the time.

## Setup

### Backend

```bash
cd backend
python -m venv venv && source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env   # then fill in your keys
uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

Open http://localhost:5173

## API keys — what's required vs optional

| Key | Required? | Free tier | Get it at |
|---|---|---|---|
| `GROQ_API_KEY` | Yes (for summaries/chat) | Free, no credit card — 14,400 req/day | console.groq.com |
| `VT_API_KEY` | No | 500 lookups/day, 4/min | virustotal.com/gui/join-us |
| `ABUSEIPDB_API_KEY` | No | 1000 checks/day | abuseipdb.com/register |
| `OTX_API_KEY` | No | Free, unlimited-ish | otx.alienvault.com |

MalwareBazaar, URLhaus, and ThreatFox (all abuse.ch) need **no key at all** —
the app calls them straight away. Missing keys just mean that source is
silently skipped; the app still works with whatever you've configured.

## Notes

- This app *aggregates and explains* other services' verdicts — it does not
  run its own malware detection or sandboxing.
- For real malware samples, avoid running/opening the file yourself; let the
  hash-first flow do the work, and only fall back to upload when needed.
