"""Tests for the institution configuration surface.

The interesting behaviour here is not "does a field round-trip" but the two
promises the config screen makes to an adopting college:

* a write is **whitelisted** - a typo or an unknown key cannot be smuggled into
  the file the college owns; and
* a write is **live** - the running API serves the new value immediately, with
  no restart, because that is what makes the one-hour onboarding claim true.

The suite points ``INSTITUTION_CONFIG_PATH`` at a temporary file for the
duration of a test, so it never touches the real ``config/institution.json``.
"""

from __future__ import annotations

import json

import pytest

from app.core import institution as institution_module
from app.core.config import settings
from tests.conftest import auth


@pytest.fixture()
def temp_institution(tmp_path):
    """Redirect the loader at a scratch file, and restore it afterwards.

    ``institution()`` is cached, so the cache is cleared on both sides of the
    test - otherwise a later test would read this scratch file and fail in a way
    that looks unrelated to the change that caused it.
    """
    path = tmp_path / "institution.json"
    path.write_text("{}\n", encoding="utf-8")
    original = settings.institution_config_path
    settings.institution_config_path = str(path)
    institution_module.reload_institution()
    try:
        yield path
    finally:
        settings.institution_config_path = original
        institution_module.reload_institution()


def test_identity_write_is_live_and_audited(client, admin_token, temp_institution):
    response = client.post(
        "/api/v1/admin/institution/identity",
        headers=auth(admin_token),
        json={
            "identity": {"name": "Test Institute of Technology", "short_name": "TIT", "monogram": "TIT"},
            "appearance": {"accent": "#3b82f6", "direction": "rtl", "crest_url": "/crest.svg"},
        },
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["updated"] is True
    assert sorted(body["sections"]) == ["appearance", "identity"]

    # The value is served by the public endpoint immediately, with no reload
    # call and no restart - this is the whole point of the onboarding wizard.
    public = client.get("/api/v1/institution").json()
    assert public["identity"]["name"] == "Test Institute of Technology"
    assert public["appearance"]["direction"] == "rtl"
    assert public["appearance"]["accent"] == "#3b82f6"
    assert public["appearance"]["crest_url"] == "/crest.svg"

    # The file on disk keeps only what the college chose, so it stays a short,
    # reviewable diff rather than a dump of the merged defaults.
    written = json.loads(temp_institution.read_text(encoding="utf-8"))
    assert written["identity"]["name"] == "Test Institute of Technology"
    assert "vocabulary" not in written

    full = client.get("/api/v1/admin/institution", headers=auth(admin_token)).json()
    assert full["identity"]["short_name"] == "TIT"


def test_unknown_keys_are_ignored_not_written(client, admin_token, temp_institution):
    # One allowed key alongside a typo: the allowed key is written, the typo is
    # dropped without failing the whole write.
    response = client.post(
        "/api/v1/admin/institution/identity",
        headers=auth(admin_token),
        json={"identity": {"name": "Kept Institute", "not_a_real_key": "should vanish"}},
    )
    assert response.status_code == 200, response.text
    written = json.loads(temp_institution.read_text(encoding="utf-8"))
    assert written["identity"]["name"] == "Kept Institute"
    assert "not_a_real_key" not in written["identity"]

    # A write of *only* unknown keys is rejected rather than silently accepted.
    empty = client.post(
        "/api/v1/admin/institution/identity",
        headers=auth(admin_token),
        json={"identity": {"not_a_real_key": "x"}},
    )
    assert empty.status_code == 422, empty.text


def test_invalid_direction_is_reverted_by_validation(client, admin_token, temp_institution):
    response = client.post(
        "/api/v1/admin/institution/identity",
        headers=auth(admin_token),
        json={"appearance": {"direction": "sideways", "accent": "  "}},
    )
    assert response.status_code == 200, response.text
    public = client.get("/api/v1/institution").json()
    # A bad direction falls back to ltr so the shell cannot render sideways.
    assert public["appearance"]["direction"] == "ltr"
    # A blank accent is cleared to null; the frontend then keeps the shipped
    # colour. (Contrast validation of a supplied accent happens client-side,
    # where the rendered themes are known.)
    assert public["appearance"]["accent"] is None


def test_identity_write_requires_config_permission(client, student_token, temp_institution):
    response = client.post(
        "/api/v1/admin/institution/identity",
        headers=auth(student_token),
        json={"identity": {"name": "Should Not Apply"}},
    )
    assert response.status_code == 403, response.text
    # Nothing was written by the refused request.
    written = json.loads(temp_institution.read_text(encoding="utf-8"))
    assert written == {}
