import requests

RENDER_BASE_URL = "https://api.render.com/v1"

# Deploy statuses that represent a problem worth surfacing.
FAILED_STATUSES = {"build_failed", "update_failed", "canceled", "deactivated"}

# NOTE: this service intentionally has no method that calls
# /v1/services/{id}/env-vars. That endpoint returns plaintext secret
# values and has no place in a security-monitoring integration - same
# boundary MongoDBSyncService draws around cluster documents.


def _unwrap(item, key):
    """Render list endpoints wrap each item as {"cursor": ..., key: {...}}."""
    if isinstance(item, dict) and key in item:
        return item[key]
    return item


class RenderSyncService:

    def __init__(self, api_key):
        self.headers = {
            "Authorization": f"Bearer {api_key}",
            "Accept": "application/json",
        }

    def _get(self, path: str, params: dict = None):
        response = requests.get(
            f"{RENDER_BASE_URL}{path}",
            headers=self.headers,
            params=params or {},
            timeout=20,
        )

        if response.status_code != 200:
            raise Exception(
                f"Render request to {path} failed ({response.status_code}): {response.text[:200]}"
            )

        return response.json()

    def _post(self, path: str, json_body: dict = None, ok_statuses=(200, 201, 202, 204)):
        response = requests.post(
            f"{RENDER_BASE_URL}{path}",
            headers=self.headers,
            json=json_body or {},
            timeout=20,
        )

        if response.status_code not in ok_statuses:
            raise Exception(
                f"Render request to {path} failed ({response.status_code}): {response.text[:200]}"
            )

        if response.status_code == 204 or not response.text:
            return {}

        return response.json()

    # -------------------------------------------------------------
    # Actions (mutating). Each is a deliberate, user-initiated
    # remote operation - not part of the passive sync/logs() path.
    # Still scoped the same way as read: service/deploy lifecycle
    # only, never env vars, secrets, or disk contents.
    # -------------------------------------------------------------

    def trigger_deploy(self, service_id: str, clear_cache: bool = False):
        """Kick off a new deploy for a service (optionally clearing build cache)."""
        body = {"clearCache": "clear"} if clear_cache else {}
        dep = self._post(f"/services/{service_id}/deploys", json_body=body)
        dep = _unwrap(dep, "deploy")
        return {
            "id": dep.get("id"),
            "status": dep.get("status"),
            "created_at": dep.get("createdAt"),
        }

    def rollback(self, service_id: str, deploy_id: str):
        """Roll a service back to a previously successful deploy."""
        dep = self._post(f"/services/{service_id}/rollback", json_body={"deployId": deploy_id})
        dep = _unwrap(dep, "deploy")
        return {
            "id": dep.get("id") or deploy_id,
            "status": dep.get("status") or "requested",
            "rolled_back_to": deploy_id,
        }

    def cancel_deploy(self, service_id: str, deploy_id: str):
        """Cancel an in-progress deploy."""
        self._post(f"/services/{service_id}/deploys/{deploy_id}/cancel")
        return {"id": deploy_id, "status": "canceled"}

    def suspend_service(self, service_id: str):
        """Suspend a service (stops it from serving traffic / running)."""
        self._post(f"/services/{service_id}/suspend")
        return {"id": service_id, "suspended": True}

    def resume_service(self, service_id: str):
        """Resume a previously suspended service."""
        self._post(f"/services/{service_id}/resume")
        return {"id": service_id, "suspended": False}

    def services(self, limit: int = 100):
        """
        List services owned/accessible by this API key. Read-only
        metadata only - name, type, repo/branch, suspension state.
        """
        data = self._get("/services", params={"limit": limit})

        results = []
        for item in data:
            svc = _unwrap(item, "service")
            results.append({
                "id": svc.get("id"),
                "name": svc.get("name"),
                "type": svc.get("type"),
                "repo": svc.get("repo"),
                "branch": svc.get("branch"),
                "auto_deploy": svc.get("autoDeploy"),
                "suspended": svc.get("suspended"),
                "created_at": svc.get("createdAt"),
                "updated_at": svc.get("updatedAt"),
                "url": (svc.get("serviceDetails") or {}).get("url"),
            })

        return results

    def deploys(self, service_id: str, limit: int = 10):
        """Recent deploys for a single service - status, trigger, commit."""
        data = self._get(
            f"/services/{service_id}/deploys",
            params={"limit": limit},
        )

        results = []
        for item in data:
            dep = _unwrap(item, "deploy")
            commit = dep.get("commit") or {}
            results.append({
                "id": dep.get("id"),
                "status": dep.get("status"),
                "trigger": dep.get("trigger"),
                "created_at": dep.get("createdAt"),
                "finished_at": dep.get("finishedAt"),
                "commit_id": commit.get("id"),
                "commit_message": commit.get("message"),
            })

        return results

    def logs(self):
        """
        Build the same "stats + buckets" shape MongoDBSyncService.logs()
        returns, so the frontend can reuse the same dashboard pattern.
        """
        services = self.services()

        failed_deploys = []
        recent_deploys = []
        suspended_services = []

        for svc in services:
            if svc.get("suspended") and svc["suspended"] != "not_suspended":
                suspended_services.append(svc)

            try:
                deploys = self.deploys(svc["id"], limit=5)
            except Exception:
                # Don't let one bad service (e.g. no deploy history yet)
                # take down the whole sync.
                continue

            for deploy in deploys:
                enriched = {**deploy, "service_id": svc["id"], "service_name": svc["name"]}
                recent_deploys.append(enriched)

                if deploy.get("status") in FAILED_STATUSES:
                    failed_deploys.append(enriched)

        recent_deploys.sort(key=lambda d: d.get("created_at") or "", reverse=True)
        recent_deploys = recent_deploys[:50]

        stats = {
            "total_services": len(services),
            "suspended_count": len(suspended_services),
            "failed_deploy_count": len(failed_deploys),
            "recent_deploy_count": len(recent_deploys),
        }

        return {
            "stats": stats,
            "services": services,
            "recent_deploys": recent_deploys,
            "failed_deploys": failed_deploys,
            "suspended_services": suspended_services,
        }
