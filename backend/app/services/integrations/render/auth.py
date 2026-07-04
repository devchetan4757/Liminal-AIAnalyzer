import requests

RENDER_BASE_URL = "https://api.render.com/v1"


class RenderAuthService:
    """
    Validates a Render API key.

    Render uses a single Bearer API key (Account Settings -> API Keys),
    unlike GitHub's scoped token or MongoDB's public/private key pair.
    Validation just confirms the key against /v1/owners - it never
    touches services, deploys, or env vars during validation.
    """

    @staticmethod
    def validate(api_key: str):
        if not api_key:
            raise Exception("A Render API key is required.")

        try:
            response = requests.get(
                f"{RENDER_BASE_URL}/owners",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Accept": "application/json",
                },
                params={"limit": 1},
                timeout=10,
            )
        except requests.RequestException as exc:
            raise Exception(f"Could not reach Render: {exc}")

        if response.status_code == 401:
            raise Exception("Invalid Render API key.")

        if response.status_code != 200:
            raise Exception(f"Render validation failed ({response.status_code}).")

        data = response.json()
        owner = None
        if data:
            first = data[0]
            owner = first.get("owner", first)

        return {
            "valid": True,
            "owner_id": owner.get("id") if owner else None,
            "owner_name": owner.get("name") if owner else None,
            "owner_email": owner.get("email") if owner else None,
        }
