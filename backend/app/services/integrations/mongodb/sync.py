import requests
from requests.auth import HTTPDigestAuth

ATLAS_BASE_URL = "https://cloud.mongodb.com/api/atlas/v2"
ATLAS_ACCEPT_HEADER = "application/vnd.atlas.2023-02-01+json"

# Event types that represent security-relevant activity. This is a
# denylist-by-inclusion: we only ever request the /events feed, which is
# administrative/audit metadata (who did what to the project, when). Atlas
# does not expose collection or document contents through this API at all,
# so there's no code path here that could reach into a customer's data.
ALERT_EVENT_PREFIXES = ("ALERT_",)
AUTH_EVENT_PREFIXES = ("USER_", "JOINED_", "REMOVED_FROM_", "LOGIN_")
CLUSTER_EVENT_PREFIXES = ("CLUSTER_", "MAINTENANCE_")
ACCESS_EVENT_PREFIXES = ("NETWORK_", "IP_ACCESS_LIST_", "DATABASE_USER_")


def _categorize(event_type: str) -> str:
    if event_type.startswith(ALERT_EVENT_PREFIXES):
        return "alerts"
    if event_type.startswith(CLUSTER_EVENT_PREFIXES):
        return "cluster_events"
    if event_type.startswith(ACCESS_EVENT_PREFIXES):
        return "access_events"
    if event_type.startswith(AUTH_EVENT_PREFIXES):
        return "auth_events"
    return "other_events"


class MongoDBSyncService:

    def __init__(self, public_key, private_key, group_id):
        self.auth = HTTPDigestAuth(public_key, private_key)
        self.group_id = group_id
        self.headers = {"Accept": ATLAS_ACCEPT_HEADER}

    def _get(self, path: str, params: dict = None):
        response = requests.get(
            f"{ATLAS_BASE_URL}{path}",
            auth=self.auth,
            headers=self.headers,
            params=params or {},
            timeout=20,
        )

        if response.status_code != 200:
            raise Exception(
                f"MongoDB Atlas request to {path} failed ({response.status_code}): {response.text[:200]}"
            )

        return response.json()

    def events(self, limit: int = 100):
        """
        Fetch the project's activity/event log. This is metadata about
        actions taken on the Atlas project (logins, cluster changes,
        alerts, access-list edits, etc.) - never database documents.
        """
        data = self._get(
            f"/groups/{self.group_id}/events",
            params={"itemsPerPage": limit},
        )

        return data.get("results", [])

    def logs(self):
        events = self.events()

        buckets = {
            "alerts": [],
            "cluster_events": [],
            "access_events": [],
            "auth_events": [],
            "other_events": [],
        }

        for event in events:
            event_type = event.get("eventTypeName", "UNKNOWN")
            bucket = _categorize(event_type)

            buckets[bucket].append({
                "id": event.get("id"),
                "type": event_type,
                "created": event.get("created"),
                "username": event.get("username") or event.get("targetUsername"),
                "remote_address": event.get("remoteAddress"),
                "raw": event,
            })

        stats = {
            "total_events": len(events),
            "alert_count": len(buckets["alerts"]),
            "auth_event_count": len(buckets["auth_events"]),
            "access_event_count": len(buckets["access_events"]),
            "cluster_event_count": len(buckets["cluster_events"]),
        }

        return {
            "stats": stats,
            **buckets,
        }
