/** Approvals.
 *
 *  Sorted by how long the requester has been waiting, not by when it arrived.
 *  The decision shows what it is actually approving: a certificate blocked by
 *  dues, a leave request that needs a warden, a purchase over a threshold.
 *
 *  Each row follows the same shape as every other list in the product: identity
 *  and state on top, the title, then a labelled grid of what the decision is
 *  about, then the decision itself.
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError, api } from '../../lib/api'
import { duration, relative } from '../../lib/format'
import { useRemote, useSyncState } from '../../state/hooks'
import type { CaseBrief } from '../../lib/types'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  KV,
  LoadingState,
  Modal,
  PageHeader,
  SectionTitle,
  TextArea,
} from '../../components/ui'
import { CaseStatusBadge, PriorityBadge, SlaBadge } from '../../components/StatusChip'

interface ApprovalRow {
  approval_id: number
  step_key: string
  approver_role: string
  requested_at: string
  waiting_minutes: number
  case: CaseBrief
  state_payload: Record<string, any>
  requester: { id: number; full_name: string; email: string } | null
}

/** A day is the point at which a wait stops being routine. */
const SLOW_AFTER_MINUTES = 1440

export function ApprovalsPage() {
  const navigate = useNavigate()
  const sync = useSyncState()
  const { data, loading, error, refresh } = useRemote<{ pending: number; approvals: ApprovalRow[] }>(
    'approvals',
    () => api.get<{ pending: number; approvals: ApprovalRow[] }>('/approvals'),
    { cacheKey: 'my_approvals' },
  )

  const [dialog, setDialog] = useState<{ row: ApprovalRow; approve: boolean } | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const decide = async () => {
    if (!dialog) return
    setBusy(true)
    setErrorMessage(null)
    try {
      await api.post(`/cases/${dialog.row.case.id}/approval`, { approve: dialog.approve, note: note || undefined })
      setMessage(dialog.approve ? 'Approved — the workflow has moved on.' : 'Rejected — the requester has been told why.')
      setDialog(null)
      setNote('')
      await refresh()
    } catch (requestError) {
      setErrorMessage(requestError instanceof ApiError ? requestError.message : 'The decision could not be recorded.')
    } finally {
      setBusy(false)
    }
  }

  if (loading && !data) return <LoadingState label="Loading approvals" />
  if (error && !data) return <ErrorState message={error} onRetry={() => void refresh()} offline={!sync.online} />

  const rows = data?.approvals ?? []

  return (
    <div className="stack-lg">
      <PageHeader
        kicker="Requests"
        title="Approvals"
        subtitle="Longest wait first — the person at the top has been waiting the longest"
        actions={
          <>
            {data?.pending ? <Badge tone="blocked">{data.pending} waiting</Badge> : null}
            <Button variant="ghost" onClick={() => void refresh()}>
              Refresh
            </Button>
          </>
        }
      />

      {message ? (
        <div className="banner banner-info" role="status">
          {message}
        </div>
      ) : null}
      {errorMessage ? (
        <div className="banner banner-error" role="alert">
          {errorMessage}
        </div>
      ) : null}

      {!rows.length ? (
        <EmptyState
          title="Nothing waiting on you"
          detail="When a request needs your decision it appears here, with how long the requester has been waiting."
        />
      ) : (
        <div className="results-head">
          <span>
            <span className="results-count">{rows.length}</span> waiting for a decision
          </span>
          <span>Longest wait {duration(Math.max(...rows.map((row) => row.waiting_minutes)))}</span>
        </div>
      )}

      <ul className="list-reset stack">
        {rows.map((row) => {
          const slow = row.waiting_minutes > SLOW_AFTER_MINUTES
          return (
            <li key={row.approval_id}>
              <Card as="li" accent={slow ? 'urgent' : 'sun'}>
                <div className="case-row-head">
                  <span className="ident small muted">{row.case.case_number}</span>
                  <CaseStatusBadge status={row.case.status} />
                  <PriorityBadge priority={row.case.priority} />
                  <SlaBadge state={row.case.sla_state} dueAt={row.case.due_at} />
                  <Badge tone="blocked">{row.step_key.replaceAll('_', ' ').toLowerCase()}</Badge>
                  {row.case.location ? <Badge tone="ghost">{row.case.location.name}</Badge> : null}
                </div>

                <h3 className="case-row-title">{row.case.title}</h3>

                <div className="case-row-meta">
                  <div className="case-meta-item">
                    <div className="case-meta-label">Requester</div>
                    <div className="case-meta-value truncate">{row.requester?.full_name ?? 'Unknown requester'}</div>
                  </div>
                  <div className="case-meta-item">
                    <div className="case-meta-label">Service</div>
                    <div className="case-meta-value truncate">{row.case.service_name}</div>
                  </div>
                  <div className="case-meta-item">
                    <div className="case-meta-label">Waiting</div>
                    <div className={`case-meta-value${slow ? ' bold' : ''}`}>
                      {duration(row.waiting_minutes)}
                    </div>
                  </div>
                  <div className="case-meta-item">
                    <div className="case-meta-label">Requested</div>
                    <div className="case-meta-value truncate">{relative(row.requested_at)}</div>
                  </div>
                </div>

                {Object.keys(row.state_payload || {}).length ? (
                  <div style={{ marginTop: 'var(--sp-3)' }}>
                    <KV
                      items={Object.entries(row.state_payload).map(([key, value]) => ({
                        label: key.replaceAll('_', ' '),
                        value: typeof value === 'object' ? JSON.stringify(value) : String(value ?? '—'),
                      }))}
                    />
                  </div>
                ) : null}

                <div className="card-actions">
                  <Button
                    variant="success"
                    onClick={() => {
                      setDialog({ row, approve: true })
                      setNote('')
                    }}
                  >
                    Approve
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() => {
                      setDialog({ row, approve: false })
                      setNote('')
                    }}
                  >
                    Reject
                  </Button>
                  <Button variant="ghost" onClick={() => navigate(`/cases/${row.case.id}`)}>
                    Open the case
                  </Button>
                </div>
              </Card>
            </li>
          )
        })}
      </ul>

      <Modal
        open={Boolean(dialog)}
        onClose={() => setDialog(null)}
        title={dialog?.approve ? 'Approve this request' : 'Reject this request'}
        footer={
          <>
            <SectionTitle>Decision</SectionTitle>
            <div className="row">
              <Button variant="ghost" onClick={() => setDialog(null)}>
                Cancel
              </Button>
              <Button variant={dialog?.approve ? 'success' : 'danger'} busy={busy} onClick={() => void decide()}>
                {dialog?.approve ? 'Approve' : 'Reject'}
              </Button>
            </div>
          </>
        }
      >
        {dialog ? (
          <KV
            items={[
              { label: 'Case', value: dialog.row.case.case_number },
              { label: 'Requester', value: dialog.row.requester?.full_name ?? '—' },
              { label: 'Waiting', value: duration(dialog.row.waiting_minutes) },
              { label: 'Step', value: dialog.row.step_key.replaceAll('_', ' ').toLowerCase() },
            ]}
          />
        ) : null}
        <TextArea
          value={note}
          onChange={setNote}
          rows={3}
          placeholder={dialog?.approve ? 'Approved as requested.' : 'Dues pending — please clear the balance and reapply.'}
        />
        <p className="small muted">Your note goes to the requester and stays on the case record permanently.</p>
      </Modal>
    </div>
  )
}
