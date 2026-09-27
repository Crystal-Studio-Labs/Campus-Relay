/** Status vocabulary.
 *
 *  Every screen that shows a case status uses these, so "Needs verification"
 *  looks the same in the student app, the admin queue and the staff list. The
 *  colours come from one place; if the wording changes it changes everywhere.
 */

import { STATUS_LABELS, relative, slaLabel, priorityTone, slaTone, statusTone } from '../lib/format'
import type { CaseStatus, Priority, SlaState, SyncStatus, SourceChannel } from '../lib/types'
import { Badge } from './ui'

export function CaseStatusBadge({ status }: { status: CaseStatus }) {
  return <Badge tone={statusTone(status)}>{STATUS_LABELS[status] ?? status}</Badge>
}

export function SlaBadge({ state, dueAt }: { state: SlaState; dueAt?: string | null }) {
  if (state === 'NO_SLA') return null
  return (
    <Badge tone={slaTone(state)} title={dueAt ? `Target ${relative(dueAt)}` : undefined}>
      {slaLabel(state)}
      {dueAt ? ` · ${relative(dueAt)}` : ''}
    </Badge>
  )
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  if (priority === 'NORMAL') return null
  return <Badge tone={priorityTone(priority)}>{priority === 'CRITICAL' ? 'Critical' : priority.toLowerCase()}</Badge>
}

const CHANNEL_LABELS: Record<string, string> = {
  PWA: 'Phone app',
  WEB_DESKTOP: 'Web',
  KIOSK: 'Kiosk',
  ASSISTED_DESKTOP: 'Helpdesk',
  ASSISTED_DESK: 'Helpdesk',
  QR: 'QR code',
  PHONE: 'Phone call',
  EMAIL: 'Email',
  WALK_IN: 'Walk-in',
  AGENT: 'Assistant',
  SYSTEM: 'System',
}

export function ChannelBadge({ channel }: { channel: SourceChannel }) {
  return <Badge>{CHANNEL_LABELS[channel] ?? channel}</Badge>
}

const SYNC_LABELS: Record<SyncStatus, string> = {
  QUEUED: 'Queued',
  SYNCING: 'Syncing',
  SYNCED: 'Synced',
  FAILED_RETRYING: 'Failed · retrying',
  CONFLICT: 'Conflict',
  FAILED_REQUIRES_ACTION: 'Needs your action',
}

const SYNC_TONES: Record<SyncStatus, 'ghost' | 'progress' | 'done' | 'warn' | 'urgent'> = {
  QUEUED: 'ghost',
  SYNCING: 'progress',
  SYNCED: 'done',
  FAILED_RETRYING: 'warn',
  CONFLICT: 'urgent',
  FAILED_REQUIRES_ACTION: 'urgent',
}

export function SyncStatusBadge({ status }: { status: SyncStatus }) {
  return <Badge tone={SYNC_TONES[status]}>{SYNC_LABELS[status]}</Badge>
}

/** Offline capture marker: a case filed at 2am with no signal must say so. */
export function OfflineCapturedBadge({ capturedAt }: { capturedAt: string | null }) {
  if (!capturedAt) return null
  return (
    <Badge tone="ghost" title={`Captured on device at ${capturedAt}`}>
      Filed offline
    </Badge>
  )
}
