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
    ("render", "cancel_deploy"): {
        "label": "Cancel in-progress deploy",
        "consequence": "Stops this deploy before it finishes. The service keeps running whatever version it was on before.",
        "risk_tier": "low",
        "resource_type": "deploy",
        "requires": ["deploy_id"],
    },
    ("render", "delete"): {
        "label": "Delete service",
        "consequence": "Permanently deletes this service and its deploy history. Cannot be undone.",
        "risk_tier": "high",
        "resource_type": "service",
        "requires": [],
    },
    ("render", "run_job"): {
        "label": "Run one-off job",
        "consequence": "Runs the given shell command against this service's current deploy environment, without changing what's already running.",
        "risk_tier": "medium",
        "resource_type": "service",
        "requires": ["start_command"],
    },
    ("render", "restart"): {
        "label": "Restart service",
        "consequence": "Restarts the running instance(s) without a new deploy. Brief interruption while it comes back up.",
        "risk_tier": "medium",
        "resource_type": "service",
        "requires": [],
    },
    ("render", "scale"): {
        "label": "Scale service",
        "consequence": "Changes the number of running instances. Scaling to 0 stops the service from serving traffic.",
        "risk_tier": "medium",
        "resource_type": "service",
        "requires": ["num_instances"],
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
    ("netlify", "redeploy"): {
        "label": "Redeploy latest commit",
        "consequence": "Triggers a new build/deploy from the site's linked repo.",
        "risk_tier": "medium",
        "resource_type": "site",
        "requires": [],
    },
    ("netlify", "rollback"): {
        "label": "Restore a previous deploy",
        "consequence": "Publishes a previous deploy as the live site, replacing whatever is currently published.",
        "risk_tier": "medium",
        "resource_type": "site",
        "requires": ["deploy_id"],
    },
    ("netlify", "cancel"): {
        "label": "Cancel in-progress deploy",
        "consequence": "Stops this deploy before it finishes. The site keeps serving whatever was published before.",
        "risk_tier": "low",
        "resource_type": "deploy",
        "requires": ["deploy_id"],
    },
    ("netlify", "suspend"): {
        "label": "Lock site",
        "consequence": "Stops new deploys from publishing automatically, until unlocked. The site keeps serving its last published deploy.",
        "risk_tier": "high",
        "resource_type": "site",
        "requires": [],
    },
    ("netlify", "resume"): {
        "label": "Unlock site",
        "consequence": "Allows deploys to publish automatically again on a locked site.",
        "risk_tier": "low",
        "resource_type": "site",
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
