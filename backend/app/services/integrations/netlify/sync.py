import requests

NETLIFY_BASE_URL = "https://api.netlify.com/api/v1"

# Deploy states that represent a problem worth surfacing. Netlify's
# in-progress states (new/uploading/uploaded/processing/enqueued/building/
# deploying) aren't listed here - only terminal failure states are.
FAILED_STATES = {"error", "rejected"}

# States a deploy passes through before it's done - used to decide
# whether "cancel" is a sensible action to offer for it.
IN_PROGRESS_STATES = {
    "new", "enqueued", "building", "uploading", "uploaded",
    "processing", "processed", "preparing", "deploying",
}

# NOTE: this service intentionally has no method that reads a site's
# environment variables (GET /sites/{id}/env). That endpoint can return
# plaintext secret values and has no place in a security-monitoring
# integration - same boundary RenderSyncService and MongoDBSyncService
# draw around their own equivalents.


class NetlifySyncService:

    def __init__(self, token):
        self.headers = {
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
        }

    def _get(self, path: str, params: dict = None):
        response = requests.get(
            f"{NETLIFY_BASE_URL}{path}",
            headers=self.headers,
            params=params or {},
            timeout=20,
        )

        if response.status_code != 200:
            raise Exception(
                f"Netlify request to {path} failed ({response.status_code}): {response.text[:200]}"
            )

        return response.json()

    def _post(self, path: str, json_body: dict = None, ok_statuses=(200, 201, 202, 204)):
        response = requests.post(
            f"{NETLIFY_BASE_URL}{path}",
            headers=self.headers,
            json=json_body or {},
            timeout=20,
        )

        if response.status_code not in ok_statuses:
            raise Exception(
                f"Netlify request to {path} failed ({response.status_code}): {response.text[:200]}"
            )

        if response.status_code == 204 or not response.text:
            return {}

        return response.json()

    # -------------------------------------------------------------
    # Read-only sync
    # -------------------------------------------------------------

    def sites(self, limit: int = 100):
        """
        List sites owned/accessible by this token. Read-only metadata
        only - name, URL, repo linkage, current published deploy state.
        """
        data = self._get("/sites", params={"per_page": limit})

        results = []
        for site in data:
            published = site.get("published_deploy") or {}
            results.append({
                "id": site.get("id"),
                "name": site.get("name"),
                "url": site.get("ssl_url") or site.get("url"),
                "admin_url": site.get("admin_url"),
                "repo": (site.get("build_settings") or {}).get("repo_path"),
                "branch": (site.get("build_settings") or {}).get("repo_branch"),
                "locked": bool(site.get("published_deploy", {}).get("locked")) or bool(site.get("build_settings", {}).get("stop_builds")),
                "published_deploy_state": published.get("state"),
                "created_at": site.get("created_at"),
                "updated_at": site.get("updated_at"),
            })

        return results

    def deploys(self, site_id: str, limit: int = 10):
        """Recent deploys for a single site - state, branch, commit, error."""
        data = self._get(f"/sites/{site_id}/deploys", params={"per_page": limit})

        results = []
        for dep in data:
            results.append({
                "id": dep.get("id"),
                "state": dep.get("state"),
                "branch": dep.get("branch"),
                "commit_ref": dep.get("commit_ref"),
                "created_at": dep.get("created_at"),
                "updated_at": dep.get("updated_at"),
                "deploy_time": dep.get("deploy_time"),
                "error_message": dep.get("error_message"),
                "deploy_url": dep.get("deploy_ssl_url") or dep.get("deploy_url"),
            })

        return results

    def logs(self):
        """
        Build the same "stats + buckets" shape RenderSyncService.logs()
        returns, so the frontend can reuse the same dashboard pattern.
        """
        sites = self.sites()

        failed_deploys = []
        recent_deploys = []
        locked_sites = []

        for site in sites:
            if site.get("locked"):
                locked_sites.append(site)

            try:
                deploys = self.deploys(site["id"], limit=5)
            except Exception:
                # Don't let one bad site (e.g. no deploy history yet)
                # take down the whole sync.
                continue

            for deploy in deploys:
                enriched = {**deploy, "site_id": site["id"], "site_name": site["name"]}
                recent_deploys.append(enriched)

                if deploy.get("state") in FAILED_STATES:
                    failed_deploys.append(enriched)

        recent_deploys.sort(key=lambda d: d.get("created_at") or "", reverse=True)
        recent_deploys = recent_deploys[:50]

        stats = {
            "total_sites": len(sites),
            "locked_count": len(locked_sites),
            "failed_deploy_count": len(failed_deploys),
            "recent_deploy_count": len(recent_deploys),
        }

        return {
            "stats": stats,
            "sites": sites,
            "recent_deploys": recent_deploys,
            "failed_deploys": failed_deploys,
            "locked_sites": locked_sites,
        }

    # -------------------------------------------------------------
    # Actions (mutating). Each is a deliberate, user-initiated remote
    # operation - not part of the passive sync/logs() path. Still
    # scoped the same way as read: site/deploy lifecycle only, never
    # env vars or secrets.
    # -------------------------------------------------------------

    def trigger_deploy(self, site_id: str):
        """Kick off a new build/deploy for a site from its linked repo."""
        dep = self._post(f"/sites/{site_id}/builds")
        return {
            "id": dep.get("deploy_id") or dep.get("id"),
            "status": "requested",
        }

    def restore_deploy(self, site_id: str, deploy_id: str):
        """
        Publish a previous deploy as the live one - Netlify's equivalent
        of Render's rollback.
        """
        dep = self._post(f"/sites/{site_id}/deploys/{deploy_id}/restore")
        return {
            "id": dep.get("id") or deploy_id,
            "status": dep.get("state") or "requested",
            "rolled_back_to": deploy_id,
        }

    def cancel_deploy(self, deploy_id: str):
        """Cancel a deploy that's currently building/uploading/processing."""
        self._post(f"/deploys/{deploy_id}/cancel")
        return {"id": deploy_id, "status": "canceled"}

    def lock_site(self, site_id: str):
        """
        Lock a site - stops new deploys from publishing automatically.
        Netlify's equivalent of Render's suspend; the site itself keeps
        serving its last published deploy.
        """
        self._post(f"/sites/{site_id}/lock")
        return {"id": site_id, "locked": True}

    def unlock_site(self, site_id: str):
        """Unlock a previously locked site."""
        self._post(f"/sites/{site_id}/unlock")
        return {"id": site_id, "locked": False}

    def list_accounts(self):
        """
        Teams/accounts this token can create sites under - needed up
        front for create_site(), same role as RenderSyncService.list_owners().
        """
        data = self._get("/accounts")
        return [
            {
                "id": acct.get("id"),
                "slug": acct.get("slug"),
                "name": acct.get("name"),
                "type": acct.get("type"),
            }
            for acct in data
        ]

    def create_site(self, payload: dict):
        """
        Create a new site linked to a repo.

        Deliberately has no env var field in the request body even
        though Netlify's create-site API accepts one - same boundary as
        the rest of this file: this integration never sets or reads
        secret values, only lifecycle/build config that isn't sensitive
        on its own (build command, publish directory, branch).
        """
        body = {
            "name": payload.get("name") or None,
            "repo": {
                "provider": payload.get("repo_provider") or "github",
                "repo": payload["repo"],
                "branch": payload.get("branch") or "main",
                "cmd": payload.get("build_command") or "",
                "dir": payload.get("publish_dir") or "",
            },
        }

        account_slug = payload.get("account_slug")
        path = f"/{account_slug}/sites" if account_slug else "/sites"

        site = self._post(path, json_body=body, ok_statuses=(200, 201))
        return {
            "id": site.get("id"),
            "name": site.get("name"),
            "url": site.get("ssl_url") or site.get("url"),
            "admin_url": site.get("admin_url"),
        }
