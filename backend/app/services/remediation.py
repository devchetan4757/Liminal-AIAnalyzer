"""Static, human-reviewed remediation playbooks + classification heuristics.

Only providers/categories we're confident about get a verified playbook here.
Everything else falls through to an AI best-effort suggestion (see
app.core.llm.suggest_remediation), which the frontend always labels as a
suggestion rather than verified instructions.
"""

PLAYBOOKS: dict[tuple[str, str], list[str]] = {
    ("render", "failed_deploy"): [
        "Open the failed deploy's build logs in Render and find the first error line.",
        "If it's a dependency error, confirm the lockfile/manifest was committed and matches your build command.",
        "If it's an environment variable error, check the service's Environment tab for missing/incorrect values.",
        "Re-run the deploy after fixing the underlying issue (manual deploy or new commit).",
        "If the previous deploy was healthy, consider rolling back to it while you investigate.",
    ],
    ("render", "suspended_service"): [
        "Check the Render billing page for a failed payment or unpaid invoice.",
        "Confirm the service wasn't manually suspended by a teammate.",
        "Resume the service from the Render dashboard once the underlying cause is resolved.",
        "Watch the next deploy closely in case the suspension was masking another issue.",
    ],
    ("uptimerobot", "down"): [
        "Check whether the underlying host/service is actually reachable from a browser or curl.",
        "Look for a recent deploy, config change, or expired certificate around the time it went down.",
        "Check the hosting provider's status page for an outage affecting your region.",
        "Once restored, verify UptimeRobot shows the monitor back to 'up' on its next check.",
    ],
    ("neon", "failed_operation"): [
        "Open the failed operation's details in the Neon console for the specific error message.",
        "If it's a compute/branch operation, check current usage against your plan's limits.",
        "If it's a migration-related operation, verify the query/schema change is valid against the current branch state.",
        "Retry the operation once the underlying cause is addressed.",
    ],
    ("github", "secret_leak"): [
        "Revoke/rotate the exposed credential immediately at its provider.",
        "Remove the secret from the codebase and add it to .gitignore or a secrets manager instead.",
        "If it was committed to git history, scrub it from history (e.g. git filter-repo) since revocation alone doesn't remove it from old commits.",
        "Re-scan the repo to confirm the finding is resolved.",
    ],
    ("github", "vulnerable_dependency"): [
        "Check the advisory for the affected package/version and the patched version.",
        "Upgrade the dependency to the patched version (or a later compatible one).",
        "Re-run your test suite after upgrading to catch any breaking changes.",
        "Re-scan the repo to confirm the finding clears.",
    ],
}


def get_playbook(provider: str, category: str) -> list[str] | None:
    return PLAYBOOKS.get((provider, category))


def classify(provider: str, resource_type: str, raw: dict) -> str | None:
    """Cheap heuristic mapping a raw item to one of the categories above.

    Returns None if we don't have (or can't confidently pick) a category --
    the caller should fall back to an AI-only best-effort suggestion.
    """
    raw = raw or {}

    if provider == "render":
        if resource_type == "deploy":
            status = (raw.get("status") or "").lower()
            if status in ("build_failed", "update_failed"):
                return "failed_deploy"
            return None
        if resource_type == "service":
            suspended = raw.get("suspended")
            if suspended and suspended != "not_suspended":
                return "suspended_service"
            return None
        return None

    if provider == "uptimerobot" and resource_type == "monitor":
        status = (raw.get("status") or "").lower()
        if status in ("down", "seems_down"):
            return "down"
        return None

    if provider == "neon" and resource_type == "operation":
        status = (raw.get("status") or "").lower()
        if status == "failed":
            return "failed_operation"
        return None

    if provider == "github":
        if resource_type == "secret_leak":
            return "secret_leak"
        if resource_type == "vulnerable_dependency":
            return "vulnerable_dependency"
        return None

    # mongodb and anything else: too varied for a safe generic playbook,
    # always fall through to AI-only.
    return None
