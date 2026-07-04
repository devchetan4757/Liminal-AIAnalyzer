import requests

UPTIMEROBOT_BASE_URL = "https://api.uptimerobot.com/v3"


class UptimeRobotSyncService:

    def __init__(self, api_key):
        self.api_key = api_key

    @property
    def headers(self):
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Accept": "application/json",
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
