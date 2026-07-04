import requests

NEON_BASE_URL = "https://console.neon.tech/api/v2"


class NeonAuthService:
    """
    Validates a Neon API key.

    Neon uses a single Bearer API key (Account Settings -> API Keys),
    the same shape as Render's token. Validation just confirms the key
    against /v2/projects - it never touches connection strings, roles,
    or database contents during validation.
    """

    @staticmethod
    def validate(api_key: str):
        if not api_key:
            raise Exception("A Neon API key is required.")

        try:
            response = requests.get(
                f"{NEON_BASE_URL}/projects",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Accept": "application/json",
                },
                params={"limit": 1},
                timeout=10,
            )
        except requests.RequestException as exc:
            raise Exception(f"Could not reach Neon: {exc}")

        if response.status_code == 401:
            raise Exception("Invalid Neon API key.")

        if response.status_code != 200:
            raise Exception(f"Neon validation failed ({response.status_code}).")

        data = response.json()
        projects = data.get("projects", [])

        return {
            "valid": True,
            "project_count": len(projects),
        }
