"""Request models for the v1 API.

They validate shape and bounds only. Business rules (policy, workflow, RBAC,
tenancy) live in the service layer so that every channel - web, kiosk, agent,
sync replay - is held to the same standard.
"""

from datetime import datetime

from pydantic import BaseModel, Field, field_validator

MAX_TEXT = 4000


class LoginRequest(BaseModel):
    email: str
    password: str = Field(min_length=4, max_length=200)


class CaseCreateRequest(BaseModel):
    service_key: str = Field(min_length=2, max_length=48)
    description: str = Field(default="", max_length=MAX_TEXT)
    title: str | None = Field(default=None, max_length=200)
    category: str | None = Field(default=None, max_length=48)
    subcategory: str | None = Field(default=None, max_length=64)
    priority: str | None = None
    location_id: int | None = None
    location_code: str | None = Field(default=None, max_length=48)
    asset_id: int | None = None
    state_payload: dict = Field(default_factory=dict)
    language: str = Field(default="en", max_length=8)
    on_behalf_student_id: int | None = None
    client_ref: str | None = Field(default=None, max_length=80)
    captured_offline_at: datetime | None = None

    @field_validator("description", "title")
    @classmethod
    def _strip(cls, value):
        return value.strip() if isinstance(value, str) else value


class CommentRequest(BaseModel):
    body: str = Field(min_length=1, max_length=MAX_TEXT)
    visibility: str = "PUBLIC"
    client_ref: str | None = Field(default=None, max_length=80)


class AssignRequest(BaseModel):
    staff_id: int
    reason: str | None = Field(default=None, max_length=240)


class DecisionRequest(BaseModel):
    approve: bool
    note: str | None = Field(default=None, max_length=MAX_TEXT)


class ResolveRequest(BaseModel):
    note: str | None = Field(default=None, max_length=MAX_TEXT)
    evidence_note: str | None = Field(default=None, max_length=MAX_TEXT)


class VerifyRequest(BaseModel):
    accepted: bool = True
    note: str | None = Field(default=None, max_length=MAX_TEXT)


class ReopenRequest(BaseModel):
    reason: str = Field(min_length=3, max_length=MAX_TEXT)


class CancelRequest(BaseModel):
    reason: str | None = Field(default=None, max_length=MAX_TEXT)


class EscalateRequest(BaseModel):
    reason: str = Field(min_length=3, max_length=MAX_TEXT)
    escalate_to_role: str | None = None


class NoticeTargetRequest(BaseModel):
    target_type: str
    target_id: int | None = None
    # ROLE selectors are keyed by the role's string key (e.g. "STUDENT"), not a
    # row id, so they need a place to carry it.
    target_value: str | None = Field(default=None, max_length=64)
    include: bool = True
    label: str | None = None


class NoticeCreateRequest(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    content: str = Field(min_length=3, max_length=8000)
    summary: str | None = Field(default=None, max_length=300)
    notice_type: str = "NORMAL"
    category: str = "GENERAL"
    priority: str | None = None
    publish_at: datetime | None = None
    expires_at: datetime | None = None
    acknowledgement_required: bool | None = None
    required_action: str | None = None
    required_action_label: str | None = None
    is_pinned: bool = False
    share_enabled: bool = False
    targets: list[NoticeTargetRequest] = Field(default_factory=list)


class NoticeStatusRequest(BaseModel):
    action: str
    when: datetime | None = None


class NoticeShareRequest(BaseModel):
    channel: str = "COPY_LINK"


class NoticeActionRequest(BaseModel):
    action_type: str | None = None
    case_id: int | None = None
    payload: dict = Field(default_factory=dict)


class PreferenceUpdate(BaseModel):
    category: str
    in_app: bool = True
    push: bool = True
    # Optional so an older client that only knows in_app/push still works; the
    # endpoint then leaves the external-channel flags untouched.
    telegram: bool | None = None
    whatsapp: bool | None = None


class ChannelContactUpdate(BaseModel):
    """Where a user can be reached on an external channel.

    Both fields are free-form but validated as strings; Telegram chat ids are
    numeric (or @channelname) and WhatsApp numbers are E.164-ish. An empty
    string clears the address, which makes the channel report "no recipient"
    rather than silently failing.
    """

    telegram_chat_id: str | None = Field(default=None, max_length=64)
    whatsapp_number: str | None = Field(default=None, max_length=24)


class GateMovementRequest(BaseModel):
    direction: str
    pass_code: str | None = Field(default=None, max_length=32)
    student_id: int | None = None
    gate_location_id: int | None = None
    occurred_at: datetime | None = None
    client_ref: str | None = Field(default=None, max_length=80)
    note: str | None = Field(default=None, max_length=240)
    offline_captured_at: datetime | None = None


class GateVerifyRequest(BaseModel):
    pass_code: str = Field(min_length=3, max_length=64)


class SyncOperationRequest(BaseModel):
    idempotency_key: str = Field(min_length=6, max_length=80)
    operation: str
    payload: dict = Field(default_factory=dict)
    client_base: dict = Field(default_factory=dict)
    entity_id: str | None = None
    captured_offline_at: datetime | None = None


class SyncPushRequest(BaseModel):
    device_uid: str | None = Field(default=None, max_length=80)
    operations: list[SyncOperationRequest] = Field(default_factory=list, max_length=50)


class IntakeRequest(BaseModel):
    text: str = Field(min_length=3, max_length=MAX_TEXT)
    service_key: str | None = None
    location_code: str | None = None


class AssistantRequest(BaseModel):
    question: str = Field(min_length=2, max_length=MAX_TEXT)


class AssistantConfirmRequest(BaseModel):
    proposed_action: dict


class KioskLookupRequest(BaseModel):
    roll_number: str = Field(min_length=2, max_length=32)


class KioskCaseRequest(CaseCreateRequest):
    roll_number: str = Field(min_length=2, max_length=32)


class UserCreateRequest(BaseModel):
    email: str
    full_name: str = Field(min_length=2, max_length=160)
    role: str
    password: str = Field(min_length=8, max_length=200)
    phone: str | None = None
    language: str = "en"
    staff_designation: str | None = None
    department_id: int | None = None
    skills: list[str] = Field(default_factory=list)
    student_roll_number: str | None = None
    branch_id: int | None = None
    year_id: int | None = None
    batch_id: int | None = None
    hostel_id: int | None = None


class UserUpdateRequest(BaseModel):
    full_name: str | None = None
    phone: str | None = None
    language: str | None = None
    is_active: bool | None = None
    role: str | None = None


class SlaRuleRequest(BaseModel):
    service_key: str | None = None
    priority: str
    target_minutes: int = Field(gt=0, le=100000)
    at_risk_ratio: float = Field(default=0.75, ge=0.1, le=0.99)
    escalate_to_role: str = "DEPARTMENT_HEAD"
    is_active: bool = True


class PolicyRequest(BaseModel):
    key: str
    name: str
    description: str | None = None
    service_key: str | None = None
    effect: str = "REQUIRE"
    evaluation_order: int = 100
    conditions: dict = Field(default_factory=dict)
    message: str = "Policy check failed"
    is_active: bool = True


class DemoResetRequest(BaseModel):
    confirm: bool = False
    days_of_history: int = Field(default=30, ge=1, le=180)


class InstitutionUpdateRequest(BaseModel):
    """Partial institution configuration written by the onboarding wizard.

    Sections are free-form dicts; the institution loader keeps only the keys it
    recognises, so a typo cannot corrupt the template file.
    """

    identity: dict | None = None
    appearance: dict | None = None
    academics: dict | None = None
    localisation: dict | None = None
    stations: dict | None = None
