import requests

SUPABASE_BASE_URL = "https://api.supabase.com"


class SupabaseAuthService:
    """
    Validates a Supabase personal access token.

    Supabase uses a single Bearer token (Account -> Access Tokens),
    the same shape as Neon's and Render's API keys. Validation just
    confirms the token against /v1/organizations - it never touches
    project database contents, connection strings, or service-role
    keys during validation.
    """

    @staticmethod
    def validate(api_key: str):
        if not api_key:
            raise Exception("A Supabase access token is required.")

        try:
            response = requests.get(
                f"{SUPABASE_BASE_URL}/v1/organizations",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Accept": "application/json",
                },
                timeout=10,
            )
        except requests.RequestException as exc:
            raise Exception(f"Could not reach Supabase: {exc}")

        if response.status_code == 401:
            raise Exception("Invalid Supabase access token.")

        if response.status_code != 200:
            raise Exception(f"Supabase validation failed ({response.status_code}).")

        organizations = response.json()

        return {
            "valid": True,
            "organization_count": len(organizations) if isinstance(organizations, list) else None,
        }
