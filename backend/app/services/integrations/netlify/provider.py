from app.services.integrations.base import IntegrationProvider

from app.services.integrations.netlify.auth import NetlifyAuthService
from app.services.integrations.netlify.sync import NetlifySyncService


class NetlifyProvider(IntegrationProvider):
    """
    Scope is intentionally limited to site/deploy metadata for security
    monitoring (failed deploys, locked sites). This provider has no
    method that reads environment variable values.
    """

    def __init__(self, token=None):
        self.token = token

    async def authenticate(self):
        return NetlifyAuthService.validate(self.token)

    async def validate(self):
        return NetlifyAuthService.validate(self.token)

    async def sync(self):
        service = NetlifySyncService(self.token)

        return service.logs()

    async def disconnect(self):
        return True

    # Deliberate, user-initiated remote actions. Still no method here
    # (or in NetlifySyncService) that touches env vars - only site /
    # deploy lifecycle operations that Netlify's own dashboard exposes.
    # Names match the shared registry in app/services/remote_actions/registry.py.
    ACTIONS = {
        "redeploy": "trigger_deploy",
        "rollback": "restore_deploy",
        "cancel": "cancel_deploy",
        "suspend": "lock_site",
        "resume": "unlock_site",
    }

    async def execute_action(self, action: str, **kwargs):
        if action not in self.ACTIONS:
            raise ValueError(f"Unsupported Netlify action: {action}")

        service = NetlifySyncService(self.token)
        method = getattr(service, self.ACTIONS[action])

        return method(**kwargs)
