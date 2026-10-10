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

ATTENDANCE_READ = "attendance:read"
ATTENDANCE_MARK = "attendance:mark"
ATTENDANCE_MANAGE = "attendance:manage"

MARKS_READ = "marks:read"
MARKS_ENTRY = "marks:entry"
MARKS_MANAGE = "marks:manage"

TIMETABLE_READ = "timetable:read"
TIMETABLE_MANAGE = "timetable:manage"

FEES_READ = "fees:read"
FEES_MANAGE = "fees:manage"

CLEARANCE_READ = "clearance:read"
CLEARANCE_REQUEST = "clearance:request"
CLEARANCE_DECIDE = "clearance:decide"

LIBRARY_READ = "library:read"
LIBRARY_MANAGE = "library:manage"

LEAVE_READ = "leave:read"
LEAVE_REQUEST = "leave:request"
LEAVE_DECIDE = "leave:decide"

FEEDBACK_SUBMIT = "feedback:submit"
FEEDBACK_READ = "feedback:read"
FEEDBACK_MANAGE = "feedback:manage"
FEEDBACK_REQUEST = "feedback:request"

ACTIVITY_READ = "activity:read"
ACTIVITY_MANAGE = "activity:manage"
ACTIVITY_PARTICIPATE = "activity:participate"

CAREER_READ = "career:read"
CAREER_MANAGE = "career:manage"
CAREER_APPLY = "career:apply"

HRMS_READ = "hrms:read"
HRMS_MANAGE = "hrms:manage"
SALARY_READ = "salary:read"
SALARY_MANAGE = "salary:manage"

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
    AUDIT_READ: ("admin", "Read the activity log"),
    USER_MANAGE: ("admin", "Manage users and roles"),
    CONFIG_MANAGE: ("admin", "Manage deadlines, rules and service configuration"),
    SERVICE_CATALOG_MANAGE: ("admin", "Manage the service catalog"),
    DATA_IMPORT: ("admin", "Import data from CSV"),
    DATA_EXPORT: ("admin", "Export data"),
    AGENT_OPERATE: ("intelligence", "Use operational agents"),
    SYNC_SUBMIT: ("sync", "Replay queued offline operations"),
    DEMO_RESET: ("admin", "Reset demo data"),
    ATTENDANCE_READ: ("academics", "Read attendance for yourself"),
    ATTENDANCE_MARK: ("academics", "Mark attendance for a subject you teach"),
    ATTENDANCE_MANAGE: ("academics", "Manage attendance across the institution"),
    MARKS_READ: ("academics", "Read marks for yourself"),
    MARKS_ENTRY: ("academics", "Enter marks for a subject you teach"),
    MARKS_MANAGE: ("academics", "Manage marks across the institution"),
    TIMETABLE_READ: ("academics", "Read the timetable"),
    TIMETABLE_MANAGE: ("academics", "Create or change timetable periods"),
    FEES_READ: ("finance", "Read your own fee records"),
    FEES_MANAGE: ("finance", "Create fee records and record payments"),
    CLEARANCE_READ: ("services", "Read clearance requests for yourself"),
    CLEARANCE_REQUEST: ("services", "Raise a clearance / no-dues request"),
    CLEARANCE_DECIDE: ("services", "Approve or reject a clearance request"),
    LIBRARY_READ: ("services", "Search the library catalogue and read your loans"),
    LIBRARY_MANAGE: ("services", "Manage the catalogue, issue and return books"),
    LEAVE_READ: ("services", "Read leave applications for yourself"),
    LEAVE_REQUEST: ("services", "Apply for leave"),
    LEAVE_DECIDE: ("services", "Approve or reject a leave application"),
    FEEDBACK_SUBMIT: ("services", "Submit feedback about the campus"),
    FEEDBACK_READ: ("services", "Read feedback you submitted"),
    FEEDBACK_MANAGE: ("services", "Read and respond to all feedback"),
    FEEDBACK_REQUEST: ("services", "Ask teachers and students for their feedback"),
    ACTIVITY_READ: ("services", "Browse campus activities"),
    ACTIVITY_MANAGE: ("services", "Create and manage campus activities"),
    ACTIVITY_PARTICIPATE: ("services", "Register for a campus activity"),
    CAREER_READ: ("career", "Read placement postings"),
    CAREER_MANAGE: ("career", "Publish and manage placement postings"),
    CAREER_APPLY: ("career", "Apply to a placement posting"),
    HRMS_READ: ("hrms", "Read your own employment record"),
    HRMS_MANAGE: ("hrms", "Manage staff records and leave"),
    SALARY_READ: ("hrms", "Read your own payslips"),
    SALARY_MANAGE: ("hrms", "Generate and settle payroll"),
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

