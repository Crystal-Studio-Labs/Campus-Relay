"""RBAC catalogue: permission keys and the default role -> permission mapping.

Permissions are checked server-side on every mutating endpoint. Data *scope*
(which rows a role may see) is enforced separately in app/services/scoping.py,
because "may assign cases" and "may assign cases in this hostel" are different
questions.
"""

from app.models.enums import RoleKey

# --- Permission catalogue -------------------------------------------------

CASE_CREATE = "case:create"
CASE_CREATE_ON_BEHALF = "case:create_on_behalf"
CASE_READ_OWN = "case:read_own"
CASE_READ_SCOPE = "case:read_scope"
CASE_READ_ALL = "case:read_all"
CASE_ASSIGN = "case:assign"
CASE_UPDATE_STATUS = "case:update_status"
CASE_RESOLVE = "case:resolve"
CASE_VERIFY = "case:verify"
CASE_REOPEN = "case:reopen"
CASE_CANCEL = "case:cancel"
CASE_ESCALATE = "case:escalate"
CASE_COMMENT = "case:comment"
CASE_COMMENT_INTERNAL = "case:comment_internal"
CASE_ATTACH = "case:attach"

APPROVAL_DECIDE = "approval:decide"

NOTICE_READ = "notice:read"
NOTICE_CREATE = "notice:create"
NOTICE_PUBLISH = "notice:publish"
NOTICE_MANAGE = "notice:manage"
NOTICE_SHARE = "notice:share"
NOTICE_ANALYTICS = "notice:analytics"

NOTIFICATION_READ = "notification:read"
NOTIFICATION_SEND = "notification:send"
NOTIFICATION_PREFERENCE_MANAGE = "notification:preference_manage"

GATE_VERIFY = "gate:verify"
GATE_OPERATE = "gate:operate"
GATE_LOG_READ = "gate:log_read"

DASHBOARD_VIEW = "dashboard:view"
ANALYTICS_READ = "analytics:read"
AUDIT_READ = "audit:read"
USER_MANAGE = "user:manage"
CONFIG_MANAGE = "config:manage"
SERVICE_CATALOG_MANAGE = "service_catalog:manage"
DATA_IMPORT = "data:import"
DATA_EXPORT = "data:export"
AGENT_OPERATE = "agent:operate"
SYNC_SUBMIT = "sync:submit"
DEMO_RESET = "demo:reset"

PERMISSION_CATALOGUE: dict[str, tuple[str, str]] = {
    CASE_CREATE: ("cases", "Create a campus case"),
    CASE_CREATE_ON_BEHALF: ("cases", "File a request on behalf of a student (kiosk/helpdesk)"),
    CASE_READ_OWN: ("cases", "Read cases you raised"),
    CASE_READ_SCOPE: ("cases", "Read cases within your role's data scope"),
    CASE_READ_ALL: ("cases", "Read every case on the campus"),
    CASE_ASSIGN: ("cases", "Assign or reassign a case to staff"),
    CASE_UPDATE_STATUS: ("cases", "Move a case through the workflow"),
    CASE_RESOLVE: ("cases", "Mark work as done"),
    CASE_VERIFY: ("cases", "Verify a resolution"),
    CASE_REOPEN: ("cases", "Reopen a resolved or closed case"),
    CASE_CANCEL: ("cases", "Cancel a case"),
    CASE_ESCALATE: ("cases", "Escalate a case"),
    CASE_COMMENT: ("cases", "Comment on a case"),
    CASE_COMMENT_INTERNAL: ("cases", "Write internal-only comments"),
    CASE_ATTACH: ("cases", "Attach evidence or documents"),
    APPROVAL_DECIDE: ("approvals", "Approve or reject a pending approval"),
    NOTICE_READ: ("notices", "Read notices addressed to you"),
    NOTICE_CREATE: ("notices", "Draft a notice"),
    NOTICE_PUBLISH: ("notices", "Publish, schedule, expire or archive a notice"),
    NOTICE_MANAGE: ("notices", "Manage any notice on the campus"),
    NOTICE_SHARE: ("notices", "Share an eligible notice"),
    NOTICE_ANALYTICS: ("notices", "See notice delivery, read and action analytics"),
    NOTIFICATION_READ: ("notifications", "Read your notifications"),
    NOTIFICATION_SEND: ("notifications", "Send targeted notifications"),
    NOTIFICATION_PREFERENCE_MANAGE: ("notifications", "Manage notification preferences"),
    GATE_VERIFY: ("gate", "Verify a gate pass"),
    GATE_OPERATE: ("gate", "Record gate entry/exit"),
    GATE_LOG_READ: ("gate", "Read the gate log"),
    DASHBOARD_VIEW: ("admin", "View the operations dashboard"),
    ANALYTICS_READ: ("admin", "View analytics"),
    AUDIT_READ: ("admin", "Read the audit trail"),
    USER_MANAGE: ("admin", "Manage users and roles"),
    CONFIG_MANAGE: ("admin", "Manage SLA, policy and service configuration"),
    SERVICE_CATALOG_MANAGE: ("admin", "Manage the service catalog"),
    DATA_IMPORT: ("admin", "Import data from CSV"),
    DATA_EXPORT: ("admin", "Export data"),
    AGENT_OPERATE: ("intelligence", "Use operational agents"),
    SYNC_SUBMIT: ("sync", "Replay queued offline operations"),
    DEMO_RESET: ("admin", "Reset demo data"),
}

