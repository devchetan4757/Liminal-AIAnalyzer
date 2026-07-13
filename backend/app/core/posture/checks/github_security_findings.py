"""GitHub posture check.

Important: GitHubSyncService already has a `security_scan()` method
(see services/integrations/github/sync.py) that pulls secret-scanning
alerts, Dependabot alerts, recent .env-looking commits, and repos
missing a .gitignore. That's exactly the raw data a posture check
needs -- so this check is a thin wrapper that turns that existing
output into SecurityFinding-shaped dicts, rather than re-implementing
GitHub API calls that already exist in the codebase.

This is also why there's no separate github_secret_scan.py /
github_dependency_cve.py / OSV client in this drop: the data source
they'd both hit is already covered by security_scan(). If you want a
second opinion beyond GitHub's own advisory DB, OSV.dev is still worth
wiring in later (see the design doc), but it'd be additive, not the
only source.
"""
from typing import Optional

from sqlalchemy.orm import Session

from app.core.posture.base import PostureCheck
from app.core.posture.registry import register
from app.services.integrations.github.sync import GitHubSyncService

_DEP_SEVERITY_MAP = {
    "critical": "critical",
    "high": "high",
    "moderate": "medium",
    "low": "low",
}


@register
class GitHubSecretExposureCheck(PostureCheck):
    id = "github_secret_exposure"
    category = "secret_leak"
    severity = "critical"
    applies_to = "github"

    async def run(self, integration, credential: Optional[str], db: Session) -> list[dict]:
        service = GitHubSyncService(credential)
        scan = service.security_scan()

        findings = []

        for alert in scan.get("secret_alerts", []):
            findings.append(
                self.finding(
                    title=f"Open secret-scanning alert in {alert['repo']}: {alert['secret_type']}",
                    detail=alert,
                    severity="critical",
                )
            )

        for push in scan.get("env_pushes", []):
            findings.append(
                self.finding(
                    title=f"Sensitive-looking file pushed to {push['repo']} ({', '.join(push['files'])})",
                    detail=push,
                    severity="high",
                )
            )

        return findings


@register
class GitHubDependencyVulnCheck(PostureCheck):
    id = "github_dependency_vulnerability"
    category = "vuln_dependency"
    severity = "medium"
    applies_to = "github"

    async def run(self, integration, credential: Optional[str], db: Session) -> list[dict]:
        service = GitHubSyncService(credential)
        scan = service.security_scan()

        findings = []
        for alert in scan.get("dep_alerts", []):
            severity = _DEP_SEVERITY_MAP.get((alert.get("severity") or "").lower(), "low")
            findings.append(
                self.finding(
                    title=f"{alert.get('package', 'dependency')} in {alert['repo']}: {alert.get('summary', 'known vulnerability')}",
                    detail=alert,
                    severity=severity,
                )
            )

        return findings


@register
class GitHubExposedRepoCheck(PostureCheck):
    id = "github_exposed_repo_missing_gitignore"
    category = "misconfig"
    severity = "low"
    applies_to = "github"

    async def run(self, integration, credential: Optional[str], db: Session) -> list[dict]:
        service = GitHubSyncService(credential)
        scan = service.security_scan()

        findings = []
        for repo in scan.get("exposed_repos", []):
            findings.append(
                self.finding(
                    title=f"Public repo {repo['full_name']} has no .gitignore -- higher risk of accidental commits",
                    detail=repo,
                )
            )

        return findings
