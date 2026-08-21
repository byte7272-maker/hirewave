"""AES-256-GCM authenticated field encryption.

Used to satisfy the plan's "AES-256 encryption at rest for sensitive fields"
requirement — primarily OAuth access/refresh tokens (:class:`OAuthToken`).

The wire format for an encrypted value is::

    v1:<base64(nonce(12) || ciphertext || tag)>

which is self-describing and versioned so the scheme can evolve. Keys are
32 bytes (AES-256); provide one via ``JOBSEARCH_ENCRYPTION_KEY`` (base64 or
hex). If none is set, an *ephemeral* key is generated for the process — fine
for tests/dev, but tokens encrypted with it will not survive a restart.
"""

from __future__ import annotations

import base64
import binascii
import os
import sys

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

_PREFIX = "v1:"
_NONCE_LEN = 12
_KEY_LEN = 32


def generate_key(*, encoding: str = "base64") -> str:
    """Return a fresh random 32-byte key, ``base64`` (default) or ``hex`` encoded."""
    raw = AESGCM.generate_key(bit_length=256)
    return base64.b64encode(raw).decode() if encoding == "base64" else raw.hex()


def _decode_key(material: str) -> bytes:
    """Accept a base64 or hex encoded 32-byte key and return raw bytes."""
    material = material.strip()
    for decoder in (base64.b64decode, bytes.fromhex):
        try:
            raw = decoder(material)
        except (binascii.Error, ValueError):
            continue
        if len(raw) == _KEY_LEN:
            return raw
    raise ValueError("encryption key must decode (base64 or hex) to exactly 32 bytes")


class FieldCipher:
    """Encrypt/decrypt short strings with AES-256-GCM and Additional Auth Data.

    ``aad`` (associated data) binds a ciphertext to a context — e.g. the user id
    and provider — so a token blob cannot be silently swapped between records.
    """

    def __init__(self, key: str | bytes | None = None) -> None:
        if key is None:
            key = os.getenv("JOBSEARCH_ENCRYPTION_KEY", "")
        if not key:
            self._raw = AESGCM.generate_key(bit_length=256)
            self._ephemeral = True
        else:
            self._raw = key if isinstance(key, bytes) else _decode_key(key)
            if len(self._raw) != _KEY_LEN:
                raise ValueError("encryption key must be 32 bytes")
            self._ephemeral = False
        self._aead = AESGCM(self._raw)

    @property
    def is_ephemeral(self) -> bool:
        """True when using a throwaway process key (no persistent key configured)."""
        return self._ephemeral

    def encrypt(self, plaintext: str, *, aad: str | None = None) -> str:
        nonce = os.urandom(_NONCE_LEN)
        aad_bytes = aad.encode() if aad else None
        ct = self._aead.encrypt(nonce, plaintext.encode(), aad_bytes)
        return _PREFIX + base64.b64encode(nonce + ct).decode()

    def decrypt(self, token: str, *, aad: str | None = None) -> str:
        if not token.startswith(_PREFIX):
            raise ValueError("unrecognized ciphertext format")
        blob = base64.b64decode(token[len(_PREFIX) :])
        nonce, ct = blob[:_NONCE_LEN], blob[_NONCE_LEN:]
        aad_bytes = aad.encode() if aad else None
        return self._aead.decrypt(nonce, ct, aad_bytes).decode()


def _main(argv: list[str]) -> int:
    if len(argv) >= 1 and argv[0] == "keygen":
        encoding = argv[1] if len(argv) > 1 else "base64"
        print(generate_key(encoding=encoding))
        return 0
    print("usage: python -m jobsearch.security.crypto keygen [base64|hex]", file=sys.stderr)
    return 1


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(_main(sys.argv[1:]))
