import requests

SUPABASE_BASE_URL = "https://api.supabase.com"

# Project statuses that represent a problem worth surfacing. Transitional
# statuses (COMING_UP, RESTORING, UPGRADING, RESIZING, ...) are left out
# on purpose - they're normal, not incidents.
PROBLEM_STATUSES = {
    "ACTIVE_UNHEALTHY",
    "INIT_FAILED",
    "RESTORE_FAILED",
    "PAUSE_FAILED",
    "UNKNOWN",
    "REMOVED",
}

# NOTE: this service intentionally has no method that calls the
# database connection-string, service-role/anon key, or Postgres
# config endpoints. That data is never needed for security monitoring -
# same boundary Neon draws around connection strings and role passwords.


class SupabaseSyncService:

    def __init__(self, api_key):
        self.headers = {
            "Authorization": f"Bearer {api_key}",
            "Accept": "application/json",
        }

    def _get(self, path: str, params: dict = None):
        response = requests.get(
            f"{SUPABASE_BASE_URL}{path}",
            headers=self.headers,
            params=params or {},
            timeout=20,
        )

        if response.status_code != 200:
            raise Exception(
                f"Supabase request to {path} failed ({response.status_code}): {response.text[:200]}"
            )

        return response.json()

    def projects(self):
        """
        List projects accessible by this token. Read-only metadata
        only - name, org, region, status, creation timestamp.
        """
        data = self._get("/v1/projects")

        results = []
        for item in data or []:
            results.append({
                "id": item.get("id"),
                "name": item.get("name"),
                "organization_id": item.get("organization_id"),
                "region": item.get("region"),
                "status": item.get("status"),
                "created_at": item.get("created_at"),
            })

        return results

    def branches(self, project_id: str):
        """
        Branches (Supabase preview branching) for a single project.
        Branching isn't enabled on every project, so a 4xx here just
        means "no branches" rather than a real failure.
        """
        try:
            data = self._get(f"/v1/projects/{project_id}/branches")
        except Exception:
            return []

        results = []
        for item in data or []:
            results.append({
                "id": item.get("id"),
                "project_id": project_id,
                "name": item.get("name"),
                "git_branch": item.get("git_branch"),
                "is_default": item.get("is_default"),
                "status": item.get("status"),
                "created_at": item.get("created_at"),
            })

        return results

    def logs(self):
        """
        Build the same "stats + buckets" shape RenderSyncService.logs()
        and NeonSyncService.logs() return, so the frontend can reuse
        the same dashboard pattern.
        """
        projects = self.projects()

        all_branches = []
        unhealthy_projects = []

        for project in projects:
            all_branches.extend(self.branches(project["id"]))

            if project.get("status") in PROBLEM_STATUSES:
                unhealthy_projects.append(project)

        stats = {
            "total_projects": len(projects),
            "total_branches": len(all_branches),
            "unhealthy_project_count": len(unhealthy_projects),
        }

        return {
            "stats": stats,
            "projects": projects,
            "branches": all_branches,
            "unhealthy_projects": unhealthy_projects,
        }
