from app.services.integrations.base import IntegrationProvider
from app.services.integrations.github.auth import GitHubAuthService
from app.services.integrations.github.sync import GitHubSyncService


class GitHubProvider(IntegrationProvider):

    def __init__(self, token=None):
        self.token = token

    async def authenticate(self):
        return GitHubAuthService.validate(self.token)

    async def validate(self):
        return GitHubAuthService.validate(self.token)

    async def sync(self):
        service = GitHubSyncService(self.token)

        return {
            "account": service.account(),
            "repositories": service.repositories(),
        }

    async def disconnect(self):
        return True
