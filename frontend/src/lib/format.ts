/** Formatting helpers shared by every layout. */

import type { CaseStatus, Priority, SlaState } from './types'

const dateFmt = new Intl.DateTimeFormat(undefined, { day: '2-digit', month: 'short' })
const dateTimeFmt = new Intl.DateTimeFormat(undefined, {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})
const timeFmt = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' })

export function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export function shortDate(value: string | null | undefined): string {
  const date = parseDate(value)
  return date ? dateFmt.format(date) : '—'
}

export function dateTime(value: string | null | undefined): string {
  const date = parseDate(value)
  return date ? dateTimeFmt.format(date) : '—'
}

export function timeOnly(value: string | null | undefined): string {
  const date = parseDate(value)
  return date ? timeFmt.format(date) : ''
}

/** "3h ago", "in 40m" - the unit people actually think in on a queue screen. */
export function relative(value: string | null | undefined, now: Date = new Date()): string {
  const date = parseDate(value)
  if (!date) return '—'
  const diffMs = date.getTime() - now.getTime()
  const future = diffMs > 0
  const minutes = Math.round(Math.abs(diffMs) / 60000)
  const text =
    minutes < 1
      ? 'just now'
      : minutes < 60
        ? `${minutes}m`
        : minutes < 60 * 24
          ? `${Math.round(minutes / 60)}h`
          : `${Math.round(minutes / (60 * 24))}d`
  if (text === 'just now') return text
  return future ? `in ${text}` : `${text} ago`
}

export function duration(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return '—'
  if (minutes < 60) return `${Math.round(minutes)} min`
  if (minutes < 60 * 24) return `${(minutes / 60).toFixed(1)} h`
  return `${(minutes / (60 * 24)).toFixed(1)} d`
}

export const STATUS_LABELS: Record<CaseStatus, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  VALIDATING: 'Validating',
  ROUTED: 'Routed',
  ASSIGNED: 'Assigned',
  IN_PROGRESS: 'In progress',
  WAITING_FOR_USER: 'Waiting for you',
  WAITING_FOR_APPROVAL: 'Awaiting approval',
  ESCALATED: 'Escalated',
  RESOLVED: 'Resolved',
  VERIFICATION_REQUIRED: 'Needs verification',
  CLOSED: 'Closed',
  REOPENED: 'Reopened',
  CANCELLED: 'Cancelled',
}

export type Tone = 'open' | 'progress' | 'blocked' | 'done' | 'dead' | 'urgent' | 'warn' | 'ghost'

export function statusTone(status: CaseStatus): Tone {
  switch (status) {
    case 'CLOSED':
    case 'RESOLVED':
      return 'done'
    case 'CANCELLED':
      return 'dead'
    case 'ESCALATED':
      return 'urgent'
    case 'WAITING_FOR_APPROVAL':
    case 'WAITING_FOR_USER':
    case 'VERIFICATION_REQUIRED':
      return 'blocked'
    case 'IN_PROGRESS':
    case 'REOPENED':
      return 'progress'
    default:
      return 'open'
  }
}

export function slaTone(sla: SlaState): Tone {
  switch (sla) {
    case 'BREACHED':
      return 'urgent'
    case 'AT_RISK':
      return 'warn'
    case 'MET':
      return 'done'
    case 'MISSED':
      return 'dead'
    case 'NO_SLA':
      return 'ghost'
    default:
      return 'open'
  }
}

export function slaLabel(sla: SlaState): string {
  switch (sla) {
    case 'BREACHED':
      return 'Breached'
    case 'AT_RISK':
      return 'At risk'
    case 'MET':
      return 'On time'
    case 'MISSED':
      return 'Late'
    case 'NO_SLA':
      return 'No target'
    default:
      return 'On time'
  }
}

export function priorityTone(priority: Priority): Tone {
  switch (priority) {
    case 'CRITICAL':
    case 'URGENT':
      return 'urgent'
    case 'HIGH':
      return 'warn'
    case 'LOW':
      return 'ghost'
    default:
      return 'open'
  }
}

const NOTICE_TONES: Record<string, Tone> = {
  NORMAL: 'ghost',
  IMPORTANT: 'open',
  URGENT: 'warn',
  EMERGENCY: 'urgent',
}

export function noticeTone(type: string): Tone {
  return NOTICE_TONES[type] || 'ghost'
}

/** Human label for an audit/case event type such as CASE_ASSIGNED. */
export function eventLabel(eventType: string): string {
  const overrides: Record<string, string> = {
    CASE_CREATED: 'Case created',
    CASE_CLASSIFIED: 'Classified',
    CASE_ROUTED: 'Routed to department',
    CASE_ASSIGNED: 'Assigned',
    CASE_ESCALATED: 'Escalated',
    APPROVAL_REQUESTED: 'Approval requested',
    APPROVED: 'Approved',
    REJECTED: 'Rejected',
    STATUS_CHANGED: 'Status changed',
    COMMENT_ADDED: 'Comment added',
    EVIDENCE_ATTACHED: 'Evidence attached',
    RESOLVED: 'Resolved',
    VERIFIED: 'Verified by requester',
    REOPENED: 'Reopened',
    SLA_BREACHED: 'SLA breached',
    SLA_AT_RISK: 'SLA at risk',
    NOTIFICATION_SENT: 'Notification sent',
    NOTIFICATION_READ: 'Notification read',
    NOTICE_PUBLISHED: 'Notice published',
    NOTICE_READ: 'Notice read',
    NOTICE_ACKNOWLEDGED: 'Notice acknowledged',
    NOTICE_SHARED: 'Notice shared',
    DOCUMENT_GENERATED: 'Document generated',
    GATE_EXIT: 'Gate exit',
    GATE_ENTRY: 'Gate entry',
    SYNCED: 'Synced from offline queue',
    SYNC_CONFLICT: 'Sync conflict',
    SYNC_FAILED: 'Sync failed',
    GATE_RETURN_VERIFIED: 'Return verified',
  }
  return overrides[eventType] || eventType.replaceAll('_', ' ').toLowerCase()
}

export function initials(name: string | null | undefined): string {
  if (!name) return '—'
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

export function bytes(value: number): string {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

export function percent(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined) return '—'
  return `${(value * 100).toFixed(digits)}%`
}
