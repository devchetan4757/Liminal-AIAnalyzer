from app.services.integrations.base import IntegrationProvider

from app.services.integrations.supabase.auth import SupabaseAuthService
from app.services.integrations.supabase.sync import SupabaseSyncService


class SupabaseProvider(IntegrationProvider):
    """
    Scope is intentionally limited to project/branch metadata for
    security monitoring (unhealthy projects, branch sprawl). This
    provider has no method that reads connection strings, service-role
    keys, or database contents.
    """

    def __init__(self, api_key=None):
        self.api_key = api_key

    async def authenticate(self):
        return SupabaseAuthService.validate(self.api_key)

    async def validate(self):
        return SupabaseAuthService.validate(self.api_key)

    async def sync(self):
        service = SupabaseSyncService(self.api_key)

        return service.logs()

    async def disconnect(self):
        return True