_ALL_CASE = {
    CASE_CREATE,
    CASE_CREATE_ON_BEHALF,
    CASE_READ_OWN,
    CASE_READ_SCOPE,
    CASE_READ_ALL,
    CASE_ASSIGN,
    CASE_UPDATE_STATUS,
    CASE_RESOLVE,
    CASE_VERIFY,
    CASE_REOPEN,
    CASE_CANCEL,
    CASE_ESCALATE,
    CASE_COMMENT,
    CASE_COMMENT_INTERNAL,
    CASE_ATTACH,
}

_ALL_ADMIN = {
    DASHBOARD_VIEW,
    ANALYTICS_READ,
    AUDIT_READ,
    USER_MANAGE,
    CONFIG_MANAGE,
    SERVICE_CATALOG_MANAGE,
    DATA_IMPORT,
    DATA_EXPORT,
    AGENT_OPERATE,
    DEMO_RESET,
}

_ALL_NOTICE = {NOTICE_READ, NOTICE_CREATE, NOTICE_PUBLISH, NOTICE_MANAGE, NOTICE_SHARE, NOTICE_ANALYTICS}

_ALL_NOTIFICATION = {
    NOTIFICATION_READ,
    NOTIFICATION_SEND,
    NOTIFICATION_PREFERENCE_MANAGE,
}

_ALL_GATE = {GATE_VERIFY, GATE_OPERATE, GATE_LOG_READ}

