from app.services.integrations.base import IntegrationProvider

from app.services.integrations.render.auth import RenderAuthService
from app.services.integrations.render.sync import RenderSyncService


class RenderProvider(IntegrationProvider):
    """
    Scope is intentionally limited to service/deploy metadata for
    security monitoring (failed deploys, suspended services). This
    provider has no method that reads environment variable values.
    """

    def __init__(self, api_key=None):
        self.api_key = api_key

    async def authenticate(self):
        return RenderAuthService.validate(self.api_key)

    async def validate(self):
        return RenderAuthService.validate(self.api_key)

    async def sync(self):
        service = RenderSyncService(self.api_key)

        return service.logs()

    async def disconnect(self):
        return True

    # Deliberate, user-initiated remote actions. Still no method here
    # (or in RenderSyncService) that touches env vars - only service /
    # deploy lifecycle operations that Render's own dashboard exposes.
    # Names match the shared registry in app/services/remote_actions/registry.py.
    ACTIONS = {
        "redeploy": "trigger_deploy",
        "rollback": "rollback",
        "suspend": "suspend_service",
        "resume": "resume_service",
    }

    async def execute_action(self, action: str, **kwargs):
        if action not in self.ACTIONS:
            raise ValueError(f"Unsupported Render action: {action}")

        service = RenderSyncService(self.api_key)
        method = getattr(service, self.ACTIONS[action])

        return method(**kwargs)
