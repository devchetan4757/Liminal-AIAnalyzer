import hashlib
import re

IP_RE = re.compile(r"^(\d{1,3}\.){3}\d{1,3}$")
URL_RE = re.compile(r"^https?://", re.I)
DOMAIN_RE = re.compile(r"^([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$")
HASH_RE = re.compile(r"^[a-fA-F0-9]{32}$|^[a-fA-F0-9]{40}$|^[a-fA-F0-9]{64}$")


def detect_indicator(text: str):
    """Return (indicator_type, cleaned_value) or (None, None) if it's just a question."""
    candidate = text.strip()

    if HASH_RE.match(candidate):
        return "hash", candidate
    if URL_RE.match(candidate):
        return "url", candidate
    if IP_RE.match(candidate):
        return "ip", candidate
    if DOMAIN_RE.match(candidate) and " " not in candidate:
        return "domain", candidate
    return None, None


def sha256_of_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()
