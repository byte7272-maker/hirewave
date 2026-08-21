from jobsearch.security.crypto import FieldCipher, generate_key


def test_roundtrip_with_aad():
    cipher = FieldCipher(generate_key())
    token = cipher.encrypt("secret-token", aad="usr_1:linkedin")
    assert token.startswith("v1:")
    assert cipher.decrypt(token, aad="usr_1:linkedin") == "secret-token"


def test_aad_mismatch_fails():
    cipher = FieldCipher(generate_key())
    token = cipher.encrypt("secret", aad="usr_1:linkedin")
    try:
        cipher.decrypt(token, aad="usr_2:linkedin")
        assert False, "expected authentication failure"
    except Exception:
        pass


def test_ciphertext_is_randomized():
    cipher = FieldCipher(generate_key())
    a = cipher.encrypt("same")
    b = cipher.encrypt("same")
    assert a != b  # random nonce per encryption


def test_ephemeral_flag():
    assert FieldCipher(None).is_ephemeral is True
    assert FieldCipher(generate_key()).is_ephemeral is False


def test_hex_key_accepted():
    cipher = FieldCipher(generate_key(encoding="hex"))
    assert cipher.decrypt(cipher.encrypt("x")) == "x"
