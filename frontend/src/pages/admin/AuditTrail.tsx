/** Audit trail.
 *
 *  Append-only and complete: who did what, when, from which channel and device.
 *  This is the screen that makes "the system is accountable" a verifiable claim
 *  rather than a slogan.
 */

import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, qs } from '../../lib/api'
import { dateTime, eventLabel, relative } from '../../lib/format'
import { useRemote } from '../../state/hooks'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  Toolbar,
  SectionTitle,
  Select,
  TextInput,
} from '../../components/ui'

interface AuditEntry {
  id: number
  event_type: string
  at: string
  actor_id: number | null
  actor_role: string | null
  actor_kind: string
  case_id: number | null
  entity_type: string | null
  entity_id: string | null
  source_channel: string
  device_id: string | null
  idempotency_key: string | null
  payload: Record<string, any>
}

const EVENT_TYPES = [
  '',
  'CASE_CREATED',
  'CASE_CLASSIFIED',
  'CASE_ROUTED',
  'CASE_ASSIGNED',
  'CASE_ESCALATED',
  'APPROVAL_REQUESTED',
  'APPROVED',
  'REJECTED',
  'STATUS_CHANGED',
  'COMMENT_ADDED',
  'EVIDENCE_ATTACHED',
  'RESOLVED',
  'VERIFIED',
  'REOPENED',
  'SLA_BREACHED',
  'SLA_AT_RISK',
  'NOTIFICATION_SENT',
  'NOTICE_PUBLISHED',
  'NOTICE_READ',
  'NOTICE_ACKNOWLEDGED',
  'DOCUMENT_GENERATED',
  'GATE_EXIT',
  'GATE_ENTRY',
  'SYNCED',
  'SYNC_CONFLICT',
]

export function AuditTrailPage() {
  const navigate = useNavigate()
  const [eventType, setEventType] = useState('')
  const [entityType, setEntityType] = useState('')
  const [caseId, setCaseId] = useState('')
  const [limit, setLimit] = useState(50)
  const [expanded, setExpanded] = useState<number | null>(null)

  const query = useMemo(
    () =>
      qs({
        event_type: eventType || undefined,
        entity_type: entityType || undefined,
        case_id: caseId.trim() || undefined,
        limit,
      }),
    [eventType, entityType, caseId, limit],
  )

  const { data, loading, error, refresh } = useRemote<{
    total: number
    entries: AuditEntry[]
    immutability_note: string
  }>(`audit${query}`, () => api.get(`/admin/audit${query}`))

  return (
    <div className="stack-lg">
      <PageHeader
        kicker="Insights"
        title="Audit trail"
        subtitle={`${data?.total ?? 0} recorded events · newest first · append-only, enforced by database trigger`}
        actions={
          <Button variant="ghost" onClick={() => void refresh()}>
            Refresh
          </Button>
        }
      />

      <Toolbar
        actions={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setEventType('')
              setEntityType('')
              setCaseId('')
            }}
            disabled={!eventType && !entityType && !caseId}
          >
            Clear filters
          </Button>
        }
      >
        <div className="toolbar-field">
          <label className="sr-only" htmlFor="audit-event">
            Event type
          </label>
          <Select
            id="audit-event"
            value={eventType}
            onChange={setEventType}
            options={EVENT_TYPES.map((value) => ({
              value,
              label: value ? eventLabel(value) : 'All events',
            }))}
          />
        </div>
        <div className="toolbar-field">
          <label className="sr-only" htmlFor="audit-entity">
            Entity
          </label>
          <Select
            id="audit-entity"
            value={entityType}
            onChange={setEntityType}
            options={[
              { value: '', label: 'All entities' },
              { value: 'CASE', label: 'Case' },
              { value: 'NOTICE', label: 'Notice' },
              { value: 'NOTIFICATION', label: 'Notification' },
              { value: 'DOCUMENT', label: 'Document' },
              { value: 'GATE_PASS', label: 'Gate pass' },
              { value: 'USER', label: 'User' },
            ]}
          />
        </div>
        <div className="toolbar-field">
          <label className="sr-only" htmlFor="audit-case">
            Case id
          </label>
          <TextInput id="audit-case" value={caseId} onChange={setCaseId} inputMode="numeric" placeholder="Case id, e.g. 42" />
        </div>
      </Toolbar>

      {loading && !data ? <LoadingState label="Loading the audit trail" /> : null}
      {error && !data ? <ErrorState message={error} onRetry={() => void refresh()} /> : null}

      {data && data.entries.length === 0 ? (
        <EmptyState title="No audit entries match" detail="Widen the filters — nothing was recorded for this selection." />
      ) : null}

      {data?.entries.length ? (
        <div className="results-head">
          <span>
            <span className="results-count">{data.entries.length}</span> of {data.total} events
          </span>
        </div>
      ) : null}

      {data?.entries.length ? (
        <div className="table-wrap become-cards">
          <table className="data">
            <thead>
              <tr>
                <th>When</th>
                <th>Event</th>
                <th>Actor</th>
                <th>Channel</th>
                <th>Entity</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {data.entries.map((entry) => (
                <tr key={entry.id}>
                  <td data-label="When">
                    {dateTime(entry.at)}
                    <div className="tiny muted">{relative(entry.at)}</div>
                  </td>
                  <td data-label="Event">
                    <Badge
                      tone={
                        entry.event_type.includes('BREACH')
                          ? 'urgent'
                          : entry.event_type.includes('ESCALAT')
                            ? 'warn'
                            : entry.event_type.startsWith('SYNC')
                              ? 'progress'
                              : 'ghost'
                      }
                    >
                      {eventLabel(entry.event_type)}
                    </Badge>
                  </td>
                  <td data-label="Actor">
                    {entry.actor_kind === 'SYSTEM' ? (
                      <span className="muted">system</span>
                    ) : (
                      <>
                        <span className="mono tiny">#{entry.actor_id}</span>
                        <div className="tiny muted">{entry.actor_role?.replaceAll('_', ' ').toLowerCase()}</div>
                      </>
                    )}
                  </td>
                  <td data-label="Channel">
                    <span className="small">{entry.source_channel}</span>
                    {entry.device_id ? <div className="tiny muted mono">{entry.device_id}</div> : null}
                  </td>
                  <td data-label="Entity">
                    {entry.entity_type} {entry.entity_id ? `#${entry.entity_id}` : ''}
                    {entry.case_id ? (
                      <div>
                        <Button size="sm" variant="ghost" onClick={() => navigate(`/cases/${entry.case_id}`)}>
                          Open case
                        </Button>
                      </div>
                    ) : null}
                  </td>
                  <td data-label="Detail">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setExpanded(expanded === entry.id ? null : entry.id)}
                    >
                      {expanded === entry.id ? 'Hide' : 'Show'}
                    </Button>
                    {expanded === entry.id ? (
                      <pre className="mono tiny" style={{ whiteSpace: 'pre-wrap', maxWidth: 420 }}>
                        {JSON.stringify(entry.payload, null, 2)}
                      </pre>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {data && data.total > data.entries.length ? (
        <Button variant="info" block onClick={() => setLimit((value) => Math.min(value + 50, 500))}>
          Load more ({data.entries.length} of {data.total})
        </Button>
      ) : null}

      <Card className="card-flat">
        <SectionTitle>Why this cannot be edited</SectionTitle>
        <p className="small">
          {data?.immutability_note ??
            'Audit rows are append-only; the database rejects updates and deletes.'}{' '}
          That is enforced by a database trigger, not by application code, so no future code change can quietly
          rewrite history.
        </p>
      </Card>
    </div>
  )
}
