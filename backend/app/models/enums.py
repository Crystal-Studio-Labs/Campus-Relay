"""Domain enumerations.

Single source of truth for allowed string values in the database. Column-level
CHECK constraints are generated from these (see app/models/base.py:enum_check)
so the database rejects invalid states even if application code is bypassed.
"""

from enum import StrEnum


class RoleKey(StrEnum):
    SUPER_ADMIN = "SUPER_ADMIN"
    ADMIN = "ADMIN"
    WARDEN = "WARDEN"
    DEPARTMENT_HEAD = "DEPARTMENT_HEAD"
    STAFF = "STAFF"
    SECURITY = "SECURITY"
    HELPDESK_OPERATOR = "HELPDESK_OPERATOR"
    STUDENT = "STUDENT"


class CaseStatus(StrEnum):
    DRAFT = "DRAFT"
    SUBMITTED = "SUBMITTED"
    VALIDATING = "VALIDATING"
    ROUTED = "ROUTED"
    ASSIGNED = "ASSIGNED"
    IN_PROGRESS = "IN_PROGRESS"
    WAITING_FOR_USER = "WAITING_FOR_USER"
    WAITING_FOR_APPROVAL = "WAITING_FOR_APPROVAL"
    ESCALATED = "ESCALATED"
    RESOLVED = "RESOLVED"
    VERIFICATION_REQUIRED = "VERIFICATION_REQUIRED"
    CLOSED = "CLOSED"
    REOPENED = "REOPENED"
    CANCELLED = "CANCELLED"


class Priority(StrEnum):
    LOW = "LOW"
    NORMAL = "NORMAL"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"
    URGENT = "URGENT"


class SourceChannel(StrEnum):
    PWA = "PWA"
    WEB_DESKTOP = "WEB_DESKTOP"
    KIOSK = "KIOSK"
    ASSISTED_DESK = "ASSISTED_DESK"
    QR = "QR"
    PHONE = "PHONE"
    EMAIL = "EMAIL"
    WALK_IN = "WALK_IN"
    AGENT = "AGENT"
    SYSTEM = "SYSTEM"


class SlaState(StrEnum):
    NO_SLA = "NO_SLA"
    ON_TIME = "ON_TIME"
    AT_RISK = "AT_RISK"
    BREACHED = "BREACHED"
    MET = "MET"
    MISSED = "MISSED"


class VerificationState(StrEnum):
    NOT_REQUIRED = "NOT_REQUIRED"
    PENDING = "PENDING"
    VERIFIED = "VERIFIED"
    DISPUTED = "DISPUTED"


class ServiceCategory(StrEnum):
    HOSTEL = "HOSTEL"
    FACILITY = "FACILITY"
    ACADEMIC = "ACADEMIC"
    ADMINISTRATIVE = "ADMINISTRATIVE"
    FINANCE = "FINANCE"
    MESS = "MESS"
    SECURITY = "SECURITY"
    OTHER = "OTHER"


class WorkflowStepType(StrEnum):
    APPROVAL = "APPROVAL"
    ASSIGNMENT = "ASSIGNMENT"
    ACTION = "ACTION"
    RESOLUTION = "RESOLUTION"
    VERIFICATION = "VERIFICATION"
    NOTIFICATION = "NOTIFICATION"


