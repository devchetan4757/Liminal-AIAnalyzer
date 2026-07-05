from app.services.integrations.base import IntegrationProvider

from app.services.integrations.uptimerobot.auth import UptimeRobotAuthService
from app.services.integrations.uptimerobot.sync import UptimeRobotSyncService


class UptimeRobotProvider(IntegrationProvider):
    """
    Read side is monitor status and up/down/paused event history for
    uptime monitoring. This provider's ACTIONS map (and execute_action
    below) covers only the one-click lifecycle actions on a monitor
    that already exists - pause, resume, reset stats, delete - since
    those are what the generic, registry-driven remote-actions router
    (app/routers/remote_actions.py) is built for.

    Monitor create/edit are settings-form operations, not one-click
    actions, so they deliberately don't go through execute_action here -
    see app/routers/uptimerobot.py for their dedicated routes and
    UptimeRobotSyncService.create_monitor / update_monitor / get_monitor
    for the API calls.
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

    # Deliberate, user-initiated remote actions. Names match the
    # shared registry in app/services/remote_actions/registry.py.
    # The generic remote-actions router always calls execute_action
    # with a "service_id" kwarg (that name comes from the Render
    # integration this pattern was first built for) - accept it here
    # too and treat it as the monitor id, rather than changing the
    # shared router just for this provider's naming.
    ACTIONS = {
        "pause": "pause_monitor",
        "resume": "resume_monitor",
        "reset": "reset_monitor",
        "delete": "delete_monitor",
    }

    async def execute_action(self, action: str, service_id: str = None, monitor_id: str = None, **kwargs):
        if action not in self.ACTIONS:
            raise ValueError(f"Unsupported UptimeRobot action: {action}")

        resolved_monitor_id = monitor_id or service_id
        if not resolved_monitor_id:
            raise ValueError("A monitor id is required for this action.")

        service = UptimeRobotSyncService(self.api_key)
        method = getattr(service, self.ACTIONS[action])

        return method(resolved_monitor_id)
