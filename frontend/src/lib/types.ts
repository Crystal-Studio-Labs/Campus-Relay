/** Shared API types. Kept intentionally close to the server serialisers so a
 *  field rename shows up as a type error rather than a silent `undefined`. */

export type RoleKey =
  | 'SUPER_ADMIN'
  | 'ADMIN'
  | 'WARDEN'
  | 'DEPARTMENT_HEAD'
  | 'STAFF'
  | 'SECURITY'
  | 'HELPDESK_OPERATOR'
  | 'STUDENT'

export type CaseStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'VALIDATING'
  | 'ROUTED'
  | 'ASSIGNED'
  | 'IN_PROGRESS'
  | 'WAITING_FOR_USER'
  | 'WAITING_FOR_APPROVAL'
  | 'ESCALATED'
  | 'RESOLVED'
  | 'VERIFICATION_REQUIRED'
  | 'CLOSED'
  | 'REOPENED'
  | 'CANCELLED'

export type Priority = 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL' | 'URGENT'
export type SlaState = 'NO_SLA' | 'ON_TIME' | 'AT_RISK' | 'BREACHED' | 'MET' | 'MISSED'
export type SourceChannel =
  | 'PWA'
  | 'WEB_DESKTOP'
  | 'KIOSK'
  | 'ASSISTED_DESK'
  | 'QR'
  | 'PHONE'
  | 'EMAIL'
  | 'WALK_IN'
  | 'AGENT'
  | 'SYSTEM'

export type SyncStatus =
  | 'QUEUED'
  | 'SYNCING'
  | 'SYNCED'
  | 'FAILED_RETRYING'
  | 'CONFLICT'
  | 'FAILED_REQUIRES_ACTION'

export interface Profile {
  id: number
  full_name: string
  email: string
  role: RoleKey
  language: string
  phone?: string | null
  campus?: { id: number; name: string | null }
  permissions: string[]
  must_change_password?: boolean
  student?: StudentProfile
  staff?: {
    id: number
    designation: string
    department_id: number | null
    department: string | null
    open_cases: number
    workload_capacity: number
  }
}

export interface StudentProfile {
  id: number
  roll_number: string
  full_name: string
  branch: string | null
  branch_id: number | null
  year: string | null
  year_id: number | null
  batch: string | null
  batch_id: number | null
  hostel: string | null
  hostel_id: number | null
  room: string | null
  room_id: number | null
  is_hosteller: boolean
  has_smartphone: boolean
  dues_amount: number
  dues_paid: number
  dues_balance: number
}

export interface LocationBrief {
  id: number
  code: string
  name: string
  kind: string
  building?: string | null
  hostel?: string | null
  room?: string | null
  department_id?: number | null
}

export interface CaseBrief {
  id: number
  case_number: string
  title: string
  service_key: string
  service_name: string
  category: string
  subcategory: string | null
  priority: Priority
  status: CaseStatus
  sla_state: SlaState
  due_at: string | null
  created_at: string
  updated_at: string
  last_activity_at: string
  resolved_at: string | null
  closed_at: string | null
  age_minutes: number
  escalation_level: number
  reopen_count: number
  verification_state: string
  source_channel: SourceChannel
  language: string
  location: LocationBrief | null
  department_id: number | null
  assigned_staff_id: number | null
  current_step_key: string | null
  dedupe_state: string
  parent_case_id: number | null
  client_ref: string | null
  captured_offline_at: string | null
  requester?: { id: number; full_name: string; email: string; role: RoleKey } | null
  requester_role?: RoleKey
  requester_student?: {
    id: number
    full_name: string
    roll_number: string
    hostel: string | null
    room: string | null
  } | null
}

export interface TimelineEntry {
  id: number
  event_type: string
  at: string
  from_status: CaseStatus | null
  to_status: CaseStatus | null
  step_key: string | null
  actor_role: string | null
  actor_kind: string
  actor_name: string | null
  source_channel: SourceChannel
  payload: Record<string, unknown>
}

export interface CaseApproval {
  id: number
  step_key: string
  approver_role: RoleKey
  state: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'EXPIRED'
  requested_at: string
  decided_at: string | null
  decided_by: number | null
  note: string | null
  waiting_minutes: number | null
}

export interface CaseDetail extends CaseBrief {
  description: string
  resolution_note: string | null
  state_payload: Record<string, any>
  sla_minutes: number | null
  first_response_at: string | null
  breached_at: string | null
  required_approvals: string[]
  duplicate_group_id: string | null
  dedupe_score: number | null
  asset: { id: number; code: string; name: string; state: string } | null
  department: string | null
  assigned_staff: { id: number; name: string | null; designation: string; department: string | null } | null
  timeline: TimelineEntry[]
  comments: {
    id: number
    body: string
    visibility: string
    author_id: number | null
    author_name: string
    author_role: string | null
    created_at: string
    source_channel: SourceChannel
  }[]
  attachments: {
    id: number
    filename: string
    kind: string
    content_type: string
    size_bytes: number
    created_at: string
    url: string
    note: string | null
  }[]
  approvals: CaseApproval[]
  workflow_steps: {
    key: string
    name: string
    type: string
    responsible_role: RoleKey | null
    sla_minutes: number | null
    requires_note: boolean
    transitions: Record<string, string>
    instructions: string | null
    is_current: boolean
  }[]
  gate_pass: {
    id: number
    pass_code: string
    state: string
    valid_from: string
    valid_to: string
    destination: string | null
    qr_payload: string | null
    is_currently_valid: boolean
  } | null
  document: {
    id: number
    kind: string
    title: string
    serial_no: string
    verification_code: string
    issued_at: string
    sha256: string | null
    download_url: string
  } | null
}