class ApprovalState(StrEnum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    CANCELLED = "CANCELLED"
    EXPIRED = "EXPIRED"


class DedupeState(StrEnum):
    NONE = "NONE"
    SUSPECTED = "SUSPECTED"
    CONFIRMED = "CONFIRMED"


class LocationKind(StrEnum):
    HOSTEL_ROOM = "HOSTEL_ROOM"
    WASHROOM = "WASHROOM"
    WATER_COOLER = "WATER_COOLER"
    CORRIDOR = "CORRIDOR"
    CLASSROOM = "CLASSROOM"
    LAB = "LAB"
    LIBRARY = "LIBRARY"
    MESS = "MESS"
    GATE = "GATE"
    OFFICE = "OFFICE"
    EQUIPMENT = "EQUIPMENT"
    OTHER = "OTHER"


class AssetState(StrEnum):
    OPERATIONAL = "OPERATIONAL"
    DEGRADED = "DEGRADED"
    UNDER_REPAIR = "UNDER_REPAIR"
    OUT_OF_SERVICE = "OUT_OF_SERVICE"
    RETIRED = "RETIRED"


class NoticeType(StrEnum):
    NORMAL = "NORMAL"
    IMPORTANT = "IMPORTANT"
    URGENT = "URGENT"
    EMERGENCY = "EMERGENCY"


class NoticeStatus(StrEnum):
    DRAFT = "DRAFT"
    SCHEDULED = "SCHEDULED"
    PUBLISHED = "PUBLISHED"
    EXPIRED = "EXPIRED"
    ARCHIVED = "ARCHIVED"


class NoticeTargetType(StrEnum):
    CAMPUS = "CAMPUS"
    DEPARTMENT = "DEPARTMENT"
    BRANCH = "BRANCH"
    YEAR = "YEAR"
    BATCH = "BATCH"
    HOSTEL = "HOSTEL"
    BLOCK = "BLOCK"
    ROLE = "ROLE"
    USER = "USER"


class NoticeActionType(StrEnum):
    READ = "READ"
    ACKNOWLEDGE = "ACKNOWLEDGE"
    SUBMIT_FORM = "SUBMIT_FORM"
    VIEW_DOCUMENT = "VIEW_DOCUMENT"
    REGISTER = "REGISTER"
    OPEN_CASE = "OPEN_CASE"
    VIEW_TIMETABLE = "VIEW_TIMETABLE"


class NotificationCategory(StrEnum):
    CASE_UPDATE = "CASE_UPDATE"
    APPROVAL = "APPROVAL"
    CERTIFICATE_READY = "CERTIFICATE_READY"
    LEAVE_STATUS = "LEAVE_STATUS"
    GATE_PASS = "GATE_PASS"
    TIMETABLE = "TIMETABLE"
    NOTICE = "NOTICE"
    URGENT_ANNOUNCEMENT = "URGENT_ANNOUNCEMENT"
    SLA_ALERT = "SLA_ALERT"
    SYSTEM = "SYSTEM"
    MESS = "MESS"
    ACADEMIC = "ACADEMIC"
    HOSTEL = "HOSTEL"


class NotificationState(StrEnum):
    SENT = "SENT"
    DELIVERED = "DELIVERED"
    READ = "READ"
    ACTIONED = "ACTIONED"
    FAILED = "FAILED"


class NotificationChannel(StrEnum):
    IN_APP = "IN_APP"
    PUSH = "PUSH"
    TELEGRAM = "TELEGRAM"
    WHATSAPP = "WHATSAPP"


class DeliveryState(StrEnum):
    """Lifecycle of an outbox row. Kept separate from NotificationState:
    a notification is about the recipient, a delivery is about the transport."""

    QUEUED = "QUEUED"
    DELIVERED = "DELIVERED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"


class SyncStatus(StrEnum):
    QUEUED = "QUEUED"
    SYNCING = "SYNCING"
    SYNCED = "SYNCED"
    FAILED_RETRYING = "FAILED_RETRYING"
    CONFLICT = "CONFLICT"
    FAILED_REQUIRES_ACTION = "FAILED_REQUIRES_ACTION"


class SyncOperationType(StrEnum):
    CASE_CREATE = "CASE_CREATE"
    CASE_COMMENT = "CASE_COMMENT"
    CASE_STATUS = "CASE_STATUS"
    CASE_VERIFY = "CASE_VERIFY"
    NOTICE_READ = "NOTICE_READ"
    NOTICE_ACTION = "NOTICE_ACTION"
    NOTIFICATION_READ = "NOTIFICATION_READ"
    GATE_LOG = "GATE_LOG"


class AuditEventType(StrEnum):
    CASE_CREATED = "CASE_CREATED"
    CASE_UPDATED = "CASE_UPDATED"
    CASE_ROUTED = "CASE_ROUTED"
    CASE_ASSIGNED = "CASE_ASSIGNED"
    CASE_ESCALATED = "CASE_ESCALATED"
    CASE_CLASSIFIED = "CASE_CLASSIFIED"
    APPROVAL_REQUESTED = "APPROVAL_REQUESTED"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    STATUS_CHANGED = "STATUS_CHANGED"
    COMMENT_ADDED = "COMMENT_ADDED"
    EVIDENCE_ATTACHED = "EVIDENCE_ATTACHED"
    RESOLVED = "RESOLVED"
    VERIFIED = "VERIFIED"
    REOPENED = "REOPENED"
    SLA_BREACHED = "SLA_BREACHED"
    SLA_AT_RISK = "SLA_AT_RISK"
    NOTIFICATION_SENT = "NOTIFICATION_SENT"
    NOTIFICATION_READ = "NOTIFICATION_READ"
    NOTIFICATION_ACTIONED = "NOTIFICATION_ACTIONED"
    NOTIFICATION_CHANNELS_UPDATED = "NOTIFICATION_CHANNELS_UPDATED"
    NOTICE_PUBLISHED = "NOTICE_PUBLISHED"
    NOTICE_READ = "NOTICE_READ"
    NOTICE_ACKNOWLEDGED = "NOTICE_ACKNOWLEDGED"
    NOTICE_SHARED = "NOTICE_SHARED"
    DOCUMENT_GENERATED = "DOCUMENT_GENERATED"
    GATE_ENTRY = "GATE_ENTRY"
    GATE_EXIT = "GATE_EXIT"
    SYNCED = "SYNCED"
    SYNC_CONFLICT = "SYNC_CONFLICT"
    SYNC_FAILED = "SYNC_FAILED"
    AUTH_LOGIN = "AUTH_LOGIN"
    AUTH_FAILED = "AUTH_FAILED"
    AUTH_DENIED = "AUTH_DENIED"
    AGENT_QUERY = "AGENT_QUERY"
    AGENT_ACTION = "AGENT_ACTION"
    DATA_IMPORT = "DATA_IMPORT"
    DATA_EXPORT = "DATA_EXPORT"
    SEED_RESET = "SEED_RESET"


class ActorKind(StrEnum):
    USER = "USER"
    AGENT = "AGENT"
    SYSTEM = "SYSTEM"
    INTEGRATION = "INTEGRATION"


class PolicyEffect(StrEnum):
    ALLOW = "ALLOW"
    DENY = "DENY"
    REQUIRE = "REQUIRE"


class DocumentKind(StrEnum):
    BONAFIDE_CERTIFICATE = "BONAFIDE_CERTIFICATE"
    FEE_RECEIPT = "FEE_RECEIPT"
    GATE_PASS = "GATE_PASS"
    OTHER = "OTHER"


class GateDirection(StrEnum):
    ENTRY = "ENTRY"
    EXIT = "EXIT"


class GatePassState(StrEnum):
    ISSUED = "ISSUED"
    PARTIALLY_USED = "PARTIALLY_USED"
    USED = "USED"
    EXPIRED = "EXPIRED"
    REVOKED = "REVOKED"


# --- Derived status sets used by the case engine -------------------------

OPEN_STATUSES: frozenset[str] = frozenset(
    {
        CaseStatus.SUBMITTED.value,
        CaseStatus.VALIDATING.value,
        CaseStatus.ROUTED.value,
        CaseStatus.ASSIGNED.value,
        CaseStatus.IN_PROGRESS.value,
        CaseStatus.WAITING_FOR_USER.value,
        CaseStatus.WAITING_FOR_APPROVAL.value,
        CaseStatus.ESCALATED.value,
        CaseStatus.RESOLVED.value,
        CaseStatus.VERIFICATION_REQUIRED.value,
        CaseStatus.REOPENED.value,
    }
)

# Statuses where someone still owes the requester action.
PENDING_HUMAN_STATUSES: frozenset[str] = frozenset(
    {
        CaseStatus.SUBMITTED.value,
        CaseStatus.VALIDATING.value,
        CaseStatus.ROUTED.value,
        CaseStatus.ASSIGNED.value,
        CaseStatus.IN_PROGRESS.value,
        CaseStatus.WAITING_FOR_APPROVAL.value,
        CaseStatus.ESCALATED.value,
        CaseStatus.VERIFICATION_REQUIRED.value,
        CaseStatus.REOPENED.value,
    }
)

CLOSED_STATUSES: frozenset[str] = frozenset(
    {CaseStatus.CLOSED.value, CaseStatus.CANCELLED.value}
)
