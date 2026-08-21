"""Exposure monitoring — enroll, verify ownership, scan, findings, alerts.

Defensive and consent-based: a user monitors only their *own* identifiers, each
proven with a verification code before it is ever queried. Responses never
expose the stored value or verification code.
"""

from __future__ import annotations

import re

from fastapi import APIRouter, HTTPException, Response, status

from jobsearch.api.deps import CurrentUser, StateDep
from jobsearch.api.schemas import (
    EnrollRequest,
    EnrollResponse,
    MonitoredIdentifierOut,
    ScanResponse,
    VerifyRequest,
)
from jobsearch.models import ExposureFinding, MonitoredIdentifier

router = APIRouter(prefix="/api/v1/monitoring", tags=["monitoring"])

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_PREFIX_RE = re.compile(r"^[0-9A-Fa-f]{5}$")


def _out(i: MonitoredIdentifier) -> MonitoredIdentifierOut:
    return MonitoredIdentifierOut(
        id=i.id,
        type=i.type.value,
        label=i.label,
        verified=i.verified,
        verified_at=i.verified_at.isoformat() if i.verified_at else None,
        created_at=i.created_at.isoformat(),
    )


def _owned(identifier_id: str, user, state) -> MonitoredIdentifier:
    ident = state.monitored_identifiers.get(identifier_id)
    if ident is None or ident.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "identifier not found")
    return ident


@router.post("/identifiers", response_model=EnrollResponse, status_code=status.HTTP_201_CREATED)
def enroll(body: EnrollRequest, user: CurrentUser, state: StateDep) -> EnrollResponse:
    """Enroll an email for breach monitoring; issues an ownership-verification code."""
    if not _EMAIL_RE.match(body.email.strip()):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "invalid email address")
    try:
        ident, code = state.monitoring.enroll(user.id, body.email)
    except ValueError as exc:  # per-user cap
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    return EnrollResponse(identifier=_out(ident), verification_code=code)


@router.post("/identifiers/{identifier_id}/verify", response_model=MonitoredIdentifierOut)
def verify(
    identifier_id: str, body: VerifyRequest, user: CurrentUser, state: StateDep
) -> MonitoredIdentifierOut:
    ident = _owned(identifier_id, user, state)
    if not state.monitoring.verify(ident, body.code.strip()):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "invalid or expired verification code")
    return _out(ident)


@router.get("/identifiers", response_model=list[MonitoredIdentifierOut])
def list_identifiers(user: CurrentUser, state: StateDep) -> list[MonitoredIdentifierOut]:
    return [_out(i) for i in state.monitored_identifiers.find(user_id=user.id)]


@router.delete("/identifiers/{identifier_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove(identifier_id: str, user: CurrentUser, state: StateDep) -> None:
    _owned(identifier_id, user, state)  # owner check
    state.monitoring.remove(identifier_id)


@router.post("/scan", response_model=ScanResponse)
def scan(user: CurrentUser, state: StateDep) -> ScanResponse:
    """Check all *verified* identifiers for new exposures (alerts on new ones)."""
    new = state.monitoring.scan(user.id)
    return ScanResponse(
        new_findings=len(new),
        findings=[f.model_dump(mode="json") for f in new],
    )


@router.get("/password-range/{prefix}", response_class=Response)
def password_range(prefix: str, user: CurrentUser, state: StateDep) -> Response:
    """k-anonymity Pwned Passwords proxy.

    Accepts ONLY a 5-hex-char SHA-1 prefix — it structurally cannot receive a
    password or full hash. Returns the raw ``SUFFIX:COUNT`` range; the client
    hashes the password and matches locally. Nothing is stored.
    """
    if not _PREFIX_RE.match(prefix):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "prefix must be exactly 5 hex characters"
        )
    try:
        body = state.monitoring.password_range(prefix)
    except RuntimeError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc)) from exc
    # No-store: this is a transient, sensitive lookup.
    return Response(
        content=body,
        media_type="text/plain",
        headers={"Cache-Control": "no-store"},
    )


@router.get("/findings", response_model=list[ExposureFinding])
def list_findings(user: CurrentUser, state: StateDep) -> list[ExposureFinding]:
    findings = state.exposure_findings.find(user_id=user.id)
    return sorted(findings, key=lambda f: f.discovered_at, reverse=True)


@router.put("/findings/{finding_id}/acknowledge", response_model=ExposureFinding)
def acknowledge(finding_id: str, user: CurrentUser, state: StateDep) -> ExposureFinding:
    finding = state.exposure_findings.get(finding_id)
    if finding is None or finding.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "finding not found")
    finding.acknowledged = True
    return state.exposure_findings.add(finding)  # persist mutation
