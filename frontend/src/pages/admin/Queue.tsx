/** The case queue.
 *
 *  Desktop-first and dense: an administrator scans fifty rows and acts on a few.
 *  On a phone the same table degrades into cards rather than forcing a horizontal
 *  scroll. Bulk escalation is included because at 9am that is the actual job.
 */

import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ApiError, api, qs } from '../../lib/api'
import { duration, relative } from '../../lib/format'
import { useRemote, useSyncState } from '../../state/hooks'
import { useSession } from '../../state/session'
import type { CaseBrief } from '../../lib/types'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  Modal,
  PageHeader,
  Select,
  TextArea,
  TextInput,
} from '../../components/ui'
import { CaseStatusBadge, PriorityBadge, SlaBadge } from '../../components/StatusChip'

interface QueuePayload {
  total: number
  cases: CaseBrief[]
}

interface Department {
  id: number
  name: string
  code: string
  open_cases: number
  staff_count: number
}

export function QueuePage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const sync = useSyncState()
  const { can } = useSession()

  const [status, setStatus] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [slaState, setSlaState] = useState(params.get('sla_state') ?? '')
  const [priority, setPriority] = useState('')
  const [unassigned, setUnassigned] = useState(params.get('unassigned') === '1')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<number[]>([])
  const [dialog, setDialog] = useState<'escalate' | 'assign' | null>(null)
  const [reason, setReason] = useState('')
  const [staffId, setStaffId] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const query = useMemo(
    () =>
      qs({
        status: status || undefined,
        department_id: departmentId || undefined,
        sla_state: slaState || undefined,
        priority: priority || undefined,
        unassigned: unassigned || undefined,
        q: search.trim() || undefined,
        limit: 100,
      }),
    [status, departmentId, slaState, priority, unassigned, search],
  )

  const queue = useRemote<QueuePayload>(`admin-cases${query}`, () =>
    api.get<QueuePayload>(`/admin/cases${query}`),
  )
  const departments = useRemote<{ departments: Department[] }>(
    'admin-departments',
    () => api.get<{ departments: Department[] }>('/admin/departments'),
  )
  const staff = useRemote<{ staff: any[] }>(
    can('case:assign') ? 'staff-for-queue' : null,
    () => api.get<{ staff: any[] }>('/admin/staff'),
  )

  const rows = queue.data?.cases ?? []

  const runBulk = async (kind: 'escalate' | 'assign') => {
    setBusy(true)
    setMessage(null)
    let ok = 0
    const failures: string[] = []
    for (const caseId of selected) {
      try {
        if (kind === 'escalate') {
          await api.post(`/cases/${caseId}/escalate`, { reason: reason || 'Bulk escalation from the queue' })
        } else {
          await api.post(`/cases/${caseId}/assign`, { staff_id: Number(staffId), reason: reason || undefined })
        }
        ok += 1
      } catch (error) {
        failures.push(
          `${caseId}: ${error instanceof ApiError ? error.message : 'failed'}`,
        )
      }
    }
    setBusy(false)
    setDialog(null)
    setReason('')
    setSelected([])
    setMessage(
      failures.length
        ? `${ok} of ${selected.length} updated. Failures: ${failures.slice(0, 3).join('; ')}`
        : `${ok} case(s) updated.`,
    )
    void queue.refresh()
  }

  return (
    <div className="stack-lg">
      <PageHeader
        title="Case queue"
        subtitle={`${queue.data?.total ?? 0} cases in scope · unassigned first, then oldest`}
        actions={
          <Button variant="ghost" onClick={() => void queue.refresh()}>
            Refresh
          </Button>
        }
      />

      {message ? <div className="banner banner-info">{message}</div> : null}

      <Card>
        <div className="grid" style={{ gap: 12 }}>
          <div>
            <label className="label" htmlFor="q-search">
              Search
            </label>
            <TextInput id="q-search" value={search} onChange={setSearch} inputMode="search" placeholder="Number, title, description" />
          </div>
          <div>
            <label className="label" htmlFor="q-status">
              Status
            </label>
            <Select
              id="q-status"
              value={status}
              onChange={setStatus}
              options={[
                { value: '', label: 'Open only (default)' },
                { value: 'SUBMITTED', label: 'Submitted' },
                { value: 'ROUTED', label: 'Routed' },
                { value: 'ASSIGNED', label: 'Assigned' },
                { value: 'IN_PROGRESS', label: 'In progress' },
                { value: 'WAITING_FOR_APPROVAL', label: 'Awaiting approval' },
                { value: 'ESCALATED', label: 'Escalated' },
                { value: 'VERIFICATION_REQUIRED', label: 'Awaiting verification' },
                { value: 'RESOLVED', label: 'Resolved' },
                { value: 'CLOSED', label: 'Closed' },
                { value: 'CANCELLED', label: 'Cancelled' },
              ]}
            />
          </div>
          <div>
            <label className="label" htmlFor="q-dept">
              Department
            </label>
            <Select
              id="q-dept"
              value={departmentId}
              onChange={setDepartmentId}
              options={[
                { value: '', label: 'All departments' },
                ...(departments.data?.departments ?? []).map((item) => ({
                  value: String(item.id),
                  label: `${item.name} (${item.open_cases} open)`,
                })),
              ]}
            />
          </div>
          <div>
            <label className="label" htmlFor="q-sla">
              Service target
            </label>
            <Select
              id="q-sla"
              value={slaState}
              onChange={setSlaState}
              options={[
                { value: '', label: 'Any' },
                { value: 'BREACHED', label: 'Breached' },
                { value: 'AT_RISK', label: 'At risk' },
                { value: 'ON_TIME', label: 'Within target' },
              ]}
            />
          </div>
          <div>
            <label className="label" htmlFor="q-priority">
              Urgency
            </label>
            <Select
              id="q-priority"
              value={priority}
              onChange={setPriority}
              options={[
                { value: '', label: 'Any' },
                { value: 'CRITICAL', label: 'Critical' },
                { value: 'HIGH', label: 'High' },
                { value: 'NORMAL', label: 'Normal' },
                { value: 'LOW', label: 'Low' },
              ]}
            />
          </div>
          <div>
            <label className="label" htmlFor="q-unassigned">
              Ownership
            </label>
            <Select
              id="q-unassigned"
              value={unassigned ? '1' : '0'}
              onChange={(value) => setUnassigned(value === '1')}
              options={[
                { value: '0', label: 'All' },
                { value: '1', label: 'Unassigned only' },
              ]}
            />
          </div>
        </div>
      </Card>

      {selected.length ? (
        <Card accent="sun">
          <div className="row-between">
            <span className="bold">{selected.length} selected</span>
            <div className="row wrap">
              {can('case:assign') ? (
                <Button size="sm" variant="info" onClick={() => setDialog('assign')}>
                  Assign
                </Button>
              ) : null}
              {can('case:escalate') ? (
                <Button size="sm" variant="danger" onClick={() => setDialog('escalate')}>
                  Escalate
                </Button>
              ) : null}
              <Button size="sm" variant="ghost" onClick={() => setSelected([])}>
                Clear
              </Button>
            </div>
          </div>
        </Card>
      ) : null}

      {queue.loading && !rows.length ? <LoadingState label="Loading the queue" /> : null}
      {queue.error && !rows.length ? (
        <ErrorState message={queue.error} onRetry={() => void queue.refresh()} offline={!sync.online} />
      ) : null}
      {!queue.loading && rows.length === 0 ? (
        <EmptyState
          title="Queue is clear for these filters"
          detail="Nothing open matches the selection. That is either good news or the wrong filter."
        />
      ) : null}

      {rows.length ? (
        <div className="table-wrap become-cards">
          <table className="data">
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    aria-label="Select all"
                    checked={selected.length === rows.length && rows.length > 0}
                    onChange={(event) => setSelected(event.target.checked ? rows.map((row) => row.id) : [])}
                  />
                </th>
                <th>Case</th>
                <th>Status</th>
                <th>Urgency</th>
                <th>Target</th>
                <th>Where</th>
                <th>Assigned</th>
                <th>Age</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td data-label="Select">
                    <input
                      type="checkbox"
                      aria-label={`Select ${row.case_number}`}
                      checked={selected.includes(row.id)}
                      onChange={(event) =>
                        setSelected((current) =>
                          event.target.checked ? [...current, row.id] : current.filter((id) => id !== row.id),
                        )
                      }
                    />
                  </td>
                  <td data-label="Case">
                    <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/cases/${row.id}`)}>
                      <span className="mono">{row.case_number}</span>
                    </button>
                    <div className="bold">{row.title}</div>
                    <div className="tiny muted">{row.service_name}</div>
                  </td>
                  <td data-label="Status">
                    <CaseStatusBadge status={row.status} />
                  </td>
                  <td data-label="Urgency">
                    <PriorityBadge priority={row.priority} />
                  </td>
                  <td data-label="Target">
                    <SlaBadge state={row.sla_state} dueAt={row.due_at} />
                  </td>
                  <td data-label="Where" className="small">
                    {row.location?.name ?? '—'}
                  </td>
                  <td data-label="Assigned" className="small">
                    {row.assigned_staff_id ? <Badge tone="ghost">assigned</Badge> : <Badge tone="warn">nobody</Badge>}
                  </td>
                  <td data-label="Age" className="small">
                    {duration(row.age_minutes)}
                    <div className="tiny muted">{relative(row.created_at)}</div>
                  </td>
                  <td data-label="Open">
                    <Button size="sm" variant="info" onClick={() => navigate(`/cases/${row.id}`)}>
                      Open
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <Modal
        open={dialog === 'escalate'}
        onClose={() => setDialog(null)}
        title={`Escalate ${selected.length} case(s)`}
        footer={
          <Button variant="danger" block busy={busy} onClick={() => void runBulk('escalate')}>
            Escalate now
          </Button>
        }
      >
        <p className="small">
          Each case gets its own escalation record against your name, and the responsible head is notified. This is
          not a bulk "nudge" — it is a real escalation on every one.
        </p>
        <TextArea value={reason} onChange={setReason} rows={3} placeholder="Repeated water leakage, needs civil works" />
      </Modal>

      <Modal
        open={dialog === 'assign'}
        onClose={() => setDialog(null)}
        title={`Assign ${selected.length} case(s)`}
        footer={
          <Button variant="primary" block busy={busy} disabled={!staffId} onClick={() => void runBulk('assign')}>
            Assign
          </Button>
        }
      >
        <Select
          value={staffId}
          onChange={setStaffId}
          options={[
            { value: '', label: 'Choose a staff member…' },
            ...(staff.data?.staff ?? []).map((item) => ({
              value: String(item.staff_id),
              label: `${item.name ?? 'Staff'} — ${item.open_cases}/${item.capacity} open`,
            })),
          ]}
        />
        <TextArea value={reason} onChange={setReason} rows={2} placeholder="Reason (optional, recorded on each case)" />
      </Modal>
    </div>
  )
}