# The campus-services set the management role holds in full.
#
# FEEDBACK_SUBMIT is deliberately absent: the office does not give feedback to
# the people it runs - it reads what they send and asks them for more (see
# FEEDBACK_REQUEST). A management answer to its own feedback queue is not a
# conversation, and it would put the institution's own rating in the average it
# publishes.
_ALL_SERVICES = {
    CLEARANCE_READ,
    CLEARANCE_REQUEST,
    CLEARANCE_DECIDE,
    LIBRARY_READ,
    LIBRARY_MANAGE,
    LEAVE_READ,
    LEAVE_REQUEST,
    LEAVE_DECIDE,
    FEEDBACK_READ,
    FEEDBACK_MANAGE,
    FEEDBACK_REQUEST,
    ACTIVITY_READ,
    ACTIVITY_MANAGE,
    ACTIVITY_PARTICIPATE,
    CAREER_READ,
    CAREER_MANAGE,
    # CAREER_APPLY is deliberately absent: only a student applies to a
    # posting. The office that publishes postings and moves candidates
    # through the pipeline must not also be able to apply for them.
    HRMS_READ,
    HRMS_MANAGE,
    SALARY_READ,
    SALARY_MANAGE,
}

# What a student may do with campus services. A student reads their own
# records and raises requests; participation and placements are their own too.
_READ_ONLY_SERVICES = {
    CLEARANCE_READ,
    CLEARANCE_REQUEST,
    LIBRARY_READ,
    LEAVE_READ,
    LEAVE_REQUEST,
    FEEDBACK_SUBMIT,
    FEEDBACK_READ,
    ACTIVITY_READ,
    CAREER_READ,
}

ROLE_PERMISSIONS: dict[str, set[str]] = {
    # Management: runs the institution, day to day and as a deployment. One
    # role, because the registrar and the hostel warden hold the same office -
    # see RoleKey. It carries the full operations set, which includes the gate,
    # kiosk and helpdesk duties that used to be separate staff roles, so those
    # stations keep working under a single management credential. What a person
    # may *see* is narrowed by scope, not by a second role.
    RoleKey.MANAGEMENT.value: (
        _ALL_CASE
        | _ALL_ADMIN
        | _ALL_NOTICE
        | _ALL_NOTIFICATION
        | _ALL_GATE
        # Management runs the institution, not the classroom. ATTENDANCE_MARK
        # and MARKS_ENTRY are deliberately absent: entering attendance or marks
        # for a class is the teacher's desk, and letting the office hold those
        # keys would put the person who audits the register in charge of writing
        # it. Institution-wide oversight (ATTENDANCE_MANAGE / MARKS_MANAGE) is
        # kept, because that is a different job from taking the register.
        | {
            APPROVAL_DECIDE,
            SYNC_SUBMIT,
            ATTENDANCE_READ,
            ATTENDANCE_MANAGE,
            MARKS_READ,
            MARKS_MANAGE,
            TIMETABLE_READ,
            TIMETABLE_MANAGE,
            FEES_READ,
            FEES_MANAGE,
        }
        | _ALL_SERVICES
    ),
    # Teacher / faculty: academic staff. Works the department queue, owns the
    # subjects and classes they teach, and approves student requests in scope.
    RoleKey.TEACHER.value: {
        ATTENDANCE_READ,
        ATTENDANCE_MARK,
        MARKS_READ,
        MARKS_ENTRY,
        TIMETABLE_READ,
        TIMETABLE_MANAGE,
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
        # DASHBOARD_VIEW stays because it also backs the shared reference-data
        # lookups a teacher screen needs (departments, hostels, the staff
        # workload list on a case). The Command centre *screen* is role-gated to
        # MANAGEMENT in both navigation and the route guard, so holding the
        # permission does not open it. AUDIT_READ is deliberately absent:
        # reading the campus activity log is an administration function, not a
        # teaching one.
        DASHBOARD_VIEW,
        ANALYTICS_READ,
        AGENT_OPERATE,
        SYNC_SUBMIT,
        # Campus services: faculty clear students, run activities, manage the
        # placement cell, and see their own employment record.
        CLEARANCE_READ,
        CLEARANCE_DECIDE,
        LIBRARY_READ,
        LEAVE_READ,
        LEAVE_REQUEST,
        LEAVE_DECIDE,
        FEEDBACK_SUBMIT,
        FEEDBACK_READ,
        FEEDBACK_MANAGE,
        ACTIVITY_READ,
        ACTIVITY_MANAGE,
        ACTIVITY_PARTICIPATE,
        # Placement cell duty: a teacher publishes postings and moves
        # candidates. CAREER_READ (the student job board) is deliberately
        # absent - the board is for students to apply, and a teacher reaches
        # the postings through the placement desk instead.
        CAREER_MANAGE,
        HRMS_READ,
        SALARY_READ,
    },
    # A student reads their own records and raises their own requests; changes
    # to campus records are never theirs.
    RoleKey.STUDENT.value: {
        ATTENDANCE_READ,
        MARKS_READ,
        TIMETABLE_READ,
        FEES_READ,
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
    }
    | _READ_ONLY_SERVICES
    | {ACTIVITY_PARTICIPATE, CAREER_APPLY},
}


def permissions_for_role(role_key: str) -> set[str]:
    return ROLE_PERMISSIONS.get(role_key, set())
