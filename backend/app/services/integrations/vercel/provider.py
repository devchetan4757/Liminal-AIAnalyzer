from app.services.integrations.base import IntegrationProvider

from app.services.integrations.vercel.auth import VercelAuthService
from app.services.integrations.vercel.sync import VercelSyncService


class VercelProvider(IntegrationProvider):
    """
    Scope is intentionally limited to project/deployment metadata for
    security monitoring (failed builds, canceled deploys). This
    provider has no method that reads environment variable values.
    """

    def __init__(self, api_key=None, team_id=None):
        self.api_key = api_key
        self.team_id = team_id

    async def authenticate(self):
        return VercelAuthService.validate(self.api_key, self.team_id)

    async def validate(self):
        return VercelAuthService.validate(self.api_key, self.team_id)

    async def sync(self):
        service = VercelSyncService(self.api_key, self.team_id)

        return service.logs()

    async def disconnect(self):
        return True

    # Deliberate, user-initiated remote actions. Still no method here
    # (or in VercelSyncService) that touches env vars - only deployment
    # lifecycle operations that Vercel's own dashboard exposes. Names
    # match the shared registry in app/services/remote_actions/registry.py.
    #
    # `service_id` is the generic resource-id kwarg the remote-actions
    # router always passes (see trigger_remote_action) - for Vercel it's
    # a deployment uid, not a service id like Render's.
    ACTIONS = {
        "redeploy": "redeploy",
        "cancel_deployment": "cancel_deployment",
        "promote": "promote",
        "delete_deployment": "delete_deployment",
    }

    async def execute_action(self, action: str, **kwargs):
        if action not in self.ACTIONS:
            raise ValueError(f"Unsupported Vercel action: {action}")

        service = VercelSyncService(self.api_key, self.team_id)
        method = getattr(service, self.ACTIONS[action])

        return method(**kwargs)
