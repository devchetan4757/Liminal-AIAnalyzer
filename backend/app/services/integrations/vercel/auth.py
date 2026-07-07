import requests

VERCEL_BASE_URL = "https://api.vercel.com"


class VercelAuthService:
    """
    Validates a Vercel Access Token.

    Vercel uses a single Bearer token (Account Settings -> Tokens), same
    shape as Render's API key. An optional team_id scopes every request
    to a team instead of the token owner's personal account - same role
    Render's ownerId plays. Validation only confirms the token against
    /v2/user (or /v2/teams/{id} when a team is given) - it never touches
    projects, deployments, or env vars during validation.
    """

    @staticmethod
    def validate(api_key: str, team_id: str = None):
        if not api_key:
            raise Exception("A Vercel access token is required.")

        headers = {
            "Authorization": f"Bearer {api_key}",
            "Accept": "application/json",
        }

        try:
            if team_id:
                response = requests.get(
                    f"{VERCEL_BASE_URL}/v2/teams/{team_id}",
                    headers=headers,
                    timeout=10,
                )
            else:
                response = requests.get(
                    f"{VERCEL_BASE_URL}/v2/user",
                    headers=headers,
                    timeout=10,
                )
        except requests.RequestException as exc:
            raise Exception(f"Could not reach Vercel: {exc}")

        if response.status_code == 401 or response.status_code == 403:
            raise Exception("Invalid Vercel access token (or no access to that team).")

        if response.status_code != 200:
            raise Exception(f"Vercel validation failed ({response.status_code}).")

        data = response.json()

        if team_id:
            return {
                "valid": True,
                "owner_id": data.get("id"),
                "owner_name": data.get("name") or data.get("slug"),
                "owner_email": None,
            }

        user = data.get("user", data)
        return {
            "valid": True,
            "owner_id": user.get("id"),
            "owner_name": user.get("name") or user.get("username"),
            "owner_email": user.get("email"),
        }
