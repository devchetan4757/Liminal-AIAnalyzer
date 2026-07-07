from app.services.integrations.manager import IntegrationManager

from app.services.integrations.github.provider import GitHubProvider
from app.services.integrations.render.provider import RenderProvider
from app.services.integrations.neon.provider import NeonProvider
from app.services.integrations.uptimerobot.provider import UptimeRobotProvider
from app.services.integrations.mongodb.provider import MongoDBProvider
from app.services.integrations.netlify.provider import NetlifyProvider
from app.services.integrations.vercel.provider import VercelProvider
from app.services.integrations.supabase.provider import SupabaseProvider


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

manager.register(
    "netlify",
    NetlifyProvider
)

manager.register(
    "vercel",
    VercelProvider
)

manager.register(
    "supabase",
    SupabaseProvider
)
