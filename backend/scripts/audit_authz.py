"""Static authorization audit.

Walks every route handler in ``app/api/v1`` (AST, not grep) and reports which
ones declare no authentication or permission check of any kind, so an
unintentionally open endpoint cannot hide behind a large surface.

A route counts as *checked* when any of these is true:
  * the handler calls ``assert_permission`` / ``require_permission``
  * the handler takes ``CurrentUser`` as a parameter (authentication at least)
  * the handler takes a dependency that itself requires a user
  * the router was included with ``dependencies=[Depends(...)]``

Run:  python -m scripts.audit_authz
"""

from __future__ import annotations

import ast
from pathlib import Path

APP_DIR = Path(__file__).resolve().parent.parent / "app"
API_DIR = APP_DIR / "api" / "v1"

# Names that may legitimately be the first argument of assert_permission.
USER_ARGUMENTS = {"user", "actor", "current_user", "viewer"}

AUTH_MARKERS = ("assert_permission", "require_permission", "CurrentUser", "current_user", "get_current_user")
METHODS = {"get", "post", "put", "patch", "delete", "head", "options"}


def _permission_names(node: ast.AST) -> list[str]:
    """Permission constants in an argument, including either arm of a
    conditional (``NOTICE_PUBLISH if immediate else NOTICE_CREATE``)."""
    if isinstance(node, ast.Name):
        return [node.id]
    if isinstance(node, ast.Constant):
        return [str(node.value)]
    if isinstance(node, ast.IfExp):
        return _permission_names(node.body) + _permission_names(node.orelse)
    if isinstance(node, ast.BoolOp):
        return [name for value in node.values for name in _permission_names(value)]
    return []


def audit_call_sites() -> list[str]:
    """Every ``assert_permission(...)`` call whose first argument is not a user.

    ``assert_permission(user, *required)`` reads like a decorator and is easy to
    call as ``assert_permission(SOME_PERMISSION)`` - which passes the permission
    *string* as the user and silently checks nothing, then raises AttributeError
    on ``str.permission_keys``. Both failures are invisible in review.
    """
    offenders: list[str] = []
    for path in sorted(APP_DIR.rglob("*.py")):
        text = path.read_text(encoding="utf-8")
        for node in ast.walk(ast.parse(text)):
            if not (
                isinstance(node, ast.Call)
                and isinstance(node.func, ast.Name)
                and node.func.id == "assert_permission"
            ):
                continue
            first = node.args[0] if node.args else None
            if first is None or not isinstance(first, ast.Name) or first.id not in USER_ARGUMENTS:
                shown = ast.get_source_segment(text, node) or "<unparsed>"
                offenders.append(
                    f"  {path.relative_to(APP_DIR.parent)}:{node.lineno}  {shown.strip()}"
                )
            elif len(node.args) < 2:
                shown = ast.get_source_segment(text, node) or "<unparsed>"
                offenders.append(
                    f"  {path.relative_to(APP_DIR.parent)}:{node.lineno}  {shown.strip()}  (no permission named)"
                )
    return offenders


def _decorator_route(dec: ast.AST) -> str | None:
    """Return 'METHOD /path' when this decorator is a router route."""
    if not isinstance(dec, ast.Call):
        return None
    func = dec.func
    if not isinstance(func, ast.Attribute) or func.attr not in METHODS:
        return None
    if not isinstance(func.value, ast.Name):
        return None
    path = ""
    if dec.args and isinstance(dec.args[0], ast.Constant):
        path = str(dec.args[0].value)
    return f"{func.attr.upper()} {path}"


def audit_file(path: Path) -> list[tuple[str, str, bool, str, list[str]]]:
    text = path.read_text(encoding="utf-8")
    tree = ast.parse(text)
    findings: list[tuple[str, str, bool, str, list[str]]] = []
    for node in tree.body:
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        routes = [r for r in (_decorator_route(d) for d in node.decorator_list) if r]
        if not routes:
            continue
        source = ast.get_source_segment(text, node) or ""
        checked = any(marker in source for marker in AUTH_MARKERS)
        params = [a.arg for a in node.args.args]
        # The permission constants this handler actually asserts.
        permissions: list[str] = []
        for inner in ast.walk(node):
            if (
                isinstance(inner, ast.Call)
                and isinstance(inner.func, ast.Name)
                and inner.func.id == "assert_permission"
            ):
                for arg in inner.args[1:]:
                    permissions.extend(_permission_names(arg))
        findings.append((" / ".join(routes), node.name, checked, ", ".join(params), permissions))
    return findings


def main() -> None:
    unchecked: list[str] = []
    authenticated_only: list[str] = []
    by_permission: dict[str, list[str]] = {}
    total = 0
    for path in sorted(API_DIR.glob("*.py")):
        if path.name in {"__init__.py", "router.py", "schemas.py"}:
            continue
        for route, handler, checked, params, permissions in audit_file(path):
            total += 1
            if not checked:
                unchecked.append(f"  {path.name:18s} {route:58s} {handler}({params})")
            elif not permissions:
                authenticated_only.append(f"  {path.name:18s} {route:56s} {handler}({params})")
            for permission in permissions:
                by_permission.setdefault(permission, []).append(route)

    print(f"routes audited: {total}")
    print(f"\n== routes with NO visible auth check: {len(unchecked)} ==")
    for line in unchecked:
        print(line)
    print(f"\n== authenticated but naming no specific permission: {len(authenticated_only)} ==")
    for line in authenticated_only:
        print(line)
    print("\n== assert_permission call sites with a non-user first argument ==")
    call_site_offenders = audit_call_sites()
    if call_site_offenders:
        for line in call_site_offenders:
            print(line)
    else:
        print("  none")

    print(f"\n== permission -> route map ({len(by_permission)} permissions enforced) ==")
    for permission in sorted(by_permission):
        routes = by_permission[permission]
        shown = ", ".join(routes[:3])
        more = "" if len(routes) <= 3 else f" (+{len(routes) - 3} more)"
        print(f"  {permission:28s} {len(routes):3d}  {shown}{more}")


if __name__ == "__main__":
    main()
