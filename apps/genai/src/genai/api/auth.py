import hmac
import os

from dotenv import load_dotenv
from fastapi import Depends, HTTPException, status
from fastapi.security import APIKeyHeader

load_dotenv()  # Load .env file if present (for local dev)

AUTHORIZATION_SECRET_KEY = os.getenv("AUTHORIZATION_SECRET_KEY")

if not AUTHORIZATION_SECRET_KEY:
    raise RuntimeError("AUTHORIZATION_SECRET_KEY environment variable is not set.")

api_key_header = APIKeyHeader(
    name="X-API-Key",
    auto_error=False,
)


async def verify_api_key(
    api_key: str | None = Depends(api_key_header),
) -> str:
    # Constant-time comparison — `!=` on strings short-circuits on the first
    # mismatched byte, leaking a timing signal an attacker can use to guess
    # the key one byte at a time. hmac.compare_digest always takes the same
    # time for a given input length. api_key is checked for None first since
    # compare_digest requires both arguments to be str (or both bytes).
    if api_key is None or not hmac.compare_digest(api_key, AUTHORIZATION_SECRET_KEY):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API key",
        )

    return api_key
