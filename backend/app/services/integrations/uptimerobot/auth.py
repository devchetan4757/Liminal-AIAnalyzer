import requests

UPTIMEROBOT_BASE_URL = "https://api.uptimerobot.com/v3"


class UptimeRobotAuthService:
    """
    Authenticate using the new UptimeRobot v3 REST API.
    """

    @staticmethod
    def validate(api_key: str):
        if not api_key:
            raise Exception("An UptimeRobot API key is required.")

        headers = {
            "Authorization": f"Bearer {api_key}",
            "Accept": "application/json",
        }

        try:
            response = requests.get(
                f"{UPTIMEROBOT_BASE_URL}/user/me",
                headers=headers,
                timeout=10,
            )
        except requests.RequestException as exc:
            raise Exception(f"Could not reach UptimeRobot: {exc}")

        if response.status_code == 401:
            raise Exception("Invalid UptimeRobot API key.")

        if response.status_code == 403:
            raise Exception("You are not allowed to access this resource.")

        if response.status_code >= 400:
            raise Exception(
                f"UptimeRobot validation failed ({response.status_code}): {response.text}"
            )

        account = response.json()

        subscription = account.get("activeSubscription", {})

        return {
            "valid": True,
            "email": account.get("email"),
            "plan": subscription.get("plan"),
            "monitor_limit": account.get("monitorLimit"),
            "monitors_count": account.get("monitorsCount"),
        }
