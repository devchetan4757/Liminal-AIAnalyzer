"""
Shared validation for user-supplied environment variables across hosting
integrations (Render, Netlify, ...). Centralized here so every provider's
create-service/create-site endpoint enforces the same bounds instead of
each router reinventing - and potentially drifting from - its own limits.

The frontend's upload/paste parser (components/common/EnvVarsField.jsx)
only *shapes* whatever the user pasted or uploaded; it does not validate
it. These are the actual server-side guardrails.
"""
import re
from typing import List, Optional

from pydantic import BaseModel, field_validator

MAX_ENV_VARS = 100
MAX_ENV_KEY_LEN = 256
MAX_ENV_VALUE_LEN = 8192
ENV_KEY_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


class EnvVarItem(BaseModel):
    key: str
    value: str

    @field_validator("key")
    @classmethod
    def validate_key(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Environment variable key cannot be empty.")
        if len(v) > MAX_ENV_KEY_LEN:
            raise ValueError(f"Environment variable key must be {MAX_ENV_KEY_LEN} characters or fewer.")
        if not ENV_KEY_RE.match(v):
            raise ValueError(
                f"Invalid environment variable key '{v}': keys must start with a letter or "
                "underscore, and contain only letters, numbers, and underscores."
            )
        return v

    @field_validator("value")
    @classmethod
    def validate_value(cls, v: str) -> str:
        if len(v) > MAX_ENV_VALUE_LEN:
            raise ValueError(f"Environment variable value must be {MAX_ENV_VALUE_LEN} characters or fewer.")
        if any(ord(c) < 32 and c != "\t" for c in v):
            raise ValueError("Environment variable value contains invalid control characters.")
        return v


def validate_env_var_list(v: Optional[List[EnvVarItem]]) -> Optional[List[EnvVarItem]]:
    """
    List-level check: max count + no duplicate keys. Call this from a
    @field_validator on whichever request model embeds `env_vars`, e.g.:

        @field_validator("env_vars")
        @classmethod
        def _validate_env_vars(cls, v):
            return validate_env_var_list(v)
    """
    if not v:
        return v
    if len(v) > MAX_ENV_VARS:
        raise ValueError(f"A service can have at most {MAX_ENV_VARS} environment variables.")
    seen = set()
    for item in v:
        if item.key in seen:
            raise ValueError(f"Duplicate environment variable key: '{item.key}'.")
        seen.add(item.key)
    return v
