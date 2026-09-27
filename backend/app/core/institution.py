"""Institution configuration - the one file a new college edits.

Campus Relay is a template. Everything that differs between one college and the
next - the name on the plate, the design language, the words used for hostels,
how long a lobby kiosk waits before it resets, which modules are switched on -
lives in ``config/institution.json`` at the repository root. Nothing in this
module is a secret and nothing in it is per-user, so the file is meant to be
read, diffed and reviewed by whoever adopts the platform.

Two deliberate properties:

1. **A partial file works.** The file is deep-merged over the defaults below, so
   a college that only wants to change its name writes four lines. A missing
   file is not a crash: the deployment starts with the defaults and the config
   screen says so plainly.

2. **Nothing downstream reads the file directly.** The API serves the merged,
   validated result, and the frontend consumes that. Whatever is on screen is
   therefore exactly what the server believes is configured - which is the
   whole point of having a config screen rather than a wiki page.
"""

from __future__ import annotations

import json
from copy import deepcopy
from functools import lru_cache
from pathlib import Path
from typing import Any

from app.core.config import settings

# --------------------------------------------------------------------------
# The defaults. This dictionary is also the schema: any key a college may set
# exists here first, with a value that is safe to ship.
# --------------------------------------------------------------------------

DEFAULT_INSTITUTION: dict[str, Any] = {
    "schema_version": 1,
    "identity": {
        "name": "Campus Relay",
        "short_name": "Campus Relay",
        "monogram": "CR",
        "code": "CR",
        "tagline": "A resilient operating layer for everyday campus operations.",
        "kind": "University",
        "city": "",
        "region": "",
        "support_email": "",
        "support_phone": "",
        "website": "",
    },
    "academics": {
        "term_label": "Current term",
        "timezone": "Asia/Kolkata",
        "week_starts_on": "monday",
    },
    "localisation": {
        "default_language": "en",
        "languages": ["en", "hi", "or"],
    },
    "appearance": {
        # Which design language the deployment ships with. See
        # frontend/src/theme/registry.ts - a skin is a token set, never a fork.
        "skin": "industrial",
        # "light" is the clean white mode default.
        "default_theme": "light",
        "allow_user_theme_override": True,
        # An institution colour applied as the primary action colour. Left empty
        # by default: the shipped hazard orange already clears contrast on both
        # themes, and an arbitrary colour may not. The interface ignores an
        # accent that fails contrast rather than shipping an unreadable button.
        "accent": None,
        # Crest or logo shown on the brand plate. A URL or a path under public/.
        # Empty means the wordmark alone, and the plate falls back to a
        # monochrome mark so a two-colour crest never disappears in dark theme.
        "crest_url": "",
        # Reading direction of the shell. "rtl" mirrors the layout for
        # right-to-left scripts; "ltr" ships by default.
        "direction": "ltr",
    },
    "vocabulary": {
        # What this institution calls each thing. Used in the interface instead
        # of hardcoding "Hostel" for an institute that calls them residences.
        "campus": {"singular": "Campus", "plural": "Campuses"},
        "department": {"singular": "Department", "plural": "Departments"},
        "branch": {"singular": "Branch", "plural": "Branches"},
        "year": {"singular": "Year", "plural": "Years"},
        "batch": {"singular": "Batch", "plural": "Batches"},
        "hostel": {"singular": "Hostel", "plural": "Hostels"},
        "block": {"singular": "Block", "plural": "Blocks"},
        "student": {"singular": "Student", "plural": "Students"},
        "staff": {"singular": "Staff member", "plural": "Staff"},
    },
    "stations": {
        # A shared tablet must not hold a personal session forever. This is the
        # idle timeout before the kiosk returns to its sign-in screen.
        "kiosk_idle_seconds": 90,
        "kiosk_default_theme": "light",
        "helpdesk_channel": "ASSISTED_DESK",
        "default_channel": "PWA",
    },
    "features": {
        "agents": True,
        "kiosk": True,
        "gate": True,
        "notices": True,
        "offline_sync": True,
        "guided_tours": True,
        "device_lab": True,
    },
    "guardrails": {
        # The floor this build holds itself to. Printed on the setup screen so
        # an administrator can see what was promised, not just what was built.
        "wcag_level": "AA",
        "min_body_contrast": 4.5,
        "min_touch_target_px": 46,
        "status_always_carries_word": True,
        "require_audit_reason": True,
    },
}

# Where the file lives: repository root / config / institution.json, unless the
# deployment overrides it with INSTITUTION_CONFIG_PATH.
_DEFAULT_FILENAME = "config/institution.json"


