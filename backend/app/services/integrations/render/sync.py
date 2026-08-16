import requests

RENDER_BASE_URL = "https://api.render.com/v1"

FAILED_STATUSES = {"build_failed", "update_failed", "canceled", "deactivated"}


class RenderAPIError(Exception):
    """
    Raised when a Render API call fails. Carries the upstream status_code
    and response body so callers can distinguish e.g. plan/feature
    restrictions (403/422) from auth (401) or rate limiting (429), instead
    of everything collapsing into an opaque 502 at the route layer.
    """

    def __init__(self, message: str, status_code: int, body: str):
        super().__init__(message)
        self.status_code = status_code
        self.body = body


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

    def _get(self, path: str, params=None):
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
    # Actions
    # -------------------------------------------------------------

    def trigger_deploy(self, service_id: str, clear_cache: bool = False):
        body = {"clearCache": "clear"} if clear_cache else {}
        dep = self._post(f"/services/{service_id}/deploys", json_body=body)
        dep = _unwrap(dep, "deploy")
        return {
            "id": dep.get("id"),
            "status": dep.get("status"),
            "created_at": dep.get("createdAt"),
        }

    def rollback(self, service_id: str, deploy_id: str):
        dep = self._post(f"/services/{service_id}/rollback", json_body={"deployId": deploy_id})
        dep = _unwrap(dep, "deploy")
        return {
            "id": dep.get("id") or deploy_id,
            "status": dep.get("status") or "requested",
            "rolled_back_to": deploy_id,
        }

    def cancel_deploy(self, service_id: str, deploy_id: str):
        self._post(f"/services/{service_id}/deploys/{deploy_id}/cancel")
        return {"id": deploy_id, "status": "canceled"}

    def suspend_service(self, service_id: str):
        self._post(f"/services/{service_id}/suspend")
        return {"id": service_id, "suspended": True}

    def resume_service(self, service_id: str):
        self._post(f"/services/{service_id}/resume")
        return {"id": service_id, "suspended": False}

    def restart_service(self, service_id: str):
        self._post(f"/services/{service_id}/restart")
        return {"id": service_id, "restarted": True}

    def scale_service(self, service_id: str, num_instances: int):
        self._post(
            f"/services/{service_id}/scale",
            json_body={"numInstances": num_instances},
        )
        return {"id": service_id, "num_instances": num_instances}

    def run_job(self, service_id: str, start_command: str):
        result = self._post(
            f"/services/{service_id}/jobs",
            json_body={"startCommand": start_command},
        )
        return {"id": result.get("id"), "status": result.get("status"), "start_command": start_command}

    def delete_service(self, service_id: str):
        response = requests.delete(
            f"{RENDER_BASE_URL}/services/{service_id}",
            headers=self.headers,
            timeout=20,
        )
        if response.status_code not in (200, 204):
            raise Exception(
                f"Render delete failed ({response.status_code}): {response.text[:200]}"
            )
        return {"id": service_id, "deleted": True}

    def owners(self):
        data = self._get("/owners")
        results = []
        for item in data:
            owner = _unwrap(item, "owner")
            results.append({
                "id": owner.get("id"),
                "name": owner.get("name"),
                "email": owner.get("email"),
                "type": owner.get("type"),
            })
        return results

    def create_service(self, payload: dict):
        service_type = payload.get("type", "web_service")
        runtime = payload.get("runtime", "node")

        service_details: dict = {}

        if service_type == "static_site":
            service_details["publishPath"] = payload.get("publish_path") or "./dist"
        else:
            service_details["region"] = payload.get("region") or "oregon"
            service_details["plan"] = payload.get("plan") or "starter"
            service_details["numInstances"] = int(payload.get("num_instances") or 1)
            service_details["runtime"] = runtime

            if runtime == "image":
                service_details["image"] = {"imagePath": payload.get("image_url")}
            elif runtime == "docker":
                service_details["envSpecificDetails"] = {
                    "dockerfilePath": payload.get("dockerfile_path") or "./Dockerfile",
                    "dockerContext": payload.get("docker_context") or ".",
                }
            else:
                service_details["envSpecificDetails"] = {
                    "buildCommand": payload.get("build_command") or "",
                    "startCommand": payload.get("start_command") or "",
                }

            if service_type == "cron_job" and payload.get("schedule"):
                service_details["schedule"] = payload["schedule"]

            if payload.get("pull_request_previews") is not None:
                service_details["pullRequestPreviewsEnabled"] = (
                    "yes" if payload["pull_request_previews"] else "no"
                )

        if payload.get("advanced_config"):
            service_details.update(payload["advanced_config"])

        body = {
            "type": service_type,
            "name": payload["name"],
            "ownerId": payload["owner_id"],
            "autoDeploy": "yes" if payload.get("auto_deploy", True) else "no",
            "serviceDetails": service_details,
        }

        env_vars = [
            {"key": e["key"], "value": e["value"]}
            for e in (payload.get("env_vars") or [])
            if e.get("key")
        ]
        if env_vars:
            body["envVars"] = env_vars

        if runtime != "image":
            body["repo"] = payload.get("repo")
            if payload.get("branch"):
                body["branch"] = payload["branch"]
            if payload.get("root_dir"):
                body["rootDir"] = payload["root_dir"]

        svc = self._post("/services", json_body=body)
        svc = _unwrap(svc, "service")
        return {
            "id": svc.get("id"),
            "name": svc.get("name"),
            "type": svc.get("type"),
            "url": (svc.get("serviceDetails") or {}).get("url"),
        }

    # -------------------------------------------------------------
    # Service performance — replaces the old CPU%/memory metrics()
    # method, which called Render's /metrics endpoint and 403/422'd on
    # Free-tier instance types. get_service_url() below only needs the
    # plain /services/{id} lookup (available on every plan) so the
    # actual performance check (see uptime.py) can hit the service's
    # real public URL instead.
    # -------------------------------------------------------------

    def get_service_url(self, service_id: str) -> str | None:
        """Fetch a single service's public URL, or None if it doesn't have one
        (e.g. a private service, static site without a custom domain issue,
        or background worker)."""
        svc = self._get(f"/services/{service_id}")
        svc = _unwrap(svc, "service")
        return (svc.get("serviceDetails") or {}).get("url")

    # -------------------------------------------------------------
    # Reads
    # -------------------------------------------------------------

    def services(self, limit: int = 100):
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

    def _resolve_owner_id(self, service_id: str) -> str:
        svc = self._get(f"/services/{service_id}")
        svc = _unwrap(svc, "service")
        owner_id = svc.get("ownerId") or (svc.get("owner") or {}).get("id")
        if not owner_id:
            raise Exception(f"Could not resolve owner for service {service_id}")
        return owner_id

    def service_logs(self, service_id: str, limit: int = 100, log_type: str = None):
        owner_id = self._resolve_owner_id(service_id)

        params = {
            "ownerId": owner_id,
            "resource": [service_id],
            "limit": limit,
            "direction": "backward",
        }
        if log_type:
            params["type"] = [log_type]

        data = self._get("/logs", params=params)
        entries = data.get("logs", []) if isinstance(data, dict) else (data or [])

        results = []
        for entry in entries:
            labels = {l.get("name"): l.get("value") for l in (entry.get("labels") or [])}
            results.append({
                "id": entry.get("id"),
                "timestamp": entry.get("timestamp"),
                "message": entry.get("message"),
                "level": labels.get("level"),
                "type": labels.get("type"),
            })

        return {
            "service_id": service_id,
            "logs": results,
            "has_more": bool(data.get("hasMore")) if isinstance(data, dict) else False,
        }

    def logs(self):
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
