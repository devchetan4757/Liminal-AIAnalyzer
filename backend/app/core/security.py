"""
Password hashing for account login. Uses PBKDF2-HMAC-SHA256 from the
stdlib `hashlib` - no bcrypt/passlib dependency needed since neither is
in requirements.txt today. This is the same algorithm family Django
uses by default and is fine for this app's threat model.

Stored format: "pbkdf2_sha256$<iterations>$<salt_hex>$<hash_hex>"
The iteration count is embedded so it can be raised later without
invalidating already-hashed passwords.
"""
import hashlib
import hmac
import os

ALGORITHM = "pbkdf2_sha256"
ITERATIONS = 260_000
SALT_BYTES = 16


def hash_password(password: str) -> str:
    if not password:
        raise ValueError("Password must not be empty.")

    salt = os.urandom(SALT_BYTES)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, ITERATIONS)

    return f"{ALGORITHM}${ITERATIONS}${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algorithm, iterations_s, salt_hex, hash_hex = stored.split("$")
    except (ValueError, AttributeError):
        return False

    if algorithm != ALGORITHM:
        return False

    iterations = int(iterations_s)
    salt = bytes.fromhex(salt_hex)
    expected = bytes.fromhex(hash_hex)

    actual = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, iterations)

    # Constant-time compare - avoids leaking hash correctness via timing.
    return hmac.compare_digest(actual, expected)
