from app.services.integrations.base import IntegrationProvider

from app.services.integrations.neon.auth import NeonAuthService
from app.services.integrations.neon.sync import NeonSyncService


class NeonProvider(IntegrationProvider):
    """
    Scope is intentionally limited to project/branch/operation metadata
    for security monitoring (failed operations, branch sprawl). This
    provider has no method that reads connection strings, roles, or
    database contents.
    """

    def __init__(self, api_key=None):
        self.api_key = api_key

    async def authenticate(self):
        return NeonAuthService.validate(self.api_key)

    async def validate(self):
        return NeonAuthService.validate(self.api_key)

    async def sync(self):
        service = NeonSyncService(self.api_key)

        return service.logs()

    async def disconnect(self):
        return True
