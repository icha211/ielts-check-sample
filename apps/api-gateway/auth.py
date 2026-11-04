import logging
from functools import lru_cache
from threading import Lock

import firebase_admin
from firebase_admin import auth
from firebase_admin.exceptions import FirebaseError
from fastapi import Header, HTTPException
from google.auth.exceptions import GoogleAuthError

from config import settings


logger = logging.getLogger(__name__)
DEVELOPER_EMAIL = "quickcheck.edu@gmail.com"
_app_lock = Lock()


@lru_cache(maxsize=1)
def _firebase_app():
    if not settings.firebase_project_id:
        logger.error("FIREBASE_PROJECT_ID is not configured")
        raise HTTPException(status_code=503, detail="Authentication is not configured")
    with _app_lock:
        try:
            return firebase_admin.get_app("gateway-auth")
        except ValueError:
            return firebase_admin.initialize_app(
                options={"projectId": settings.firebase_project_id},
                name="gateway-auth",
            )


def require_signed_in(authorization: str | None = Header(default=None)) -> dict:
    scheme, _, token = str(authorization or "").partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise HTTPException(
            status_code=401,
            detail="A Firebase Bearer ID token is required",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        claims = auth.verify_id_token(token.strip(), app=_firebase_app(), check_revoked=True)
    except (auth.InvalidIdTokenError, auth.UserDisabledError, ValueError) as exc:
        logger.warning("Request rejected: invalid Firebase session")
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired Firebase session",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc
    except (FirebaseError, GoogleAuthError) as exc:
        logger.error("Firebase authentication service unavailable: %s", type(exc).__name__)
        raise HTTPException(status_code=503, detail="Authentication service unavailable") from exc

    if not claims.get("uid") or claims.get("firebase", {}).get("sign_in_provider") == "anonymous":
        raise HTTPException(status_code=403, detail="Sign in with a registered account to use AI")
    return claims


def require_developer(authorization: str | None = Header(default=None)) -> dict:
    claims = require_signed_in(authorization)
    if (
        claims.get("role") != "developer"
        or claims.get("email") != DEVELOPER_EMAIL
        or claims.get("email_verified") is not True
    ):
        raise HTTPException(status_code=403, detail="Verified developer access is required")
    return claims
