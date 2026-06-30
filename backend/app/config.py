import os
from dotenv import load_dotenv

load_dotenv()


class Settings:
    GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
    VT_API_KEY = os.getenv("VT_API_KEY", "")
    ABUSEIPDB_API_KEY = os.getenv("ABUSEIPDB_API_KEY", "")
    OTX_API_KEY = os.getenv("OTX_API_KEY", "")
    # Single Auth-Key used for ALL abuse.ch services (URLhaus, MalwareBazaar,
    # ThreatFox) -- they switched to requiring this in 2025. Get one for free
    # at https://auth.abuse.ch/
    ABUSECH_API_KEY = os.getenv("ABUSECH_API_KEY", "")
    CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")


settings = Settings()