ROLE_PERMISSIONS: dict[str, set[str]] = {
    RoleKey.SUPER_ADMIN.value: (
        _ALL_CASE | _ALL_ADMIN | _ALL_NOTICE | _ALL_NOTIFICATION | _ALL_GATE | {APPROVAL_DECIDE, SYNC_SUBMIT}
    ),
    RoleKey.ADMIN.value: (
        _ALL_CASE
        | _ALL_ADMIN
        | _ALL_NOTICE
        | _ALL_NOTIFICATION
        | _ALL_GATE
        | {APPROVAL_DECIDE, SYNC_SUBMIT}
    )
    - {DEMO_RESET},
    RoleKey.WARDEN.value: {
        CASE_CREATE,
        CASE_CREATE_ON_BEHALF,
        CASE_READ_OWN,
        CASE_READ_SCOPE,
        CASE_ASSIGN,
        CASE_UPDATE_STATUS,
        CASE_RESOLVE,
        CASE_VERIFY,
        CASE_REOPEN,
        CASE_ESCALATE,
        CASE_COMMENT,
        CASE_COMMENT_INTERNAL,
        CASE_ATTACH,
        APPROVAL_DECIDE,
        NOTICE_READ,
        NOTICE_CREATE,
        NOTICE_PUBLISH,
        NOTICE_SHARE,
        NOTICE_ANALYTICS,
        NOTIFICATION_READ,
        NOTIFICATION_SEND,
        NOTIFICATION_PREFERENCE_MANAGE,
        GATE_OPERATE,
        GATE_LOG_READ,
        GATE_VERIFY,
        DASHBOARD_VIEW,
        ANALYTICS_READ,
        AUDIT_READ,
        AGENT_OPERATE,
        SYNC_SUBMIT,
    },
    RoleKey.DEPARTMENT_HEAD.value: {
        CASE_CREATE,
        CASE_READ_OWN,
        CASE_READ_SCOPE,
        CASE_ASSIGN,
        CASE_UPDATE_STATUS,
        CASE_RESOLVE,
        CASE_VERIFY,
        CASE_REOPEN,
        CASE_ESCALATE,
        CASE_COMMENT,
        CASE_COMMENT_INTERNAL,
        CASE_ATTACH,
        APPROVAL_DECIDE,
        NOTICE_READ,
        NOTICE_CREATE,
        NOTICE_PUBLISH,
        NOTICE_SHARE,
        NOTICE_ANALYTICS,
        NOTIFICATION_READ,
        NOTIFICATION_SEND,
        NOTIFICATION_PREFERENCE_MANAGE,
        DASHBOARD_VIEW,
        ANALYTICS_READ,
        AUDIT_READ,
        AGENT_OPERATE,
        SYNC_SUBMIT,
    },
    RoleKey.STAFF.value: {
        CASE_READ_OWN,
        CASE_READ_SCOPE,
        CASE_UPDATE_STATUS,
        CASE_RESOLVE,
        CASE_COMMENT,
        CASE_ATTACH,
        CASE_ESCALATE,
        NOTICE_READ,
        NOTICE_SHARE,
        NOTIFICATION_READ,
        NOTIFICATION_PREFERENCE_MANAGE,
        DASHBOARD_VIEW,
        SYNC_SUBMIT,
        AGENT_OPERATE,
    },
    RoleKey.SECURITY.value: {
        CASE_READ_OWN,
        CASE_READ_SCOPE,
        CASE_COMMENT,
        GATE_VERIFY,
        GATE_OPERATE,
        GATE_LOG_READ,
        NOTICE_READ,
        NOTIFICATION_READ,
        NOTIFICATION_PREFERENCE_MANAGE,
        DASHBOARD_VIEW,
        CASE_CREATE,
        SYNC_SUBMIT,
    },
    RoleKey.HELPDESK_OPERATOR.value: {
        CASE_CREATE,
        CASE_CREATE_ON_BEHALF,
        CASE_READ_OWN,
        CASE_READ_SCOPE,
        CASE_UPDATE_STATUS,
        CASE_COMMENT,
        CASE_ATTACH,
        NOTICE_READ,
        NOTICE_SHARE,
        NOTIFICATION_READ,
        NOTIFICATION_PREFERENCE_MANAGE,
        DASHBOARD_VIEW,
        SYNC_SUBMIT,
    },
    RoleKey.STUDENT.value: {
        CASE_CREATE,
        CASE_READ_OWN,
        CASE_VERIFY,
        CASE_REOPEN,
        CASE_CANCEL,
        CASE_COMMENT,
        CASE_ATTACH,
        NOTICE_READ,
        NOTICE_SHARE,
        NOTIFICATION_READ,
        NOTIFICATION_PREFERENCE_MANAGE,
        SYNC_SUBMIT,
    },
}


def permissions_for_role(role_key: str) -> set[str]:
    return ROLE_PERMISSIONS.get(role_key, set())
