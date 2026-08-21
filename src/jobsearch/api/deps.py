"""FastAPI dependencies: app state access + current-user resolution."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from jobsearch.api.security import TokenError, decode_token
from jobsearch.api.state import AppState
from jobsearch.models import User

_bearer = HTTPBearer(auto_error=True)


def get_state(request: Request) -> AppState:
    return request.app.state.jobsearch


def get_current_user(
    request: Request,
    creds: Annotated[HTTPAuthorizationCredentials, Depends(_bearer)],
) -> User:
    state: AppState = request.app.state.jobsearch
    try:
        payload = decode_token(creds.credentials, expected_type="access")
    except TokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"invalid token: {exc}",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    if payload.get("jti") in state.revoked_jti:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "token has been revoked")

    user = state.users.get(payload["sub"])
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "user no longer exists")
    return user


StateDep = Annotated[AppState, Depends(get_state)]
CurrentUser = Annotated[User, Depends(get_current_user)]
