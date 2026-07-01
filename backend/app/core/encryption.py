from dotenv import load_dotenv
import os
from cryptography.fernet import Fernet

load_dotenv()

FERNET_KEY = os.getenv("FERNET_KEY")

if not FERNET_KEY:
    raise ValueError("FERNET_KEY environment variable is not set.")

cipher = Fernet(FERNET_KEY.encode())


def encrypt(text: str) -> str:
    return cipher.encrypt(text.encode()).decode()


def decrypt(token: str) -> str:
    return cipher.decrypt(token.encode()).decode()
