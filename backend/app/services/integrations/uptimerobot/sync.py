import requests

UPTIMEROBOT_BASE_URL = "https://api.uptimerobot.com/v3"


def _build_monitor_body(payload: dict) -> dict:
    """
    Translate the form-shaped payload coming from the frontend into the
    UptimeRobot v3 monitor body. Shared by create and update so both
    paths stay in sync.

    NOTE on `config`: v3 nests type-specific settings (keyword matching,
    UDP packet-loss thresholds, DNS record checks, API assertions, etc.)
    under a "config" object keyed by monitor type. This function builds
    the keyword sub-object explicitly since that's the most common case
    exposed in the form; anything else (custom headers, DNS/API/UDP
    specific fields) is passed through verbatim via `advanced_config` so
    the form doesn't need a hardcoded field for every monitor type - if
    UptimeRobot's exact schema for a given type differs from what you
    pass in `advanced_config`, their API will reject it with a 4xx that
    surfaces as a normal error in the UI.
    """
    body = {
        "friendlyName": payload["friendly_name"],
        "type": payload["type"],
    }

    if payload.get("url"):
        body["url"] = payload["url"]
    if payload.get("interval") is not None:
        body["interval"] = payload["interval"]
    if payload.get("timeout") is not None:
        body["timeout"] = payload["timeout"]
    if payload.get("port") is not None:
        body["port"] = payload["port"]

    config = dict(payload.get("advanced_config") or {})

    if payload.get("keyword_value"):
        config["keyword"] = {
            "type": payload.get("keyword_type") or "exists",
            "caseType": payload.get("keyword_case_type") or "CaseInsensitive",
            "value": payload["keyword_value"],
        }

    if config:
        body["config"] = config

    return body


