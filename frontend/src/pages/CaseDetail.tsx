/** Case detail.
 *
 *  One screen for every role, with the action bar assembled from the permissions
 *  the server actually granted. Each action shows what it will do before it does
 *  it, and anything that can be done offline is queued rather than lost - with
 *  the expected state recorded so the server can detect a stale edit instead of
 *  silently overwriting someone else's work.
 */

import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ApiError, api, apiUrl, fetchBlobUrl } from '../lib/api'
import { enqueue } from '../lib/offline'
import { bytes, dateTime, duration, relative } from '../lib/format'
import { useSession } from '../state/session'
import { usePolling, useRemote, useSyncState } from '../state/hooks'
import type { CaseDetail, StaffWorkload } from '../lib/types'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  KV,
  LoadingState,
  Modal,
  ProgressBar,
  SectionTitle,
  Select,
  Tabs,
  TextArea,
} from '../components/ui'
import {
  CaseStatusBadge,
  ChannelBadge,
  OfflineCapturedBadge,
  PriorityBadge,
  SlaBadge,
} from '../components/StatusChip'
import { Timeline } from '../components/Timeline'

export function CaseDetailPage() {
  const { caseId } = useParams()
  const navigate = useNavigate()
  const { profile, can } = useSession()
  const sync = useSyncState()

  const { data, error, loading, refresh } = useRemote<CaseDetail>(`case-${caseId}`, () =>
    api.get<CaseDetail>(`/cases/${caseId}`),
  )
  usePolling(() => void refresh(), 45_000, sync.online)

  const [tab, setTab] = useState<'timeline' | 'comments' | 'evidence'>('timeline')
  const [comment, setComment] = useState('')
  const [internal, setInternal] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [dialog, setDialog] = useState<'resolve' | 'assign' | 'escalate' | 'reopen' | 'cancel' | 'verify' | 'decision' | null>(null)
  const [noteText, setNoteText] = useState('')
  const [staffId, setStaffId] = useState('')
  const [confirmApprove, setConfirmApprove] = useState(true)

  // Fetched with the other hooks so the hook order never depends on load state.
  const { data: staffData } = useRemote<{ staff: StaffWorkload[] }>(
    can('case:assign') ? 'staff-for-assign' : null,
    () => api.get<{ staff: StaffWorkload[] }>('/admin/staff'),
  )

  const isRequester = data?.requester?.id === profile?.id
  const waitingForMe = data?.status === 'VERIFICATION_REQUIRED' && isRequester

  const slaRatio = useMemo(() => {
    if (!data?.sla_minutes || !data.due_at) return null
    const remaining = (new Date(data.due_at).getTime() - Date.now()) / 60000
    return { remaining, total: data.sla_minutes }
  }, [data])

  if (loading && !data) return <LoadingState label="Loading case" />
  if (error && !data) return <ErrorState message={error} onRetry={() => void refresh()} offline={!sync.online} />
  if (!data) return <EmptyState title="Case not found" />

  const act = async (
    key: string,
    path: string,
    body: unknown,
    offlineFallback?: { operation: 'CASE_STATUS' | 'CASE_VERIFY' | 'CASE_COMMENT'; payload: Record<string, any>; label: string },
  ) => {
    setBusy(key)
    setActionError(null)
    setNotice(null)
    try {
      await api.post(path, body)
      setNotice('Done. The record has been updated.')
      await refresh()
    } catch (requestError) {
      const offline = requestError instanceof ApiError && requestError.status === 0
      if (offline && offlineFallback) {
        await enqueue({
          operation: offlineFallback.operation,
          payload: offlineFallback.payload,
          client_base: { status: data.status, updated_at: data.updated_at },
          entity_id: String(data.id),
          label: offlineFallback.label,
          case_ref: data.case_number,
        })
        setNotice('Saved on this device. It will be sent as soon as you have a connection.')
        void sync.flush()
      } else {
        setActionError(
          requestError instanceof ApiError ? requestError.message : 'That action could not be completed.',
        )
      }
    } finally {
      setBusy(null)
      setDialog(null)
      setNoteText('')
    }
  }

  return (
    <div className="stack-lg">
      <div>
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          ← Back to cases
        </Button>
      </div>

      {notice ? (
        <div className="banner banner-info" role="status">
          {notice}
        </div>
      ) : null}
      {actionError ? (
        <div className="banner banner-error" role="alert">
          {actionError}
        </div>
      ) : null}
      {data.dedupe_state === 'DUPLICATE' || data.duplicate_group_id ? (
        <div className="banner banner-info">
          This looks like it may repeat an existing issue. Linking duplicates keeps the fix honest instead of
          splitting it across two queues.
        </div>
      ) : null}

      {/* The record header and the reference details, side by side on a wide
          screen and stacked on a phone. The facts a clerk reads off first stay
          in the rail; the case itself keeps the wide column. */}
      <div className="board">
        <div className="board-8">
          <Card
            data-guide="case-header"
            accent={data.status === 'ESCALATED' ? 'urgent' : waitingForMe ? 'signal' : undefined}
          >
        <div className="row wrap" style={{ gap: 6 }}>
          <span className="mono small muted">{data.case_number}</span>
          <CaseStatusBadge status={data.status} />
          <PriorityBadge priority={data.priority} />
          <SlaBadge state={data.sla_state} dueAt={data.due_at} />
          <ChannelBadge channel={data.source_channel} />
          <OfflineCapturedBadge capturedAt={data.captured_offline_at} />
          {data.escalation_level > 0 ? <Badge tone="urgent">Escalation L{data.escalation_level}</Badge> : null}
          {data.reopen_count > 0 ? <Badge tone="warn">Reopened ×{data.reopen_count}</Badge> : null}
        </div>
        <h1 style={{ marginTop: 8 }}>{data.title}</h1>
        <p className="muted small">
          {data.service_name} · raised {relative(data.created_at)} · open {duration(data.age_minutes)}
        </p>

        {slaRatio ? (
          <div style={{ marginTop: 8 }}>
            <div className="row-between tiny bold">
              <span>Service target</span>
              <span>
                {slaRatio.remaining > 0
                  ? `${duration(slaRatio.remaining)} left`
                  : `overdue by ${duration(Math.abs(slaRatio.remaining))}`}
              </span>
            </div>
            <ProgressBar
              value={Math.max(0, slaRatio.total - Math.max(0, slaRatio.remaining))}
              max={slaRatio.total}
              tone={slaRatio.remaining < 0 ? 'status-urgent' : slaRatio.remaining < slaRatio.total * 0.25 ? 'status-warn' : 'mint'}
            />
          </div>
        ) : null}

          </Card>
        </div>

        <div className="board-4">
          <Card>
            <SectionTitle>Case details</SectionTitle>
            <KV
              items={[
                { label: 'Where', value: data.location ? `${data.location.name} (${data.location.code})` : '—' },
                { label: 'Department', value: data.department ?? 'not routed yet' },
                {
                  label: 'Assigned to',
                  value: data.assigned_staff
                    ? `${data.assigned_staff.name ?? 'Staff'} — ${data.assigned_staff.designation}`
                    : 'unassigned',
                },
                ...(can('case:read_scope') || can('case:read_all')
                  ? [{ label: 'Raised by', value: data.requester?.full_name ?? '—' }]
                  : []),
                { label: 'Current step', value: data.current_step_key ?? '—' },
                { label: 'Verification', value: data.verification_state.replaceAll('_', ' ').toLowerCase() },
                ...(data.asset
                  ? [{ label: 'Asset', value: `${data.asset.name} (${data.asset.code}) · ${data.asset.state}` }]
                  : []),
              ]}
            />
          </Card>
        </div>
      </div>

      {/* The action zone: what this person must do, and what has been issued or
          is available to them, side by side. On a phone it stacks in the same
          reading order. */}
      <div className="board">
        <div className="board-8">
          {/* --- The single thing this person must do next ----------------- */}
          {waitingForMe ? (
        <Card accent="signal">
          <SectionTitle>Was this fixed?</SectionTitle>
          <p className="small">
            The staff member marked this as done. Confirm it so the case can close — or send it back if it is not
            actually fixed.
          </p>
          <div className="row wrap">
            <Button
              variant="success"
              size="lg"
              busy={busy === 'verify'}
              onClick={() =>
                void act(
                  'verify',
                  `/cases/${data.id}/verify`,
                  { accepted: true, note: 'Confirmed by requester' },
                  { operation: 'CASE_VERIFY', payload: { case_id: data.id, accepted: true }, label: 'Confirm resolution' },
                )
              }
            >
              Yes, it is fixed
            </Button>
            <Button variant="attention" size="lg" onClick={() => setDialog('verify')}>
              No, still broken
            </Button>
          </div>
        </Card>
      ) : null}

      {can('approval:decide') && data.status === 'WAITING_FOR_APPROVAL' ? (
        <Card accent="sun">
          <SectionTitle right={<Badge tone="blocked">Waiting on you</Badge>}>Approval required</SectionTitle>
          <p className="small">
            {data.workflow_steps.find((step) => step.is_current)?.instructions ||
              'This step is configured to require a decision before work continues.'}
          </p>
          <div className="row wrap">
            <Button variant="success" onClick={() => { setConfirmApprove(true); setDialog('decision') }}>
              Approve
            </Button>
            <Button variant="danger" onClick={() => { setConfirmApprove(false); setDialog('decision') }}>
              Reject
            </Button>
          </div>
        </Card>
      ) : null}

        </div>

        <div className="board-4">
      {data.gate_pass ? (
        <Card accent="mint">
          <SectionTitle right={data.gate_pass.is_currently_valid ? <Badge tone="done">Valid now</Badge> : <Badge tone="dead">Not valid</Badge>}>
            Gate pass
          </SectionTitle>
          <div className="row wrap">
            <div className="grow">
              <KV
                items={[
                  { label: 'Pass code', value: <span className="mono bold">{data.gate_pass.pass_code}</span> },
                  { label: 'Valid from', value: dateTime(data.gate_pass.valid_from) },
                  { label: 'Valid to', value: dateTime(data.gate_pass.valid_to) },
                  { label: 'Destination', value: data.gate_pass.destination ?? '—' },
                ]}
              />
            </div>
            <img
              src={apiUrl(`/qr/${data.gate_pass.pass_code}.png`)}
              alt={`QR code for gate pass ${data.gate_pass.pass_code}`}
              width={140}
              height={140}
              style={{ border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', background: '#fff' }}
            />
          </div>
        </Card>
      ) : null}

      {data.document ? (
        <Card accent="mint">
          <SectionTitle right={<Badge tone="done">Issued</Badge>}>Document</SectionTitle>
          <KV
            items={[
              { label: 'Title', value: data.document.title },
              { label: 'Serial', value: <span className="mono">{data.document.serial_no}</span> },
              { label: 'Verify with', value: <span className="mono">{data.document.verification_code}</span> },
              { label: 'Issued', value: dateTime(data.document.issued_at) },
            ]}
          />
          <div className="row wrap" style={{ marginTop: 8 }}>
            <Button
              variant="primary"
              onClick={async () => {
                try {
                  const url = await fetchBlobUrl(`/documents/${data.document!.id}/download`)
                  window.open(url, '_blank', 'noopener')
                  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
                } catch {
                  setActionError('The document could not be downloaded. It needs a connection.')
                }
              }}
            >
              Download PDF
            </Button>
            <span className="tiny muted">
              Anyone can verify this document at /api/v1/documents/verify/{data.document.verification_code}
            </span>
          </div>
        </Card>
      ) : null}

      {/* --- Action bar ---------------------------------------------------- */}
      <Card data-guide="case-actions">
        <SectionTitle>Actions available to you</SectionTitle>
        <div className="row wrap">
          {can('case:update_status') && ['ASSIGNED', 'ROUTED', 'REOPENED'].includes(data.status) ? (
            <Button
              variant="primary"
              busy={busy === 'start'}
              onClick={() =>
                void act('start', `/cases/${data.id}/start`, {}, {
                  operation: 'CASE_STATUS',
                  payload: { case_id: data.id, action: 'start' },
                  label: 'Start work',
                })
              }
            >
              Start work
            </Button>
          ) : null}
          {can('case:resolve') && !['RESOLVED', 'CLOSED', 'CANCELLED'].includes(data.status) ? (
            <Button variant="success" onClick={() => setDialog('resolve')}>
              Mark resolved
            </Button>
          ) : null}
          {can('case:assign') ? (
            <Button variant="info" onClick={() => setDialog('assign')}>
              Assign / reassign
            </Button>
          ) : null}
          {can('case:escalate') && data.status !== 'ESCALATED' ? (
            <Button variant="danger" onClick={() => setDialog('escalate')}>
              Escalate
            </Button>
          ) : null}
          {can('case:reopen') && ['RESOLVED', 'CLOSED'].includes(data.status) ? (
            <Button variant="attention" onClick={() => setDialog('reopen')}>
              Reopen
            </Button>
          ) : null}
          {can('case:cancel') && !['CLOSED', 'CANCELLED'].includes(data.status) ? (
            <Button variant="ghost" onClick={() => setDialog('cancel')}>
              Cancel case
            </Button>
          ) : null}
          {can('approval:decide') && data.service_key === 'LEAVE_REQUEST' && !data.gate_pass ? (
            <Button
              variant="primary"
              busy={busy === 'pass'}
              onClick={() => void act('pass', `/cases/${data.id}/gate-pass`, {})}
            >
              Issue gate pass
            </Button>
          ) : null}
          {can('approval:decide') && data.service_key === 'CERTIFICATE_BONAFIDE' && !data.document ? (
            <Button
              variant="primary"
              busy={busy === 'certificate'}
              onClick={() => void act('certificate', `/cases/${data.id}/certificate`, {})}
            >
              Generate certificate PDF
            </Button>
          ) : null}
        </div>
        {!can('case:update_status') && !can('case:cancel') ? (
          <p className="small muted" style={{ marginTop: 8, marginBottom: 0 }}>
            {isRequester
              ? 'You raised this request. You will be asked to confirm when the work is done.'
              : 'You have read access to this case.'}
          </p>
        ) : null}
      </Card>
        </div>
      </div>

      {/* --- Workflow ------------------------------------------------------ */}
      {data.workflow_steps?.length ? (
        <Card>
          <SectionTitle>Workflow</SectionTitle>
          <ol className="list-reset stack" style={{ gap: 6 }}>
            {data.workflow_steps.map((step) => (
              <li key={step.key} className="row" style={{ gap: 8 }}>
                <Badge tone={step.is_current ? 'progress' : 'ghost'}>
                  {step.is_current ? 'now' : '·'}
                </Badge>
                <div className="grow">
                  <div className={step.is_current ? 'bold' : ''}>{step.name}</div>
                  <div className="tiny muted">
                    {step.type.replaceAll('_', ' ').toLowerCase()}
                    {step.responsible_role ? ` · ${step.responsible_role.replaceAll('_', ' ').toLowerCase()}` : ''}
                    {step.sla_minutes ? ` · ${duration(step.sla_minutes)}` : ''}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </Card>
      ) : null}

      {/* --- Conversation ------------------------------------------------- */}
      <div data-guide="case-timeline">
        <Tabs
          tabs={[
            { id: 'timeline', label: 'Timeline', count: data.timeline?.length },
            { id: 'comments', label: 'Comments', count: data.comments?.length },
            { id: 'evidence', label: 'Evidence', count: data.attachments?.length },
          ]}
          active={tab}
          onChange={setTab}
        />

        <div style={{ marginTop: 12 }}>
          {tab === 'timeline' ? (
            <Card>
              <Timeline entries={data.timeline ?? []} />
            </Card>
          ) : null}

          {tab === 'comments' ? (
            <div className="stack">
              {can('case:comment') ? (
                <Card>
                  <Field label="Add a comment" hint="Everything you write here is visible to the people handling the case.">
                    <TextArea value={comment} onChange={setComment} rows={3} />
                  </Field>
                  {can('case:comment_internal') ? (
                    <Button
                      size="sm"
                      variant={internal ? 'attention' : 'ghost'}
                      onClick={() => setInternal((value) => !value)}
                    >
                      {internal ? 'Internal note: ON (staff only)' : 'Internal note: off'}
                    </Button>
                  ) : null}
                  <div style={{ marginTop: 8 }}>
                    <Button
                      variant="primary"
                      busy={busy === 'comment'}
                      disabled={!comment.trim()}
                      onClick={async () => {
                        const body = comment.trim()
                        await act(
                          'comment',
                          `/cases/${data.id}/comments`,
                          { body, visibility: internal ? 'INTERNAL' : 'PUBLIC' },
                          {
                            operation: 'CASE_COMMENT',
                            payload: { case_id: data.id, body, visibility: internal ? 'INTERNAL' : 'PUBLIC' },
                            label: 'Comment',
                          },
                        )
                        setComment('')
                      }}
                    >
                      Post comment
                    </Button>
                  </div>
                </Card>
              ) : null}
              {data.comments?.length ? (
                data.comments.map((item) => (
                  <Card key={item.id}>
                    <div className="row-between">
                      <div className="bold">
                        {item.author_name}
                        {item.visibility === 'INTERNAL' ? ' ' : ''}
                        {item.visibility === 'INTERNAL' ? <Badge tone="warn">staff only</Badge> : null}
                      </div>
                      <span className="tiny muted">{dateTime(item.created_at)}</span>
                    </div>
                    <p className="small" style={{ marginBottom: 0, whiteSpace: 'pre-wrap' }}>
                      {item.body}
                    </p>
                  </Card>
                ))
              ) : (
                <EmptyState title="No comments yet" detail="Use comments for anything the timeline does not capture." />
              )}
            </div>
          ) : null}

          {tab === 'evidence' ? (
            <div className="stack">
              {can('case:attach') ? (
                <Card>
                  <Field label="Attach a photo or document" hint="Maximum 10 MB. Stored with a SHA-256 digest.">
                    <input
                      className="input"
                      type="file"
                      onChange={async (event) => {
                        const file = event.target.files?.[0]
                        if (!file) return
                        setBusy('upload')
                        setActionError(null)
                        try {
                          const form = new FormData()
                          form.append('file', file)
                          form.append('kind', 'EVIDENCE')
                          await api.upload(`/cases/${data.id}/attachments`, form)
                          setNotice('Evidence attached.')
                          await refresh()
                        } catch (requestError) {
                          setActionError(
                            requestError instanceof ApiError
                              ? requestError.message
                              : 'The file could not be uploaded. Attachments need a connection.',
                          )
                        } finally {
                          setBusy(null)
                        }
                      }}
                    />
                  </Field>
                  {!sync.online ? (
                    <p className="small muted">Attachments need a connection — submit text now and attach later.</p>
                  ) : null}
                </Card>
              ) : null}
              {data.attachments?.length ? (
                data.attachments.map((item) => (
                  <Card key={item.id}>
                    <div className="row-between">
                      <div>
                        <div className="bold">{item.filename}</div>
                        <div className="tiny muted">
                          {bytes(item.size_bytes)} · {item.content_type} · {dateTime(item.created_at)}
                        </div>
                        {item.note ? <div className="small">{item.note}</div> : null}
                      </div>
                      <Button
                        size="sm"
                        variant="info"
                        onClick={async () => {
                          try {
                            const url = await fetchBlobUrl(`/cases/${data.id}/attachments/${item.id}`)
                            window.open(url, '_blank', 'noopener')
                            window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
                          } catch {
                            setActionError('The file could not be opened. It needs a connection.')
                          }
                        }}
                      >
                        Open
                      </Button>
                    </div>
                  </Card>
                ))
              ) : (
                <EmptyState title="No evidence attached" detail="Photos of the problem help the technician arrive prepared." />
              )}
            </div>
          ) : null}
        </div>
      </div>

      {/* --- Description --------------------------------------------------- */}
      <Card>
        <SectionTitle>What was reported</SectionTitle>
        <p style={{ whiteSpace: 'pre-wrap' }}>{data.description || '—'}</p>
        {Object.keys(data.state_payload || {}).length ? (
          <>
            <div className="divider" />
            <KV
              items={Object.entries(data.state_payload).map(([key, value]) => ({
                label: key.replaceAll('_', ' '),
                value: typeof value === 'object' ? JSON.stringify(value) : String(value ?? '—'),
              }))}
            />
          </>
        ) : null}
        {data.resolution_note ? (
          <>
            <div className="divider" />
            <div className="section-title">Resolution</div>
            <p className="small" style={{ whiteSpace: 'pre-wrap' }}>
              {data.resolution_note}
            </p>
          </>
        ) : null}
      </Card>

      {/* --- Approval history ---------------------------------------------- */}
      {data.approvals?.length ? (
        <Card>
          <SectionTitle>Approvals</SectionTitle>
          <ul className="list-reset stack" style={{ gap: 8 }}>
            {data.approvals.map((approval) => (
              <li key={approval.id} className="row-between">
                <div>
                  <div className="bold">{approval.step_key.replaceAll('_', ' ').toLowerCase()}</div>
                  <div className="tiny muted">
                    {approval.approver_role.replaceAll('_', ' ').toLowerCase()} · requested {relative(approval.requested_at)}
                    {approval.waiting_minutes !== null ? ` · waited ${duration(approval.waiting_minutes)}` : ''}
                  </div>
                  {approval.note ? <div className="small">{approval.note}</div> : null}
                </div>
                <Badge
                  tone={
                    approval.state === 'APPROVED'
                      ? 'done'
                      : approval.state === 'REJECTED'
                        ? 'urgent'
                        : approval.state === 'PENDING'
                          ? 'blocked'
                          : 'dead'
                  }
                >
                  {approval.state}
                </Badge>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <AgentInsight caseId={data.id} enabled={can('agent:operate')} />

      {/* --- Dialogs ------------------------------------------------------- */}
      <Modal
        open={dialog === 'resolve'}
        onClose={() => setDialog(null)}
        title="Mark this resolved"
        footer={
          <div className="row">
            <Button variant="ghost" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button
              variant="success"
              busy={busy === 'resolve'}
              onClick={() =>
                void act(
                  'resolve',
                  `/cases/${data.id}/resolve`,
                  { note: noteText, evidence_note: noteText ? 'Work note recorded' : null },
                  {
                    operation: 'CASE_STATUS',
                    payload: { case_id: data.id, action: 'resolve', note: noteText },
                    label: 'Mark resolved',
                  },
                )
              }
            >
              Confirm resolution
            </Button>
          </div>
        }
      >
        <Field label="What did you do?" hint="This is what the requester reads before confirming.">
          <TextArea value={noteText} onChange={setNoteText} rows={4} placeholder="Replaced the fan regulator and tested for 10 minutes." />
        </Field>
      </Modal>

      <Modal
        open={dialog === 'assign'}
        onClose={() => setDialog(null)}
        title="Assign this case"
        footer={
          <div className="row">
            <Button variant="ghost" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              busy={busy === 'assign'}
              disabled={!staffId}
              onClick={() =>
                void act('assign', `/cases/${data.id}/assign`, {
                  staff_id: Number(staffId),
                  reason: noteText || undefined,
                })
              }
            >
              Assign
            </Button>
          </div>
        }
      >
        <Field label="Staff member" hint="Workload is shown so you can spread the load deliberately.">
          <Select
            value={staffId}
            onChange={setStaffId}
            options={[
              { value: '', label: 'Choose a staff member…' },
              ...(staffData?.staff ?? []).map((item) => ({
                value: String(item.staff_id),
                label: `${item.name ?? 'Staff'} — ${item.open_cases}/${item.capacity} open${item.is_available ? '' : ' (unavailable)'}`,
              })),
            ]}
          />
        </Field>
        <Field label="Why this person?">
          <TextArea value={noteText} onChange={setNoteText} rows={2} />
        </Field>
      </Modal>

      <Modal
        open={dialog === 'escalate'}
        onClose={() => setDialog(null)}
        title="Escalate"
        footer={
          <Button
            variant="danger"
            block
            busy={busy === 'escalate'}
            disabled={noteText.trim().length < 3}
            onClick={() =>
              void act(
                'escalate',
                `/cases/${data.id}/escalate`,
                { reason: noteText },
                {
                  operation: 'CASE_STATUS',
                  payload: { case_id: data.id, action: 'escalate', reason: noteText },
                  label: 'Escalate case',
                },
              )
            }
          >
            Escalate and notify
          </Button>
        }
      >
        <Field label="Reason" required hint="Escalation is recorded against your name.">
          <TextArea value={noteText} onChange={setNoteText} rows={3} />
        </Field>
      </Modal>

      <Modal
        open={dialog === 'reopen'}
        onClose={() => setDialog(null)}
        title="Reopen this case"
        footer={
          <Button
            variant="attention"
            block
            busy={busy === 'reopen'}
            disabled={noteText.trim().length < 3}
            onClick={() =>
              void act(
                'reopen',
                `/cases/${data.id}/reopen`,
                { reason: noteText },
                {
                  operation: 'CASE_STATUS',
                  payload: { case_id: data.id, action: 'reopen', reason: noteText },
                  label: 'Reopen case',
                },
              )
            }
          >
            Reopen
          </Button>
        }
      >
        <Field label="What is still wrong?" required>
          <TextArea value={noteText} onChange={setNoteText} rows={3} />
        </Field>
        <p className="small muted">
          Reopening puts the case back in the same department's queue and counts against its service target.
        </p>
      </Modal>

      <Modal
        open={dialog === 'cancel'}
        onClose={() => setDialog(null)}
        title="Cancel this case"
        footer={
          <Button
            variant="danger"
            block
            busy={busy === 'cancel'}
            onClick={() =>
              void act(
                'cancel',
                `/cases/${data.id}/cancel`,
                { reason: noteText || 'Cancelled by requester' },
                {
                  operation: 'CASE_STATUS',
                  payload: { case_id: data.id, action: 'cancel', reason: noteText },
                  label: 'Cancel case',
                },
              )
            }
          >
            Cancel the case
          </Button>
        }
      >
        <p className="small">
          Cancelling stops the work. The case stays in the record with a cancellation reason — it is not deleted.
        </p>
        <Field label="Reason">
          <TextArea value={noteText} onChange={setNoteText} rows={2} />
        </Field>
      </Modal>

      <Modal
        open={dialog === 'verify'}
        onClose={() => setDialog(null)}
        title="This is not fixed"
        footer={
          <Button
            variant="attention"
            block
            busy={busy === 'verify'}
            onClick={() =>
              void act(
                'verify',
                `/cases/${data.id}/verify`,
                { accepted: false, note: noteText },
                {
                  operation: 'CASE_VERIFY',
                  payload: { case_id: data.id, accepted: false, note: noteText },
                  label: 'Send back: not fixed',
                },
              )
            }
          >
            Send it back
          </Button>
        }
      >
        <Field label="What is still wrong?" hint="This goes straight to the person who did the work.">
          <TextArea value={noteText} onChange={setNoteText} rows={3} />
        </Field>
      </Modal>

      <Modal
        open={dialog === 'decision'}
        onClose={() => setDialog(null)}
        title={confirmApprove ? 'Approve this request' : 'Reject this request'}
        footer={
          <Button
            variant={confirmApprove ? 'success' : 'danger'}
            block
            busy={busy === 'decision'}
            onClick={() =>
              void act('decision', `/cases/${data.id}/approval`, {
                approve: confirmApprove,
                note: noteText || undefined,
              })
            }
          >
            {confirmApprove ? 'Approve' : 'Reject'}
          </Button>
        }
      >
        <KV
          items={[
            { label: 'Case', value: data.case_number },
            { label: 'Requested by', value: data.requester?.full_name ?? '—' },
            { label: 'Waiting since', value: data.updated_at ? `${duration((Date.now() - new Date(data.updated_at).getTime()) / 60000)}` : '—' },
          ]}
        />
        <Field label="Note" hint="The requester sees this note.">
          <TextArea value={noteText} onChange={setNoteText} rows={3} />
        </Field>
        {!confirmApprove ? (
          <p className="small muted">Rejecting stops the workflow and tells the requester why.</p>
        ) : null}
      </Modal>
    </div>
  )
}

/** Agent insight, folded away by default and labelled as a recommendation. */
function AgentInsight({ caseId, enabled }: { caseId: number; enabled: boolean }) {
  const [open, setOpen] = useState(false)
  const { data } = useRemote<any>(
    enabled && open ? `routing-${caseId}` : null,
    () => api.get(`/agents/routing/${caseId}`),
    { cacheKey: null },
  )

  if (!enabled) return null
  return (
    <Card>
      <div className="row-between">
        <SectionTitle>Assistant's read on this case</SectionTitle>
        <Button size="sm" variant="ghost" onClick={() => setOpen((value) => !value)}>
          {open ? 'Hide' : 'Show'}
        </Button>
      </div>
      {open ? (
        !data ? (
          <p className="small muted">Thinking…</p>
        ) : (
          <div className="stack">
            <Badge tone="agent">{data.engine}</Badge>
            <KV
              items={[
                { label: 'Department', value: data.department?.name ?? data.department_name ?? '—' },
                { label: 'Suggested staff', value: data.recommended_staff?.name ?? data.staff?.name ?? '—' },
                { label: 'Target', value: data.sla?.target_minutes ? duration(data.sla.target_minutes) : '—' },
              ]}
            />
            {Array.isArray(data.reasons) ? (
              <ul className="small">
                {data.reasons.map((reason: string) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            ) : null}
            <p className="tiny muted">
              This is a recommendation for a human to accept or ignore. It did not change anything on its own.
            </p>
          </div>
        )
      ) : (
        <p className="small muted" style={{ marginBottom: 0 }}>
          Explains how this case was routed and to whom, with the evidence it used.
        </p>
      )}
    </Card>
  )
}