def repository_root() -> Path:
    """backend/app/core/institution.py -> repository root."""
    return Path(__file__).resolve().parents[3]


def config_path() -> Path:
    configured = (settings.institution_config_path or "").strip()
    if configured:
        return Path(configured).expanduser().resolve()
    return repository_root() / _DEFAULT_FILENAME


def _deep_merge(base: dict[str, Any], override: dict[str, Any]) -> dict[str, Any]:
    """Merge override into base without mutating either.

    Nested dictionaries merge key by key, so a college can set one vocabulary
    word without restating the other nine. Lists and scalars replace outright,
    because a half-merged list is a bug waiting to happen.
    """
    merged = deepcopy(base)
    for key, value in override.items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = _deep_merge(merged[key], value)
        else:
            merged[key] = deepcopy(value)
    return merged


def _read_file(path: Path) -> tuple[dict[str, Any], str | None]:
    """Read the institution file. A broken file degrades, it does not crash.

    A deployment that cannot start because somebody left a trailing comma in a
    config file is worse than one that starts with the defaults and says so on
    the config screen.
    """
    if not path.exists():
        return {}, None
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        return {}, f"config/institution.json could not be read ({error}); defaults are in use."
    if not isinstance(raw, dict):
        return {}, "config/institution.json must contain a JSON object; defaults are in use."
    return raw, None


def _validate(config: dict[str, Any]) -> tuple[dict[str, Any], list[str]]:
    """Keep the merge honest: drop anything that would render the UI broken."""
    notes: list[str] = []

    appearance = config.get("appearance") or {}
    if not isinstance(appearance.get("skin"), str) or not appearance.get("skin"):
        appearance["skin"] = DEFAULT_INSTITUTION["appearance"]["skin"]
        notes.append("appearance.skin was missing or not a string; reverted to the shipped skin.")
    if appearance.get("default_theme") not in {"device", "light", "dark"}:
        appearance["default_theme"] = "device"
        notes.append("appearance.default_theme must be device, light or dark; reverted to device.")
    if appearance.get("direction") not in {"ltr", "rtl"}:
        appearance["direction"] = "ltr"
        notes.append("appearance.direction must be ltr or rtl; reverted to ltr.")
    crest = appearance.get("crest_url")
    if crest is not None and not isinstance(crest, str):
        appearance["crest_url"] = ""
        notes.append("appearance.crest_url must be a string; cleared.")
    accent = appearance.get("accent")
    if accent is not None and (not isinstance(accent, str) or not accent.strip()):
        appearance["accent"] = None
    config["appearance"] = appearance

    identity = config.get("identity") or {}
    for field in ("name", "short_name", "monogram"):
        if not isinstance(identity.get(field), str) or not identity.get(field).strip():
            fallback = DEFAULT_INSTITUTION["identity"]
            identity[field] = identity.get("code") if field == "monogram" and identity.get("code") else fallback[field]
            notes.append(f"identity.{field} was empty; fell back to a usable value.")
    if len(identity.get("monogram", "")) > 4:
        identity["monogram"] = identity["monogram"][:4]
        notes.append("identity.monogram was longer than 4 characters; it was truncated for the plate.")
    config["identity"] = identity

    localisation = config.get("localisation") or {}
    languages = localisation.get("languages")
    if not isinstance(languages, list) or not languages:
        localisation["languages"] = DEFAULT_INSTITUTION["localisation"]["languages"]
        notes.append("localisation.languages was empty; fell back to the shipped languages.")
    elif localisation.get("default_language") not in languages:
        localisation["default_language"] = languages[0]
        notes.append("localisation.default_language was not one of the configured languages; using the first.")
    config["localisation"] = localisation

    stations = config.get("stations") or {}
    idle = stations.get("kiosk_idle_seconds")
    if not isinstance(idle, int) or not 15 <= idle <= 3600:
        stations["kiosk_idle_seconds"] = DEFAULT_INSTITUTION["stations"]["kiosk_idle_seconds"]
        notes.append("stations.kiosk_idle_seconds must be between 15 and 3600; reverted to the default.")
    config["stations"] = stations

    return config, notes


def load_institution() -> dict[str, Any]:
    """The merged configuration, plus where it came from and any warnings.

    Not cached at import time on purpose - the config screen calls this through
    `reload_institution` so an administrator can edit the file and see the
    result without restarting the API.
    """
    path = config_path()
    raw, read_error = _read_file(path)
    merged = _deep_merge(DEFAULT_INSTITUTION, raw)
    merged, notes = _validate(merged)
    if read_error:
        notes.insert(0, read_error)
    merged["source"] = {
        "file": str(path),
        "found": path.exists(),
        "loaded_at": _now(),
        "warnings": notes,
        # Stated explicitly so nobody has to guess whether the running API is
        # showing the file on disk or a value baked in at build time.
        "env_override": bool((settings.institution_config_path or "").strip()),
    }
    return merged


