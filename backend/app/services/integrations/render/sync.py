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

    def restart_service(self, service_id: str):
        """Restart all running instances on their current deploy (not supported for cron jobs)."""
        self._post(f"/services/{service_id}/restart")
        return {"id": service_id, "restarted": True}

    def scale_service(self, service_id: str, num_instances: int):
        """Manually scale a service to a fixed instance count (1-100). Ignored while autoscaling is enabled."""
        num_instances = int(num_instances)
        self._post(f"/services/{service_id}/scale", json_body={"numInstances": num_instances})
        return {"id": service_id, "num_instances": num_instances}

    def delete_service(self, service_id: str):
        """Permanently delete a service. Irreversible - mirrors what Render's own dashboard exposes."""
        response = requests.delete(
            f"{RENDER_BASE_URL}/services/{service_id}",
            headers=self.headers,
            timeout=20,
        )
        if response.status_code not in (200, 204):
            raise Exception(
                f"Render request to delete service failed ({response.status_code}): {response.text[:200]}"
            )
        return {"id": service_id, "deleted": True}

    def run_job(self, service_id: str, start_command: str):
        """Run a one-off job on the service using the given shell command."""
        job = self._post(
            f"/services/{service_id}/jobs",
            json_body={"startCommand": start_command},
        )
        job = _unwrap(job, "job")
        return {
            "id": job.get("id"),
            "status": job.get("status"),
            "start_command": start_command,
        }

    # -------------------------------------------------------------
    # Create (settings-form operation, not a one-click remote action -
    # same split UptimeRobotSyncService draws between create_monitor
    # and pause/resume/reset/delete). Lives here rather than in
    # remote_actions because it needs a multi-field form, not a confirm
    # dialog.
    # -------------------------------------------------------------

    def owners(self, limit: int = 100):
        """List workspaces/accounts this API key can create services under."""
        data = self._get("/owners", params={"limit": limit})

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
        """
        Create a new service. `payload` is the simplified shape the
        frontend form sends (see ServiceFormDialog.jsx) - this method
        maps it onto Render's actual nested create-service body.

        Covers the common git-deploy and Docker/image cases directly.
        For anything unusual (less common runtime fields, workflow-only
        options, etc.), `payload["advanced_config"]` is merged directly
        into serviceDetails last, so it always wins - same escape hatch
        UptimeRobotSyncService uses for monitor config.
        """
        service_type = payload["type"]
        runtime = payload.get("runtime")

        service_details = {
            "region": payload.get("region") or "oregon",
            "plan": payload.get("plan") or "starter",
        }

        if service_type == "static_site":
            service_details["buildCommand"] = payload.get("build_command") or ""
            service_details["publishPath"] = payload.get("publish_path") or "."
        else:
            service_details["runtime"] = runtime
            service_details["numInstances"] = int(payload.get("num_instances") or 1)

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

    # -------------------------------------------------------------
    # On-demand raw logs for a single service. Deliberately separate
    # from logs() above (which is a deploy/suspension summary reused
    # from the dashboard "stats + buckets" shape) - actual log lines
    # are only fetched when a user opens a specific service's log
    # view, not on every passive sync/status poll. Still read-only,
    # same boundary as the rest of this file: log text Render already
    # shows on the service's own log page, never env vars or secrets.
    # -------------------------------------------------------------

    def _resolve_owner_id(self, service_id: str) -> str:
        """Render's /logs endpoint requires an explicit ownerId, unlike
        the per-service endpoints which infer it from the service id."""
        svc = self._get(f"/services/{service_id}")
        svc = _unwrap(svc, "service")
        owner_id = svc.get("ownerId") or (svc.get("owner") or {}).get("id")
        if not owner_id:
            raise Exception(f"Could not resolve owner for service {service_id}")
        return owner_id

    def service_logs(self, service_id: str, limit: int = 100, log_type: str = None):
        """
        Fetch recent raw log lines for a single service (app + build
        output), most recent first. Called only when the user clicks
        into a service's log panel - never as part of sync()/logs().
        """
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
