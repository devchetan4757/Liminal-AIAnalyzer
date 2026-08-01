"""
Live uptime / response-time checks for a Render service's own public URL.

Why this exists: Render's /metrics API (CPU %, memory) 403s/422s for
Free-tier instance types, so the old ServiceMetricsPanel was permanently
broken for most users' services. This module never touches that endpoint.
Instead it makes a real HTTP request straight to the service's public URL
and times it - something that works identically regardless of plan, since
it's just a normal request any browser could make.

Each call to check_url() is one data point. The router persists it via
crud.record_uptime_check() (see app/db/models.ServiceUptimeCheck), so a
genuine response-time/uptime history accumulates over time as the panel
gets opened/refreshed - real measurements, not synthetic/placeholder data.
"""

import time
import requests

DEFAULT_TIMEOUT = 10  # seconds


def check_url(url: str, timeout: int = DEFAULT_TIMEOUT) -> dict:
    """
    Perform one live HTTP GET against `url` and time it.

    A service is considered "up" if it returned any response at all with
    a status code under 500 - i.e. the server is reachable and answering,
    even if that answer is a 404 or a redirect. 5xx responses, timeouts,
    DNS failures, and connection errors are all treated as "down".
    """
    if not url:
        return {
            "is_up": False,
            "status_code": None,
            "response_time_ms": None,
            "error": "Service has no public URL to check (e.g. a private service or background worker).",
        }

    start = time.perf_counter()
    try:
        response = requests.get(url, timeout=timeout, allow_redirects=True)
        elapsed_ms = int((time.perf_counter() - start) * 1000)
        return {
            "is_up": response.status_code < 500,
            "status_code": response.status_code,
            "response_time_ms": elapsed_ms,
            "error": None,
        }
    except requests.Timeout:
        elapsed_ms = int((time.perf_counter() - start) * 1000)
        return {
            "is_up": False,
            "status_code": None,
            "response_time_ms": elapsed_ms,
            "error": f"Timed out after {timeout}s",
        }
    except requests.RequestException as exc:
        elapsed_ms = int((time.perf_counter() - start) * 1000)
        return {
            "is_up": False,
            "status_code": None,
            "response_time_ms": elapsed_ms,
            "error": str(exc)[:200],
        }


def summarize(checks: list) -> dict:
    """
    Roll up a list of ServiceUptimeCheck rows (ordered oldest -> newest,
    matching crud.get_uptime_checks) into the headline stats the panel
    shows above the chart.
    """
    if not checks:
        return {
            "current_status": "unknown",
            "uptime_pct": None,
            "avg_response_time_ms": None,
            "min_response_time_ms": None,
            "max_response_time_ms": None,
            "checks_count": 0,
        }

    up_count = sum(1 for c in checks if c.is_up)
    times = [c.response_time_ms for c in checks if c.response_time_ms is not None]
    latest = checks[-1]

    return {
        "current_status": "up" if latest.is_up else "down",
        "uptime_pct": round((up_count / len(checks)) * 100, 2),
        "avg_response_time_ms": round(sum(times) / len(times)) if times else None,
        "min_response_time_ms": min(times) if times else None,
        "max_response_time_ms": max(times) if times else None,
        "checks_count": len(checks),
    }
