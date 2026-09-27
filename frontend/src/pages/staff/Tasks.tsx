/** Staff tasks.
 *
 *  A technician's day, not an administrator's overview. Ordered by what will
 *  breach first, with the two actions that actually happen on the floor: start
 *  work and mark resolved — both of which work offline because basements and
 *  rooftop water tanks have no signal.
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError, api, qs } from '../../lib/api'
import { duration, relative } from '../../lib/format'
import { enqueue } from '../../lib/offline'
import { useRemote, useSyncState } from '../../state/hooks'
import { useSession } from '../../state/session'
import type { CaseBrief } from '../../lib/types'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  LoadingState,
  Modal,
  PageHeader,
  SectionTitle,
  Tabs,
  TextArea,
} from '../../components/ui'
import { CaseStatusBadge, PriorityBadge, SlaBadge } from '../../components/StatusChip'

interface CasePage {
  total: number
  cases: CaseBrief[]
}

export function StaffTasks() {
  const navigate = useNavigate()
  const sync = useSyncState()
  const { profile } = useSession()
  const [tab, setTab] = useState<'risk' | 'active' | 'done'>('risk')
  const [busy, setBusy] = useState<number | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [resolveFor, setResolveFor] = useState<CaseBrief | null>(null)
  const [note, setNote] = useState('')

  const query = buildQuery(tab)
  const { data, loading, error: loadError, refresh } = useRemote<CasePage>(
    `staff-tasks-${tab}`,
    () => api.get<CasePage>(`/cases${query}`),
    { cacheKey: 'staff_tasks' },
  )

  const cases = data?.cases ?? []
  const atRisk = cases.filter((item) => item.sla_state === 'BREACHED' || item.sla_state === 'AT_RISK')
  const normal = cases.filter((item) => item.sla_state !== 'BREACHED' && item.sla_state !== 'AT_RISK')

  const act = async (item: CaseBrief, action: 'start' | 'resolve', noteText?: string) => {
    setBusy(item.id)
    setError(null)
    setMessage(null)
    try {
      await api.post(`/cases/${item.id}/${action}`, action === 'resolve' ? { note: noteText } : {})
      setMessage(action === 'resolve' ? `${item.case_number} marked resolved — the requester will confirm.` : `${item.case_number} started.`)
      setResolveFor(null)
      setNote('')
      await refresh()
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 0) {
        await enqueue({
          operation: 'CASE_STATUS',
          payload: { case_id: item.id, action, note: noteText },
          client_base: { status: item.status, updated_at: item.updated_at },
          entity_id: String(item.id),
          label: action === 'resolve' ? 'Mark resolved' : 'Start work',
          case_ref: item.case_number,
        })
        setMessage('Saved on this device — it will reach the server when you have a signal.')
        setResolveFor(null)
        setNote('')
        void sync.flush()
      } else {
        setError(requestError instanceof ApiError ? requestError.message : 'That did not work.')
      }
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="stack-lg">
      <PageHeader
        title="My tasks"
        subtitle={`${profile?.staff?.department ?? 'Unassigned department'} · ${profile?.staff?.open_cases ?? 0} of ${profile?.staff?.workload_capacity ?? '—'} slots used`}
        actions={
          <Button variant="ghost" onClick={() => void refresh()}>
            Refresh
          </Button>
        }
      />

      {message ? <div className="banner banner-info" role="status">{message}</div> : null}
      {error ? <div className="banner banner-error" role="alert">{error}</div> : null}
      {!sync.online ? (
        <div className="banner banner-offline">
          Offline. You can still start and finish work — each action is recorded on this device and sent later.
        </div>
      ) : null}

      <div data-guide="tasks-tabs">
        <Tabs
          tabs={[
            { id: 'risk', label: 'Needs attention', count: atRisk.length },
            { id: 'active', label: 'In progress', count: normal.length },
            { id: 'done', label: 'Recently closed' },
          ]}
          active={tab}
          onChange={setTab}
        />
      </div>

      {loading && !cases.length ? <LoadingState label="Loading your tasks" /> : null}
      {loadError && !cases.length ? (
        <ErrorState message={loadError} onRetry={() => void refresh()} offline={!sync.online} />
      ) : null}
      {!loading && cases.length === 0 ? (
        <EmptyState
          title="Nothing assigned to you right now"
          detail="When a case is routed to you it appears here, ordered by what will breach first."
        />
      ) : null}

      <ul className="list-reset stack">
        {(tab === 'risk' ? atRisk : normal).map((item) => (
          <Card
            as="li"
            key={item.id}
            data-guide="tasks-card"
            accent={item.sla_state === 'BREACHED' ? 'urgent' : undefined}
          >
            <div className="row wrap" style={{ gap: 6 }}>
              <span className="mono small muted">{item.case_number}</span>
              <CaseStatusBadge status={item.status} />
              <PriorityBadge priority={item.priority} />
              <SlaBadge state={item.sla_state} dueAt={item.due_at} />
              {item.source_channel === 'KIOSK' || item.source_channel === 'ASSISTED_DESK' ? (
                <Badge tone="ghost">filed at a desk</Badge>
              ) : null}
            </div>
            <h3 style={{ marginTop: 6 }}>{item.title}</h3>
            <div className="small muted">
              {item.location ? `${item.location.name} (${item.location.code})` : 'location not recorded'}
              {' · '}
              {item.requester_student
                ? `${item.requester_student.full_name}, Room ${item.requester_student.room ?? '—'}`
                : item.requester?.full_name ?? ''}
            </div>
            <div className="tiny muted">
              Open {duration(item.age_minutes)} · updated {relative(item.last_activity_at)}
            </div>

            <div className="row wrap" style={{ marginTop: 10 }}>
              {['ROUTED', 'ASSIGNED', 'REOPENED'].includes(item.status) ? (
                <Button variant="primary" busy={busy === item.id} onClick={() => void act(item, 'start')}>
                  Start work
                </Button>
              ) : null}
              {!['RESOLVED', 'CLOSED', 'CANCELLED'].includes(item.status) ? (
                <Button variant="success" onClick={() => { setResolveFor(item); setNote('') }}>
                  Mark resolved
                </Button>
              ) : null}
              <Button variant="ghost" onClick={() => navigate(`/cases/${item.id}`)}>
                Full details
              </Button>
            </div>
          </Card>
        ))}
      </ul>

      <Modal
        open={Boolean(resolveFor)}
        onClose={() => setResolveFor(null)}
        title={`Finish ${resolveFor?.case_number ?? ''}`}
        footer={
          <Button
            variant="success"
            block
            busy={busy === resolveFor?.id}
            onClick={() => resolveFor && void act(resolveFor, 'resolve', note)}
          >
            Mark resolved
          </Button>
        }
      >
        <SectionTitle>What did you do?</SectionTitle>
        <Field label="Work note" hint="The requester reads this before confirming the fix.">
          <TextArea value={note} onChange={setNote} rows={4} placeholder="Replaced the regulator and tested for 10 minutes." />
        </Field>
        <p className="small muted">
          Mention the part you used. That is what makes a repeat failure diagnosable instead of a mystery.
        </p>
      </Modal>
    </div>
  )
}

/** Small helper so the tab-to-query mapping stays in one place. */
function buildQuery(tab: 'risk' | 'active' | 'done'): string {
  if (tab === 'risk') return qs({ assigned_to_me: true, open_only: true, sort: 'due' })
  if (tab === 'active') return qs({ assigned_to_me: true, status: 'IN_PROGRESS', sort: 'due' })
  return qs({ assigned_to_me: true, status: 'CLOSED', sort: 'recent' })
}