def _now() -> str:
    from app.services import clock

    return clock.now().isoformat()


@lru_cache(maxsize=1)
def _cached_institution() -> dict[str, Any]:
    return load_institution()


def institution() -> dict[str, Any]:
    """Cached read, for per-request use."""
    return _cached_institution()


def reload_institution() -> dict[str, Any]:
    """Drop the cache and re-read; what the config screen calls after an edit."""
    _cached_institution.cache_clear()
    return _cached_institution()


# Fields an onboarding wizard may write into the template. Anything outside
# this set is ignored, so a request can never smuggle an unrelated key into the
# file a college owns.
_WRITABLE_FIELDS: dict[str, tuple[str, ...]] = {
    "identity": (
        "name",
        "short_name",
        "monogram",
        "code",
        "tagline",
        "kind",
        "city",
        "region",
        "support_email",
        "support_phone",
        "website",
    ),
    "appearance": (
        "skin",
        "default_theme",
        "allow_user_theme_override",
        "accent",
        "crest_url",
        "direction",
    ),
    "academics": ("term_label", "timezone", "week_starts_on"),
    "localisation": ("default_language", "languages"),
    "stations": ("kiosk_idle_seconds", "kiosk_default_theme", "helpdesk_channel", "default_channel"),
}


def write_institution_updates(updates: dict[str, Any]) -> str:
    """Write whitelisted sections into the institution file, then reload.

    The file stays human-readable: it is written with indentation and survives a
    partial file. Only keys named in ``_WRITABLE_FIELDS`` are accepted, and an
    unknown section is ignored rather than created. The merged defaults are NOT
    written out - the file keeps only what the college chose, so it stays a
    short, reviewable diff.
    """
    sanitised: dict[str, Any] = {}
    for section, allowed in _WRITABLE_FIELDS.items():
        values = updates.get(section)
        if not isinstance(values, dict):
            continue
        kept = {key: value for key, value in values.items() if key in allowed}
        if kept:
            sanitised[section] = kept

    if not sanitised:
        raise ValueError("No writable configuration fields were supplied.")

    path = config_path()
    raw, read_error = _read_file(path)
    if read_error:
        raise ValueError(read_error)

    merged = _deep_merge(raw, sanitised)
    # Keep the explanatory comment block if the shipped file had one.
    if "_readme" not in merged and isinstance(raw.get("_readme"), list):
        merged["_readme"] = raw["_readme"]

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(merged, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    reload_institution()
    return str(path)


def public_institution() -> dict[str, Any]:
    """Everything the interface needs, minus operational detail.

    The kiosk, the sign-in screen and the landing page render before anybody has
    a session, so the whole of the configuration has to be readable without one:
    otherwise the Directory screen would show the default word for a hostel
    while the server believed a different one. What is withheld is only the part
    that describes the *deployment* rather than the institution - the config
    file path, the reload warnings and the administrator's edit checklist - and
    that is served by the admin endpoint alone.
    """
    config = institution()
    identity = config["identity"]
    return {
        "schema_version": config["schema_version"],
        "identity": {
            key: identity.get(key, "")
            for key in (
                "name",
                "short_name",
                "monogram",
                "code",
                "tagline",
                "kind",
                "city",
                "region",
                "support_email",
                "support_phone",
                "website",
            )
        },
        "academics": dict(config["academics"]),
        "localisation": {
            "default_language": config["localisation"]["default_language"],
            "languages": list(config["localisation"]["languages"]),
        },
        "appearance": {
            "skin": config["appearance"]["skin"],
            "default_theme": config["appearance"]["default_theme"],
            "allow_user_theme_override": bool(config["appearance"]["allow_user_theme_override"]),
            "accent": config["appearance"].get("accent"),
            "crest_url": config["appearance"].get("crest_url") or "",
            "direction": config["appearance"].get("direction") or "ltr",
        },
        "vocabulary": dict(config["vocabulary"]),
        "stations": dict(config["stations"]),
        "features": {
            key: bool(config["features"].get(key, True))
            for key in ("kiosk", "gate", "notices", "offline_sync", "guided_tours", "device_lab", "agents")
        },
        "guardrails": dict(config["guardrails"]),
    }
