from app.services.integrations.base import IntegrationProvider

from app.services.integrations.mongodb.auth import MongoDBAuthService
from app.services.integrations.mongodb.sync import MongoDBSyncService


class MongoDBProvider(IntegrationProvider):
    """
    Scope is intentionally limited to Atlas project logs/events for
    security analysis. This provider has no method that reads cluster
    data - only the Atlas Admin API's event feed, which is metadata only.
    """

    def __init__(self, public_key=None, private_key=None, group_id=None):
        self.public_key = public_key
        self.private_key = private_key
        self.group_id = group_id

    async def authenticate(self):
        return MongoDBAuthService.validate(
            self.public_key, self.private_key, self.group_id
        )

    async def validate(self):
        return MongoDBAuthService.validate(
            self.public_key, self.private_key, self.group_id
        )

    async def sync(self):
        service = MongoDBSyncService(
            self.public_key, self.private_key, self.group_id
        )

        return {
            "logs": service.logs()
        }

    async def disconnect(self):
        return True
