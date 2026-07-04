from app.services.integrations.manager import IntegrationManager

from app.services.integrations.github.provider import GitHubProvider
from app.services.integrations.render.provider import RenderProvider
from app.services.integrations.neon.provider import NeonProvider
from app.services.integrations.uptimerobot.provider import UptimeRobotProvider
from app.services.integrations.mongodb.provider import MongoDBProvider


manager = IntegrationManager()


manager.register(
    "github",
    GitHubProvider
)

manager.register(
    "render",
    RenderProvider
)

manager.register(
    "neon",
    NeonProvider
)

manager.register(
    "uptimerobot",
    UptimeRobotProvider
)

manager.register(
    "mongodb",
    MongoDBProvider
)
