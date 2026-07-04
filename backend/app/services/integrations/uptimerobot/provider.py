from app.services.integrations.base import IntegrationProvider

from app.services.integrations.uptimerobot.auth import UptimeRobotAuthService
from app.services.integrations.uptimerobot.sync import UptimeRobotSyncService


class UptimeRobotProvider(IntegrationProvider):
    """
    Scope is intentionally limited to monitor status and up/down/paused
    event history for uptime monitoring. This provider has no method
    that creates, edits, deletes, or pauses a monitor - read only.
    """

    def __init__(self, api_key=None):
        self.api_key = api_key

    async def authenticate(self):
        return UptimeRobotAuthService.validate(self.api_key)

    async def validate(self):
        return UptimeRobotAuthService.validate(self.api_key)

    async def sync(self):
        service = UptimeRobotSyncService(self.api_key)

        return service.logs()

    async def disconnect(self):
        return True
