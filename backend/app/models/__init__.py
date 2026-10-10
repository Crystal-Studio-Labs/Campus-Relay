"""ORM model registry.

Importing this package registers every table on Base.metadata. Alembic and the
seed scripts rely on that.
"""

from app.models.academics import AttendanceRecord, Mark, Subject, TimetableSlot
from app.models.base import Base, SurrogateIdMixin, TimestampMixin, utcnow
from app.models.career import JobApplication, JobPosting
from app.models.case import (
    AuditLog,
    Case,
    CaseApproval,
    CaseAssignment,
    CaseAttachment,
    CaseComment,
    CaseEvent,
)
from app.models.clearance import ClearanceRequest
from app.models.comms import (
    Notification,
    NotificationDelivery,
    NotificationEvent,
    NotificationPreference,
    Notice,
    NoticeAction,
    NoticeRecipient,
    NoticeShare,
    NoticeTarget,
)
from app.models.engagement import Activity, ActivityRegistration, Feedback, FeedbackRequest
from app.models.finance import FeeRecord, Payment
from app.models.hrms import Payslip, StaffLeave
from app.models.identity import (
    Device,
    Permission,
    Role,
    RolePermission,
    Staff,
    Student,
    User,
)
from app.models.immutability import ImmutableRecordError, register_immutability_guards
from app.models.leave import LeaveApplication
from app.models.library import Book, BookLoan
from app.models.org import (
    AcademicYear,
    Asset,
    Batch,
    Block,
    Branch,
    Campus,
    Department,
    Hostel,
    Location,
    Room,
)
from app.models.security import Document, GateLog, GatePass
from app.models.sync import SyncOperation
from app.models.workflow import Policy, Service, SlaRule, Workflow, WorkflowStep

__all__ = [
    "Base",
    "SurrogateIdMixin",
    "TimestampMixin",
    "utcnow",
    "register_immutability_guards",
    "ImmutableRecordError",
    # academics
    "Subject",
    "AttendanceRecord",
    "Mark",
    "TimetableSlot",
    # finance
    "FeeRecord",
    "Payment",
    # campus services
    "ClearanceRequest",
    "Book",
    "BookLoan",
    "LeaveApplication",
    "Feedback",
    "FeedbackRequest",
    "Activity",
    "ActivityRegistration",
    "JobPosting",
    "JobApplication",
    "StaffLeave",
    "Payslip",
    # org
    "Campus",
    "Department",
    "Branch",
    "AcademicYear",
    "Batch",
    "Hostel",
    "Block",
    "Room",
    "Location",
    "Asset",
    # identity
    "User",
    "Role",
    "Permission",
    "RolePermission",
    "Student",
    "Staff",
    "Device",
    # workflow config
    "Workflow",
    "WorkflowStep",
    "Service",
    "Policy",
    "SlaRule",
    # case
    "Case",
    "CaseEvent",
    "CaseAssignment",
    "CaseApproval",
    "CaseComment",
    "CaseAttachment",
    "AuditLog",
    # comms
    "Notice",
    "NoticeTarget",
    "NoticeRecipient",
    "NoticeAction",
    "NoticeShare",
    "Notification",
    "NotificationEvent",
    "NotificationPreference",
    "NotificationDelivery",
    # security
    "GatePass",
    "GateLog",
    "Document",
    # sync
    "SyncOperation",
]
