import requests

NETLIFY_BASE_URL = "https://api.netlify.com/api/v1"


class NetlifyAuthService:
    """
    Validates a Netlify Personal Access Token.

    Netlify uses a single Bearer token (User Settings -> Applications ->
    Personal access tokens), same shape as Render's API key. Validation
    just confirms the token against /user - it never touches sites,
    deploys, or env vars during validation.
    """

    @staticmethod
    def validate(token: str):
        if not token:
            raise Exception("A Netlify personal access token is required.")

        try:
            response = requests.get(
                f"{NETLIFY_BASE_URL}/user",
                headers={
                    "Authorization": f"Bearer {token}",
                    "Accept": "application/json",
                },
                timeout=10,
            )
        except requests.RequestException as exc:
            raise Exception(f"Could not reach Netlify: {exc}")

        if response.status_code == 401:
            raise Exception("Invalid Netlify access token.")

        if response.status_code != 200:
            raise Exception(f"Netlify validation failed ({response.status_code}).")

        data = response.json()

        return {
            "valid": True,
            "user_id": data.get("id"),
            "user_email": data.get("email"),
            "user_name": data.get("full_name"),
        }
