"""
In-memory rate limiting for auth endpoints (login/register).

There's no Redis/shared cache in this stack, so this tracks attempts
per-process using a plain dict guarded by a lock. That's fine for a
single-process deployment; if this ever runs with multiple workers,
swap the storage for Redis so limits are shared across processes.

Two layers are applied at the call site (see routers/auth.py):
  - per-IP: stops one client from hammering the endpoint at all,
    regardless of which username they try.
  - per-IP+username: stops targeted credential stuffing / password
    guessing against a single account without penalizing every other
    user sharing that IP (e.g. behind NAT/office wifi).
"""
import threading
import time
from collections import defaultdict

from fastapi import HTTPException, Request


class RateLimiter:
    def __init__(self, max_attempts: int, window_seconds: int):
        self.max_attempts = max_attempts
        self.window_seconds = window_seconds
        self._hits: dict[str, list[float]] = defaultdict(list)
        self._lock = threading.Lock()

    def check(self, key: str) -> None:
        """Raise 429 if `key` has hit the limit; otherwise record this attempt."""
        now = time.time()
        with self._lock:
            hits = self._hits[key]
            cutoff = now - self.window_seconds
            hits[:] = [t for t in hits if t > cutoff]

            if len(hits) >= self.max_attempts:
                retry_after = int(hits[0] + self.window_seconds - now) + 1
                raise HTTPException(
                    status_code=429,
                    detail=f"Too many attempts. Try again in {retry_after}s.",
                    headers={"Retry-After": str(retry_after)},
                )

            hits.append(now)

    def reset(self, key: str) -> None:
        """Clear attempts for `key`, e.g. after a successful login."""
        with self._lock:
            self._hits.pop(key, None)


# 8 tries / 5 min per IP+username - generous for a fat-fingered password,
# tight enough to make guessing impractical.
login_limiter = RateLimiter(max_attempts=8, window_seconds=300)

# Looser per-IP ceiling so someone trying a few different accounts from
# the same network doesn't lock out everyone else on it after one bad
# actor - this just catches outright hammering.
login_ip_limiter = RateLimiter(max_attempts=30, window_seconds=300)

# Registration is cheap to abuse for username-enumeration / spam
# accounts, so it gets its own, stricter per-IP limit.
register_ip_limiter = RateLimiter(max_attempts=10, window_seconds=3600)


def client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"