class UptimeRobotSyncService:

    def __init__(self, api_key):
        self.api_key = api_key

    @property
    def headers(self):
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Accept": "application/json",
        }

    def _request(self, method: str, path: str, json_body: dict = None, ok_statuses=(200, 201, 202, 204)):
        try:
            response = requests.request(
                method,
                f"{UPTIMEROBOT_BASE_URL}{path}",
                headers=self.headers,
                # UptimeRobot v3 requires a Content-Type: application/json
                # header on POST/PATCH/DELETE even when there's nothing to
                # send - requests only sets that header when json= gets an
                # actual value, so default to {} rather than None here.
                json=json_body if json_body is not None else {},
                timeout=20,
            )
        except requests.RequestException as exc:
            raise Exception(f"Could not reach UptimeRobot: {exc}")

        if response.status_code not in ok_statuses:
            raise Exception(
                f"UptimeRobot request to {path} failed ({response.status_code}): {response.text[:300]}"
            )

        if response.status_code == 204 or not response.text:
            return {}

        return response.json()

    # -------------------------------------------------------------
    # Lifecycle actions (mutating). Each is a deliberate, user-initiated
    # one-click remote operation on a single existing monitor - not part
    # of the passive sync/logs() path.
    # -------------------------------------------------------------

    def pause_monitor(self, monitor_id: str):
        """
        Pause a monitor - UptimeRobot stops checking it until resumed.

        v3 rejects a "status" field on PATCH /monitors/{id} ("property
        status should not exist") - pause/resume are dedicated action
        endpoints instead, same shape as reset() below.
        """
        self._request("POST", f"/monitors/{monitor_id}/pause")
        return {"id": monitor_id, "status": "paused"}

    def resume_monitor(self, monitor_id: str):
        """Resume ("start") a paused monitor so checks run again."""
        self._request("POST", f"/monitors/{monitor_id}/start")
        return {"id": monitor_id, "status": "active"}

    def reset_monitor(self, monitor_id: str):
        """
        Reset a monitor's stats - permanently erases its uptime ratio,
        response-time history and past up/down logs. Does not delete
        the monitor itself; checks continue afterwards. Irreversible.
        """
        self._request("POST", f"/monitors/{monitor_id}/reset")
        return {"id": monitor_id, "reset": True}

    def delete_monitor(self, monitor_id: str):
        """Permanently delete a monitor and all of its history. Irreversible."""
        self._request("DELETE", f"/monitors/{monitor_id}")
        return {"id": monitor_id, "deleted": True}

    # -------------------------------------------------------------
    # Settings-form operations (mutating). Unlike the lifecycle actions
    # above, these carry a full monitor config rather than a bare
    # id - the dashboard renders them as a form (MonitorFormDialog), not
    # a one-click confirm button.
    # -------------------------------------------------------------

    def create_monitor(self, payload: dict):
        """Create a new monitor. `payload` is the form-shaped dict from the API layer."""
        body = _build_monitor_body(payload)
        response = self._request("POST", "/monitors", json_body=body)
        return response.get("data", response)

    def update_monitor(self, monitor_id: str, payload: dict):
        """
        Edit an existing monitor's config (name, url, interval, timeout,
        port, keyword matching, etc). Partial updates aren't assumed here
        on purpose - the form always submits the full current config so
        there's no ambiguity about which fields v3 will clear vs preserve
        when omitted.
        """
        body = _build_monitor_body(payload)
        response = self._request("PATCH", f"/monitors/{monitor_id}", json_body=body)
        return response.get("data", response)

    def get_monitor(self, monitor_id: str):
        """Fetch a single monitor's full config, used to pre-fill the edit form."""
        response = self._request("GET", f"/monitors/{monitor_id}", ok_statuses=(200,))
        m = response.get("data", response)

        keyword = (m.get("config") or {}).get("keyword") or {}
        advanced_config = {k: v for k, v in (m.get("config") or {}).items() if k != "keyword"}

        return {
            "id": m.get("id"),
            "friendly_name": m.get("friendlyName"),
            "url": m.get("url"),
            "type": m.get("type"),
            "interval": m.get("interval"),
            "timeout": m.get("timeout"),
            "port": m.get("port"),
            "keyword_type": keyword.get("type"),
            "keyword_case_type": keyword.get("caseType"),
            "keyword_value": keyword.get("value"),
            "advanced_config": advanced_config or None,
        }

    def monitors(self):
        try:
            response = requests.get(
                f"{UPTIMEROBOT_BASE_URL}/monitors",
                headers=self.headers,
                timeout=20,
            )
        except requests.RequestException as exc:
            raise Exception(f"Could not reach UptimeRobot: {exc}")

        if response.status_code >= 400:
            raise Exception(
                f"UptimeRobot request failed ({response.status_code}): {response.text}"
            )

        body = response.json()

        monitors = body.get("data", [])

        results = []

        for m in monitors:

            status = str(m.get("status", "")).lower()

            if "up" in status:
                mapped = "up"
            elif "pause" in status:
                mapped = "paused"
            elif "down" in status:
                mapped = "down"
            else:
                mapped = "unknown"

            incident = m.get("lastIncident") or {}

            results.append(
                {
                    "id": m.get("id"),
                    "name": m.get("friendlyName"),
                    "url": m.get("url"),
                    "type": m.get("type"),
                    "status": mapped,
                    "uptime_ratio": None,
                    "logs": [
                        {
                            "type": mapped,
                            "datetime": incident.get("startedAt"),
                            "duration": incident.get("duration"),
                            "reason": incident.get("reason"),
                        }
                    ]
                    if incident
                    else [],
                }
            )

        return results

    def logs(self):
        monitors = self.monitors()

        up_monitors = []
        down_monitors = []
        paused_monitors = []
        recent_incidents = []

        for monitor in monitors:

            if monitor["status"] == "up":
                up_monitors.append(monitor)

            elif monitor["status"] == "paused":
                paused_monitors.append(monitor)

            elif monitor["status"] in ("down", "seems_down"):
                down_monitors.append(monitor)

            for log in monitor["logs"]:
                recent_incidents.append(
                    {
                        **log,
                        "monitor_id": monitor["id"],
                        "monitor_name": monitor["name"],
                    }
                )

        recent_incidents.sort(
            key=lambda x: x.get("datetime") or "",
            reverse=True,
        )

        return {
            "stats": {
                "total_monitors": len(monitors),
                "up_count": len(up_monitors),
                "down_count": len(down_monitors),
                "paused_count": len(paused_monitors),
            },
            "monitors": monitors,
            "down_monitors": down_monitors,
            "paused_monitors": paused_monitors,
            "recent_incidents": recent_incidents[:50],
        }
