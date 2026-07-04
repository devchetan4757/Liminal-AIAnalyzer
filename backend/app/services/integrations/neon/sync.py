import requests

NEON_BASE_URL = "https://console.neon.tech/api/v2"

# Operation statuses that represent a problem worth surfacing.
FAILED_STATUSES = {"failed"}
ACTIVE_STATUSES = {"scheduling", "running"}

# NOTE: this service intentionally has no method that calls the
# connection-string / role-password endpoints. That data is never
# needed for security monitoring - same boundary Render and MongoDB
# draw around env vars and cluster documents.


class NeonSyncService:

    def __init__(self, api_key):
        self.headers = {
            "Authorization": f"Bearer {api_key}",
            "Accept": "application/json",
        }

    def _get(self, path: str, params: dict = None):
        response = requests.get(
            f"{NEON_BASE_URL}{path}",
            headers=self.headers,
            params=params or {},
            timeout=20,
        )

        if response.status_code != 200:
            raise Exception(
                f"Neon request to {path} failed ({response.status_code}): {response.text[:200]}"
            )

        return response.json()

    def projects(self, limit: int = 100):
        """
        List projects accessible by this API key. Read-only metadata
        only - name, region, creation/update timestamps, pg version.
        """
        data = self._get("/projects", params={"limit": limit})

        results = []
        for item in data.get("projects", []):
            results.append({
                "id": item.get("id"),
                "name": item.get("name"),
                "region_id": item.get("region_id"),
                "pg_version": item.get("pg_version"),
                "created_at": item.get("created_at"),
                "updated_at": item.get("updated_at"),
                "compute_last_active_at": item.get("compute_last_active_at"),
            })

        return results

    def branches(self, project_id: str):
        """Branches for a single project - name, state, protected flag."""
        data = self._get(f"/projects/{project_id}/branches")

        results = []
        for item in data.get("branches", []):
            results.append({
                "id": item.get("id"),
                "project_id": project_id,
                "name": item.get("name"),
                "default": item.get("default"),
                "protected": item.get("protected"),
                "current_state": item.get("current_state"),
                "created_at": item.get("created_at"),
            })

        return results

    def operations(self, project_id: str, limit: int = 10):
        """Recent control-plane operations for a single project."""
        data = self._get(
            f"/projects/{project_id}/operations",
            params={"limit": limit},
        )

        results = []
        for item in data.get("operations", []):
            results.append({
                "id": item.get("id"),
                "project_id": project_id,
                "branch_id": item.get("branch_id"),
                "action": item.get("action"),
                "status": item.get("status"),
                "failures_count": item.get("failures_count", 0),
                "created_at": item.get("created_at"),
                "updated_at": item.get("updated_at"),
            })

        return results

    def logs(self):
        """
        Build the same "stats + buckets" shape RenderSyncService.logs()
        returns, so the frontend can reuse the same dashboard pattern.
        """
        projects = self.projects()

        all_branches = []
        recent_operations = []
        failed_operations = []

        for project in projects:
            try:
                all_branches.extend(self.branches(project["id"]))
            except Exception:
                # Don't let one bad project take down the whole sync.
                pass

            try:
                ops = self.operations(project["id"], limit=10)
            except Exception:
                continue

            for op in ops:
                enriched = {**op, "project_name": project["name"]}
                recent_operations.append(enriched)

                if op.get("status") in FAILED_STATUSES:
                    failed_operations.append(enriched)

        recent_operations.sort(key=lambda o: o.get("created_at") or "", reverse=True)
        recent_operations = recent_operations[:50]

        stats = {
            "total_projects": len(projects),
            "total_branches": len(all_branches),
            "failed_operation_count": len(failed_operations),
            "recent_operation_count": len(recent_operations),
        }

        return {
            "stats": stats,
            "projects": projects,
            "branches": all_branches,
            "recent_operations": recent_operations,
            "failed_operations": failed_operations,
        }
