from app.services.integrations.base import IntegrationProvider


class RenderProvider(IntegrationProvider):

    async def authenticate(self):
        pass

    async def validate(self):
        pass

    async def sync(self):
        pass

    async def disconnect(self):
        pass
