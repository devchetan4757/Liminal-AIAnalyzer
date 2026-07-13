"""Provider -> posture check registry.

Same pattern as app.core.plugins.registry / services.remote_actions.registry --
checks self-register via the @register decorator when their module is
imported (see checks/__init__.py, which imports every check module so
this file never needs a hardcoded list to keep in sync).
"""
from app.core.posture.base import PostureCheck

_CHECKS: list[PostureCheck] = []


def register(check_cls):
    """Class decorator -- instantiates and adds the check to the registry.

    Usage:
        @register
        class MyCheck(PostureCheck):
            ...
    """
    _CHECKS.append(check_cls())
    return check_cls


def get_checks_for_provider(provider: str) -> list[PostureCheck]:
    """Every check that applies to this provider: exact-provider checks
    plus any "*" (runs-for-everything) checks.
    """
    return [c for c in _CHECKS if c.applies_to == provider or c.applies_to == "*"]


def all_checks() -> list[PostureCheck]:
    return list(_CHECKS)
