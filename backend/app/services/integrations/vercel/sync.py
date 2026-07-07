import requests

VERCEL_BASE_URL = "https://api.vercel.com"

# Deployment states that represent a problem worth surfacing.
FAILED_STATES = {"ERROR", "CANCELED"}

# States a deployment can still be canceled from.
IN_PROGRESS_STATES = {"QUEUED", "BUILDING", "INITIALIZING"}

# NOTE: this service intentionally has no method that calls
# /v9/projects/{id}/env. That endpoint returns plaintext environment
# variable values and has no place in a security-monitoring integration -
# same boundary RenderSyncService draws around Render's env-vars endpoint
# and MongoDBSyncService draws around cluster documents.


class VercelSyncService:

    def __init__(self, api_key, team_id=None):
        self.headers = {
            "Authorization": f"Bearer {api_key}",
            "Accept": "application/json",
        }
        self.team_id = team_id

    def _params(self, extra=None):
        params = dict(extra or {})
        if self.team_id:
            params["teamId"] = self.team_id
        return params

    def _get(self, path: str, params: dict = None):
        response = requests.get(
            f"{VERCEL_BASE_URL}{path}",
            headers=self.headers,
            params=self._params(params),
            timeout=20,
        )

        if response.status_code != 200:
            raise Exception(
                f"Vercel request to {path} failed ({response.status_code}): {response.text[:200]}"
            )

        return response.json()

    def _post(self, path: str, json_body: dict = None, ok_statuses=(200, 201, 202)):
        response = requests.post(
            f"{VERCEL_BASE_URL}{path}",
            headers=self.headers,
            params=self._params(),
            json=json_body or {},
            timeout=20,
        )

        if response.status_code not in ok_statuses:
            raise Exception(
                f"Vercel request to {path} failed ({response.status_code}): {response.text[:200]}"
            )

        if not response.text:
            return {}

        return response.json()

    def _patch(self, path: str, json_body: dict = None, ok_statuses=(200, 202, 204)):
        response = requests.patch(
            f"{VERCEL_BASE_URL}{path}",
            headers=self.headers,
            params=self._params(),
            json=json_body or {},
            timeout=20,
        )

        if response.status_code not in ok_statuses:
            raise Exception(
                f"Vercel request to {path} failed ({response.status_code}): {response.text[:200]}"
            )

        if not response.text:
            return {}

        return response.json()

    # -------------------------------------------------------------
    # Actions (mutating). Each is a deliberate, user-initiated remote
    # operation - not part of the passive sync/logs() path. Scoped the
    # same way as read: deployment/project lifecycle only, never env
    # vars, secrets, or source files.
    # -------------------------------------------------------------

    def redeploy(self, service_id: str, target: str = None):
        """
        Create a new deployment that redeploys an existing one
        (`service_id` here is the deployment's uid - see note in
        VercelProvider). Mirrors Vercel's own "Redeploy" dashboard
        button, which re-runs a prior deployment's build rather than
        pulling new source.
        """
        existing = self._get(f"/v13/deployments/{service_id}")
        body = {
            "name": existing.get("name") or existing.get("project"),
            "deploymentId": service_id,
            "target": target or existing.get("target") or "production",
        }
        dep = self._post("/v13/deployments", json_body=body)
        return {
            "id": dep.get("id") or dep.get("uid"),
            "status": dep.get("readyState") or dep.get("status"),
            "url": dep.get("url"),
        }

    def cancel_deployment(self, service_id: str):
        """Cancel an in-progress deployment (queued/building/initializing)."""
        dep = self._patch(f"/v12/deployments/{service_id}/cancel")
        return {
            "id": service_id,
            "status": dep.get("readyState") or "CANCELED",
        }

    def promote(self, service_id: str, project_id: str):
        """
        Promote an existing (e.g. preview) deployment to production for
        its project - the same "Promote to Production" action available
        in Vercel's dashboard.
        """
        self._post(f"/v10/projects/{project_id}/promote/{service_id}")
        return {"id": service_id, "project_id": project_id, "promoted": True}

    def delete_deployment(self, service_id: str):
        """Permanently delete a deployment. Irreversible - mirrors Vercel's own dashboard."""
        response = requests.delete(
            f"{VERCEL_BASE_URL}/v13/deployments/{service_id}",
            headers=self.headers,
            params=self._params(),
            timeout=20,
        )
        if response.status_code not in (200, 204):
            raise Exception(
                f"Vercel request to delete deployment failed ({response.status_code}): {response.text[:200]}"
            )
        return {"id": service_id, "deleted": True}

    # -------------------------------------------------------------
    # Read (passive sync path).
    # -------------------------------------------------------------

    def projects(self, limit: int = 100):
        """
        List projects accessible by this token. Read-only metadata only -
        name, framework, and the latest deployment's state.
        """
        data = self._get("/v9/projects", params={"limit": limit})

        results = []
        for item in data.get("projects", []):
            latest = (item.get("latestDeployments") or [None])[0] or {}
            results.append({
                "id": item.get("id"),
                "name": item.get("name"),
                "framework": item.get("framework"),
                "created_at": item.get("createdAt"),
                "updated_at": item.get("updatedAt"),
                "latest_deployment_id": latest.get("uid") or latest.get("id"),
                "latest_deployment_state": latest.get("readyState") or latest.get("state"),
                "url": f"https://{latest.get('url')}" if latest.get("url") else None,
            })

        return results

    def deployments(self, project_id: str, limit: int = 10):
        """Recent deployments for a single project - state, target, commit."""
        data = self._get(
            "/v6/deployments",
            params={"projectId": project_id, "limit": limit},
        )

        results = []
        for item in data.get("deployments", []):
            meta = item.get("meta") or {}
            results.append({
                "id": item.get("uid"),
                "project_id": project_id,
                "name": item.get("name"),
                "state": item.get("state") or item.get("readyState"),
                "target": item.get("target") or "preview",
                "created_at": item.get("createdAt") or item.get("created"),
                "url": f"https://{item.get('url')}" if item.get("url") else None,
                "commit_id": meta.get("githubCommitSha") or meta.get("gitCommitSha"),
                "commit_message": meta.get("githubCommitMessage") or meta.get("gitCommitMessage"),
            })

        return results

    def logs(self):
        """
        Build the same "stats + buckets" shape RenderSyncService.logs()
        returns, so the frontend can reuse the same dashboard pattern.
        """
        projects = self.projects()

        recent_deployments = []
        failed_deployments = []

        for project in projects:
            try:
                deployments = self.deployments(project["id"], limit=10)
            except Exception:
                # Don't let one bad project (e.g. no deploys yet) take
                # down the whole sync.
                continue

            for deployment in deployments:
                enriched = {**deployment, "project_name": project["name"]}
                recent_deployments.append(enriched)

                if deployment.get("state") in FAILED_STATES:
                    failed_deployments.append(enriched)

        recent_deployments.sort(key=lambda d: d.get("created_at") or "", reverse=True)
        recent_deployments = recent_deployments[:50]

        stats = {
            "total_projects": len(projects),
            "failed_deployment_count": len(failed_deployments),
            "recent_deployment_count": len(recent_deployments),
        }

        return {
            "stats": stats,
            "projects": projects,
            "recent_deployments": recent_deployments,
            "failed_deployments": failed_deployments,
        }
