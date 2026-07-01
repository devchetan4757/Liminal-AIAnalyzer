from abc import ABC, abstractmethod


class IntegrationProvider(ABC):

    @abstractmethod
    async def authenticate(self):
        ...

    @abstractmethod
    async def validate(self):
        ...

    @abstractmethod
    async def sync(self):
        ...

    @abstractmethod
    async def disconnect(self):
        ...
