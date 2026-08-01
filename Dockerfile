# Single-service build for Render: builds the frontend, then runs the
# backend, which serves both the API and the built frontend itself
# (see backend/app/main.py's catch-all route). No nginx, one web service.

# --- Stage 1: build the frontend ---
FROM node:20-alpine AS frontend-build
WORKDIR /frontend
RUN corepack enable
COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY frontend/ ./
# Same-origin /api works here since both are served by the one backend process.
ARG VITE_API_URL=/api
ENV VITE_API_URL=${VITE_API_URL}
RUN pnpm build

# --- Stage 2: backend + built frontend, served from one process ---
FROM python:3.12-slim
WORKDIR /app/backend

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ .
# main.py reads "../frontend/dist" relative to the backend's working dir,
# so the built frontend needs to land one level above /app/backend.
COPY --from=frontend-build /frontend/dist /app/frontend/dist

RUN mkdir -p /app/backend/data
ENV PYTHONUNBUFFERED=1

# Render assigns the port via $PORT at runtime; fall back to 8000 locally.
EXPOSE 8000
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