export interface ServiceDefinition {
  id: number
  key: string
  name: string
  description: string | null
  category: string
  icon: string
  default_priority: Priority
  default_sla_minutes: number
  allowed_requester_roles: RoleKey[]
  form_schema: FormField[]
  requires_attachment: boolean
  department_id: number | null
  workflow_id: number | null
  sort_order: number
  is_active: boolean
  can_raise?: boolean
}

export interface FormField {
  name: string
  label: string
  type: 'text' | 'textarea' | 'date' | 'select' | 'location' | 'number'
  required?: boolean
  options?: string[]
}

export interface NoticeBrief {
  id: number
  title: string
  content: string
  summary: string | null
  notice_type: 'NORMAL' | 'IMPORTANT' | 'URGENT' | 'EMERGENCY'
  status: 'DRAFT' | 'SCHEDULED' | 'PUBLISHED' | 'EXPIRED' | 'ARCHIVED'
  priority: Priority
  category: string
  publish_at: string | null
  expires_at: string | null
  published_at: string | null
  is_pinned: boolean
  acknowledgement_required: boolean
  required_action: string | null
  required_action_label: string | null
  audience_summary: string | null
  share_enabled: boolean
  share_token: string | null
  attachment_name: string | null
  has_attachment: boolean
  has_image: boolean
  created_by: string | null
  created_at: string
  targets: { target_type: string; target_id: number | null; label: string | null }[]
  my_state?: {
    delivered_at: string | null
    read_at: string | null
    acknowledged_at: string | null
    action_completed_at: string | null
    needs_acknowledgement: boolean
  }
  analytics?: NoticeAnalytics
}

export interface NoticeAnalytics {
  notice_id: number
  status: string
  type: string
  audience_summary: string | null
  sent: number
  delivered: number
  read: number
  acknowledged: number
  actioned: number
  pending: number
  read_rate: number
  action_rate: number
  acknowledgement_required: boolean
  by_role: Record<string, number>
}

export interface AppNotification {
  id: number
  category: string
  title: string
  body: string
  priority: Priority
  state: string
  action_label: string | null
  action_type: string | null
  action_target: string | null
  case_id: number | null
  notice_id: number | null
  created_at: string
  delivered_at: string | null
  read_at: string | null
  actioned_at: string | null
  is_read: boolean
}

export interface OutboxOperation {
  idempotency_key: string
  operation:
    | 'CASE_CREATE'
    | 'CASE_COMMENT'
    | 'CASE_STATUS'
    | 'CASE_VERIFY'
    | 'NOTICE_READ'
    | 'NOTICE_ACTION'
    | 'NOTIFICATION_READ'
    | 'GATE_LOG'
  payload: Record<string, any>
  client_base: Record<string, any>
  entity_id?: string | null
  captured_offline_at: string
  label: string
  status: SyncStatus
  attempts: number
  next_attempt_at: number
  last_error: string | null
  conflicts: Record<string, any>
  created_at: number
  case_ref?: string | null
}

export interface DashboardPayload {
  generated_at: string
  open_cases: number
  new_today: number
  sla_breaches: number
  sla_at_risk: number
  awaiting_approval: number
  awaiting_verification: number
  in_progress: number
  resolved_today: number
  reopened_cases: number
  unassigned_cases: number
  average_resolution_minutes: number | null
  recurring_issue_count: number
  recurring_issues: RecurringIssue[]
  by_status: { key: string; count: number }[]
  by_category: { category: string; service_key: string; count: number }[]
  by_department: { department_id: number; name: string; total_cases: number; open_cases: number }[]
  ageing: { label: string; count: number }[]
  staff_workload: StaffWorkload[]
  sla_compliance: {
    window_days: number
    cases: number
    resolved_within_target: number
    resolved_after_target: number
    open_past_target: number
    compliance_rate: number | null
  }
}

export interface StaffWorkload {
  staff_id: number
  name: string
  department_id: number | null
  open_cases: number
  capacity: number
  utilisation: number
  is_available: boolean
  designation?: string | null
  department?: string | null
  at_risk_or_breached?: number
}

export interface RecurringIssue {
  scope: string
  label: string
  case_count: number
  case_ids: number[]
  case_numbers: string[]
  window_days: number
  last_incident: string | null
  average_resolution_minutes: number | null
  category: string | null
}

export interface AgentBriefing {
  summary: string
  findings: { kind: string; headline: string; detail: string; evidence: Record<string, any>; severity: string }[]
  recommendations: {
    type: string
    action: string
    title: string
    reason: string
    case_ids?: number[]
    case_numbers?: string[]
    staff_id?: number
    evidence?: Record<string, any>
  }[]
  engine: string
  generated_at: string
  disclaimer: string
}

export interface AssistantAnswer {
  answer: string
  intent: string
  evidence: { tool: string; ok: boolean; data: any; error: string | null }[]
  proposed_action: { type: string; payload: Record<string, any> } | null
  engine: string
  fallback_reason: string | null
  suggestions: string[]
}

export interface GateVerification {
  valid: boolean
  reason: string | null
  pass?: { code: string; state: string; valid_from: string; valid_to: string; destination: string | null }
  student?: { id: number | null; name: string | null; roll_number: string | null; room: string | null; hostel: string | null }
  case?: { id: number | null; case_number: string | null; status: string | null; url?: string }
}

export interface MetaPayload {
  app: string
  env: string
  demo_mode: boolean
  server_time: string
  clock_offset_minutes: number
  agents: { provider: string; remote: boolean; mode: string; note: string }
  notification_channels: Record<string, { configured: boolean; note: string }>
  external_messaging: { configured: boolean; note: string }
  demo_data: boolean
}
