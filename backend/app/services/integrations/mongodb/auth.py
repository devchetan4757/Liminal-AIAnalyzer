import requests
from requests.auth import HTTPDigestAuth

ATLAS_BASE_URL = "https://cloud.mongodb.com/api/atlas/v2"
ATLAS_ACCEPT_HEADER = "application/vnd.atlas.2023-02-01+json"


class MongoDBAuthService:
    """
    Validates Atlas Admin API credentials.

    NOTE: The Atlas Admin API authenticates with a public/private API key
    pair over HTTP Digest Auth - it is NOT a single bearer token like
    GitHub. It also never exposes cluster data (documents/collections);
    it only manages project/cluster configuration and returns operational
    metadata such as events and logs. That's a hard boundary enforced by
    MongoDB itself, not something we have to police on our side.
    """

    @staticmethod
    def validate(public_key: str, private_key: str, group_id: str):
        if not public_key or not private_key or not group_id:
            raise Exception(
                "MongoDB Atlas requires a public key, private key, and project (group) ID."
            )

        try:
            response = requests.get(
                f"{ATLAS_BASE_URL}/groups/{group_id}",
                auth=HTTPDigestAuth(public_key, private_key),
                headers={"Accept": ATLAS_ACCEPT_HEADER},
                timeout=10,
            )
        except requests.RequestException as exc:
            raise Exception(f"Could not reach MongoDB Atlas: {exc}")

        if response.status_code == 401:
            raise Exception("Invalid MongoDB Atlas API key pair.")

        if response.status_code == 403:
            raise Exception(
                "MongoDB Atlas rejected the request - check that this key's "
                "IP access list includes this server, and that it has access "
                "to the given project."
            )

        if response.status_code == 404:
            raise Exception("MongoDB Atlas project (group) ID not found.")

        if response.status_code != 200:
            raise Exception(f"MongoDB Atlas validation failed ({response.status_code}).")

        data = response.json()

        return {
            "valid": True,
            "group_id": group_id,
            "project_name": data.get("name"),
        }
