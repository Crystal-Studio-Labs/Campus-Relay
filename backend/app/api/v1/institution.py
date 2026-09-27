"""Institution configuration surface.

Three endpoints, and the split between them is the point:

* ``GET /institution`` is public. The landing page, the sign-in screen and a
  kiosk that nobody has signed into yet all have to render the right college,
  so branding is served without a session - and it contains no structure, no
  vocabulary and no guardrails.
* ``GET /admin/institution`` returns the whole merged configuration plus where
  it came from and any warnings, so an administrator can check what the running
  server actually believes rather than what the file was supposed to say.
* ``POST /admin/institution/reload`` re-reads the file from disk, so the config
  screen does not require an API restart to show an edit.
"""

from fastapi import APIRouter

from app.api.deps import CurrentUser, DbSession, assert_permission
from app.core.errors import ValidationError
from app.core.institution import (
    institution,
    public_institution,
    reload_institution,
    write_institution_updates,
)
from app.core.permissions import CONFIG_MANAGE
from app.api.v1.schemas import InstitutionUpdateRequest
from app.services import audit

router = APIRouter(tags=["institution"])


@router.get("/institution")
def get_institution():
    """Public branding for the landing page, sign-in stations and kiosk."""
    return public_institution()


@router.get("/admin/institution")
def get_institution_full(db: DbSession, user: CurrentUser):
    """The complete configuration, with its provenance."""
    assert_permission(user, CONFIG_MANAGE)
    config = institution()
    vocabulary = config.get("vocabulary", {})
    return {
        **config,
        # A checklist rather than a prose page: the setup screen renders this so
        # an administrator can see every knob the template exposes, whether it
        # is coming from the file or from the built-in default.
        "editable_keys": [
            {
                "path": "identity.name",
                "label": "Institution name",
                "group": "Identity",
                "current": config["identity"]["name"],
            },
            {
                "path": "identity.short_name",
                "label": "Short name (navigation and headers)",
                "group": "Identity",
                "current": config["identity"]["short_name"],
            },
            {
                "path": "identity.monogram",
                "label": "Monogram (up to 4 characters)",
                "group": "Identity",
                "current": config["identity"]["monogram"],
            },
            {
                "path": "identity.kind",
                "label": "Institution kind",
                "group": "Identity",
                "current": config["identity"]["kind"],
            },
            {
                "path": "identity.support_email",
                "label": "Support email",
                "group": "Identity",
                "current": config["identity"]["support_email"],
            },
            {
                "path": "identity.support_phone",
                "label": "Support phone",
                "group": "Identity",
                "current": config["identity"]["support_phone"],
            },
            {
                "path": "academics.term_label",
                "label": "Term label shown in headers",
                "group": "Academics",
                "current": config["academics"]["term_label"],
            },
            {
                "path": "academics.timezone",
                "label": "Timezone for deadlines and SLAs",
                "group": "Academics",
                "current": config["academics"]["timezone"],
            },
            {
                "path": "localisation.default_language",
                "label": "Default language",
                "group": "Language",
                "current": config["localisation"]["default_language"],
            },
            {
                "path": "localisation.languages",
                "label": "Languages offered",
                "group": "Language",
                "current": ", ".join(config["localisation"]["languages"]),
            },
            {
                "path": "appearance.skin",
                "label": "Design language (skin)",
                "group": "Appearance",
                "current": config["appearance"]["skin"],
            },
            {
                "path": "appearance.default_theme",
                "label": "Default theme for new devices",
                "group": "Appearance",
                "current": config["appearance"]["default_theme"],
            },
            {
                "path": "appearance.allow_user_theme_override",
                "label": "Let people switch theme themselves",
                "group": "Appearance",
                "current": "yes" if config["appearance"]["allow_user_theme_override"] else "no",
            },
            {
                "path": "appearance.accent",
                "label": "Institution accent colour (hex, or empty)",
                "group": "Appearance",
                "current": config["appearance"].get("accent") or "shipped default",
            },
            {
                "path": "appearance.crest_url",
                "label": "Crest / logo URL",
                "group": "Appearance",
                "current": config["appearance"].get("crest_url") or "wordmark only",
            },
            {
                "path": "appearance.direction",
                "label": "Reading direction (ltr or rtl)",
                "group": "Appearance",
                "current": config["appearance"].get("direction") or "ltr",
            },
            {
                "path": "vocabulary",
                "label": "Words used for campus structure",
                "group": "Vocabulary",
                "current": ", ".join(
                    f"{key} → {value['singular']}" for key, value in sorted(vocabulary.items())
                ),
            },
            {
                "path": "stations.kiosk_idle_seconds",
                "label": "Kiosk idle timeout (seconds)",
                "group": "Stations",
                "current": config["stations"]["kiosk_idle_seconds"],
            },
            {
                "path": "features",
                "label": "Enabled modules",
                "group": "Features",
                "current": ", ".join(
                    key for key, enabled in config["features"].items() if enabled
                ),
            },
            {
                "path": "guardrails",
                "label": "Accessibility and audit floor",
                "group": "Guardrails",
                "current": (
                    f"WCAG {config['guardrails']['wcag_level']}, "
                    f"{config['guardrails']['min_body_contrast']}:1 body contrast, "
                    f"{config['guardrails']['min_touch_target_px']}px minimum target"
                ),
            },
        ],
    }


@router.post("/admin/institution/identity")
def update_identity(payload: InstitutionUpdateRequest, db: DbSession, user: CurrentUser):
    """Write institution identity/branding without a code change or a restart.

    This is what the onboarding wizard calls: a college types its name, crest
    and colours and the running deployment picks them up immediately. Only the
    whitelisted fields in the institution loader are accepted.
    """
    assert_permission(user, CONFIG_MANAGE)
    updates = {
        section: value
        for section, value in payload.model_dump(exclude_none=True).items()
        if isinstance(value, dict)
    }
    try:
        path = write_institution_updates(updates)
    except ValueError as error:
        raise ValidationError(str(error)) from None

    after = institution()
    audit.record_audit(
        db,
        event_type="INSTITUTION_CONFIG_UPDATED",
        campus_id=user.campus_id,
        actor=user,
        entity_type="INSTITUTION_CONFIG",
        payload={"sections": sorted(updates.keys()), "file": path},
    )
    return {
        "updated": True,
        "file": path,
        "sections": sorted(updates.keys()),
        "warnings": after["source"]["warnings"],
    }


@router.post("/admin/institution/reload")
def reload_institution_config(db: DbSession, user: CurrentUser):
    """Re-read config/institution.json without restarting the API."""
    assert_permission(user, CONFIG_MANAGE)
    before = institution()
    after = reload_institution()
    changed = [
        key
        for key in ("identity", "appearance", "localisation", "stations", "features")
        if before.get(key) != after.get(key)
    ]
    # A config change is an administrative act, so it is audited like any other.
    # The session commits at the end of the request (app/core/db.py).
    audit.record_audit(
        db,
        event_type="INSTITUTION_CONFIG_RELOADED",
        campus_id=user.campus_id,
        actor=user,
        entity_type="INSTITUTION_CONFIG",
        payload={"changed_sections": changed, "file": after["source"]["file"]},
    )
    return {
        "reloaded": True,
        "changed_sections": changed,
        "warnings": after["source"]["warnings"],
        "source": after["source"],
    }
