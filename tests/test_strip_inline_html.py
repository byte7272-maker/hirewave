"""Inline-HTML flattening: an email hyperlink (and stray inline tags) must not render as
raw code in a résumé; the /render endpoint flattens it too."""

from __future__ import annotations

from fastapi.testclient import TestClient

from jobsearch.api.app import create_app
from jobsearch.api.state import AppState
from jobsearch.config import Settings
from jobsearch.engines.integration import MockTokenExchanger
from jobsearch.models import Resume
from jobsearch.textextract import strip_inline_html


def test_mailto_anchor_becomes_plain_email():
    t = 'Jane Doe\n<a href="mailto:jane@acme.com">jane@acme.com</a> · (646) 533-7930'
    out = strip_inline_html(t)
    assert "<a" not in out and "href" not in out
    assert "jane@acme.com · (646) 533-7930" in out


def test_anchor_with_empty_text_falls_back_to_mailto_address():
    assert strip_inline_html('<a href="mailto:x@y.com"></a>') == "x@y.com"


def test_strips_stray_inline_tags_and_br_but_keeps_markdown_and_plain_lt():
    t = "**IT Leader**<br><span>New York</span> and a < b comparison"
    out = strip_inline_html(t)
    assert out == "**IT Leader**\nNew York and a < b comparison"


def test_idempotent_and_noop_without_tags():
    assert strip_inline_html("plain text, no tags") == "plain text, no tags"
    once = strip_inline_html('<a href="mailto:a@b.com">a@b.com</a>')
    assert strip_inline_html(once) == once == "a@b.com"


def test_render_endpoint_flattens_anchor_in_markdown():
    st = AppState(settings=Settings(), exchanger=MockTokenExchanger())
    c = TestClient(create_app(state=st))
    c.post("/api/v1/auth/register", json={"email": "r@x.com", "password": "supersecret", "full_name": "R"})
    tok = c.post("/api/v1/auth/login", json={"email": "r@x.com", "password": "supersecret"}).json()
    h = {"Authorization": f"Bearer {tok['access_token']}"}
    uid = st.user_by_email("r@x.com").id
    r = Resume(user_id=uid, target_role="IT Leader",
               rendered_text='Bayete Williams\n\n**IT Leader**\n<a href="mailto:bayete.williamsit@gmail.com">bayete.williamsit@gmail.com</a> · NY\n\nSUMMARY\n\nLed teams.')
    st.resumes.add(r)
    body = c.get(f"/api/v1/resumes/{r.id}/render", headers=h).json()
    assert "<a href" not in body["markdown"]          # no raw HTML code in the rendered doc
    assert "bayete.williamsit@gmail.com · NY" in body["markdown"]  # shown as plain text
