"""
Single source of truth for which remote (mutating) actions exist, what
provider resource they act on, and their risk tier.

Both the router (app/routers/remote_actions.py) and the frontend (via
GET /api/remote-actions/registry) key off this — no provider module and
no frontend button decides risk tier independently. See
REMOTE_ACTIONS_PLAN.md section 1 and section 6, rule 1.

Render and UptimeRobot are wired up so far. Adding a provider/action
here is the only place that should ever need to change to extend
coverage - see REMOTE_ACTIONS_PLAN.md section 6, rule 6 before adding
anything new.

risk_tier drives the (future) auto-remediate rule: only "low" tier
actions may ever run unattended. "medium" and "high" always require a
human to click confirm - there is intentionally no code path in this
pass that lets those run without one (see PLAN section 3).
"""

ACTIONS = {
    ("render", "redeploy"): {
        "label": "Redeploy latest commit",
        "consequence": "Triggers a new deploy of the current branch head. The service rebuilds and briefly restarts.",
        "risk_tier": "medium",
        "resource_type": "service",
        "requires": [],
    },
    ("render", "rollback"): {
        "label": "Rollback to previous deploy",
        "consequence": "Reverts the service to a previously successful deploy.",
        "risk_tier": "medium",
        "resource_type": "service",
        "requires": ["deploy_id"],
    },
    ("render", "resume"): {
        "label": "Resume service",
        "consequence": "Resumes a suspended service so it starts serving traffic again.",
        "risk_tier": "low",
        "resource_type": "service",
        "requires": [],
    },
    ("render", "suspend"): {
        "label": "Suspend service",
        "consequence": "Stops the service from serving traffic or running at all, until resumed.",
        "risk_tier": "high",
        "resource_type": "service",
        "requires": [],
    },
    ("uptimerobot", "pause"): {
        "label": "Pause monitor",
        "consequence": "Stops UptimeRobot from checking this monitor until it's resumed. No alerts will fire while paused.",
        "risk_tier": "low",
        "resource_type": "monitor",
        "requires": [],
    },
    ("uptimerobot", "resume"): {
        "label": "Resume monitor",
        "consequence": "Starts checks again on a paused monitor.",
        "risk_tier": "low",
        "resource_type": "monitor",
        "requires": [],
    },
    ("uptimerobot", "reset"): {
        "label": "Reset monitor stats",
        "consequence": "Permanently erases this monitor's uptime ratio, response-time history, and past up/down logs. The monitor itself is not deleted and checks continue. Cannot be undone.",
        "risk_tier": "high",
        "resource_type": "monitor",
        "requires": [],
    },
    ("uptimerobot", "delete"): {
        "label": "Delete monitor",
        "consequence": "Permanently deletes this monitor and all of its history. Cannot be undone.",
        "risk_tier": "high",
        "resource_type": "monitor",
        "requires": [],
    },
}


def get_action(provider: str, action: str):
    return ACTIONS.get((provider, action))


def list_actions(provider: str = None):
    items = []
    for (p, a), meta in ACTIONS.items():
        if provider and p != provider:
            continue
        items.append({"provider": p, "action": a, **meta})
    return items
