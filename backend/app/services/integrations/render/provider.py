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
