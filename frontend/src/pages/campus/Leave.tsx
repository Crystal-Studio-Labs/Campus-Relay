/** Leave: a student's leave register, and the desk that approves it.
 *
 *  Dates are validated again on the server - a phone's date picker is a
 *  convenience, not a guarantee - so a backwards range comes back as a field
 *  error the form can show rather than a silent bad row.
 */

import { useMemo, useState } from 'react'
import { ApiError, api } from '../../lib/api'
import { useRemote } from '../../state/hooks'
import { useLanguage } from '../../lib/i18n'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  Metric,
  PageHeader,
  SectionTitle,
  Select,
  TextArea,
  TextInput,
} from '../../components/ui'

interface LeaveRow {
  id: number
  kind: string
  state: string
  from_date: string
  to_date: string
  reason: string
  destination: string | null
  guardian_contact: string | null
  applied_at: string | null
  decided_at: string | null
  decision_note: string | null
  student: { id: number; full_name: string; roll_number: string } | null
}

interface MinePayload {
  student: { id: number; full_name: string; roll_number: string } | null
  applications: LeaveRow[]
  summary: { pending: number; approved: number; rejected: number }
}

const KINDS = ['CASUAL', 'SICK', 'MEDICAL', 'EARNED', 'DUTY', 'OTHER']

const STATE_TONE: Record<string, 'warn' | 'done' | 'urgent' | 'ghost'> = {
  PENDING: 'warn',
  APPROVED: 'done',
  REJECTED: 'urgent',
  CANCELLED: 'ghost',
}

const days = (row: LeaveRow) => {
  const from = Date.parse(row.from_date)
  const to = Date.parse(row.to_date)
  if (Number.isNaN(from) || Number.isNaN(to)) return 0
  return Math.round((to - from) / 86_400_000) + 1
}

function LeaveCard({
  row,
  onDecide,
  onCancel,
}: {
  row: LeaveRow
  onDecide?: (id: number, state: string) => void
  onCancel?: (id: number) => void
}) {
  const { t } = useLanguage()
  return (
    <Card>
      <SectionTitle right={<Badge tone={STATE_TONE[row.state] ?? 'ghost'}>{t(`leave.state.${row.state}`)}</Badge>}>
        {t(`leave.kind.${row.kind}`)} {t('leave.leaveWord')} · {days(row)}{' '}
        {days(row) === 1 ? t('leave.days') : t('leave.daysPlural')}
      </SectionTitle>
      {row.student ? (
        <div className="small bold">
          {row.student.roll_number} · {row.student.full_name}
        </div>
      ) : null}
      <div className="small muted">
        {row.from_date} → {row.to_date}
        {row.destination ? ` · ${t('leave.towards')} ${row.destination}` : ''}
      </div>
      <p className="tiny" style={{ marginTop: 6 }}>{row.reason}</p>
      {row.decision_note ? <div className="tiny muted">{t('leave.note')} {row.decision_note}</div> : null}
      {onDecide && row.state === 'PENDING' ? (
        <div className="row" style={{ gap: 8, marginTop: 10 }}>
          <Button size="sm" variant="success" onClick={() => onDecide(row.id, 'APPROVED')}>
            {t('leave.approve')}
          </Button>
          <Button size="sm" variant="danger" onClick={() => onDecide(row.id, 'REJECTED')}>
            {t('leave.reject')}
          </Button>
        </div>
      ) : null}
      {onCancel && row.state === 'PENDING' ? (
        <div style={{ marginTop: 10 }}>
          <Button size="sm" variant="ghost" onClick={() => onCancel(row.id)}>
            {t('leave.withdraw')}
          </Button>
        </div>
      ) : null}
    </Card>
  )
}

export function StudentLeavePage() {
  const { t } = useLanguage()
  const state = useRemote<MinePayload>('leave:me', (signal) => api.get<MinePayload>('/leave/me', signal))
  const today = useMemo(() => new Date().toISOString().slice(0, 10), [])
  const [kind, setKind] = useState('CASUAL')
  const [from, setFrom] = useState(today)
  const [to, setTo] = useState(today)
  const [reason, setReason] = useState('')
  const [destination, setDestination] = useState('')
  const [guardian, setGuardian] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const apply = async () => {
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      await api.post('/leave', {
        kind,
        from_date: from,
        to_date: to,
        reason,
        destination: destination || null,
        guardian_contact: guardian || null,
      })
      setReason('')
      setMessage(t('leave.submitted'))
      await state.refresh()
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : t('leave.couldNotSubmit'))
    } finally {
      setBusy(false)
    }
  }

  const cancel = async (id: number) => {
    setError(null)
    try {
      await api.post(`/leave/${id}/cancel`, {})
      await state.refresh()
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : t('leave.couldNotWithdraw'))
    }
  }

  const summary = state.data?.summary

  return (
    <>
      <PageHeader
        guide="leave-head"
        title={t('leave.title')}
        subtitle={t('leave.subtitle')}
        kicker={t('leave.kicker')}
      />

      {state.loading && !state.data ? (
        <LoadingState />
      ) : state.error && !state.data ? (
        <ErrorState message={state.error} onRetry={() => void state.refresh()} />
      ) : !state.data?.student ? (
        <EmptyState
          title={t('leave.noStudent')}
          detail={t('leave.noStudentDetail')}
        />
      ) : (
        <>
          <Card data-guide="leave-summary">
            <div className="grid-3">
              <Metric label={t('leave.pending')} value={summary?.pending ?? 0} tone={(summary?.pending ?? 0) > 0 ? 'warn' : 'done'} />
              <Metric label={t('leave.approved')} value={summary?.approved ?? 0} tone="done" />
              <Metric label={t('leave.rejected')} value={summary?.rejected ?? 0} />
            </div>
          </Card>

          <Card data-guide="leave-apply">
            <SectionTitle>{t('leave.applyTitle')}</SectionTitle>
            <div className="grid-3">
              <label className="field">
                <span className="field-label">{t('leave.type')}</span>
                <Select value={kind} onChange={setKind} options={KINDS.map((k) => ({ value: k, label: t(`leave.kind.${k}`) }))} />
              </label>
              <label className="field">
                <span className="field-label">{t('leave.from')}</span>
                <TextInput value={from} onChange={setFrom} type="date" />
              </label>
              <label className="field">
                <span className="field-label">{t('leave.to')}</span>
                <TextInput value={to} onChange={setTo} type="date" />
              </label>
            </div>
            <div className="grid-2" style={{ marginTop: 8 }}>
              <label className="field">
                <span className="field-label">{t('leave.goingTo')}</span>
                <TextInput value={destination} onChange={setDestination} placeholder={t('leave.goingPlaceholder')} />
              </label>
              <label className="field">
                <span className="field-label">{t('leave.guardian')}</span>
                <TextInput value={guardian} onChange={setGuardian} inputMode="tel" placeholder="+91…" />
              </label>
            </div>
            <label className="field" style={{ marginTop: 8 }}>
              <span className="field-label">{t('leave.reason')}</span>
              <TextArea value={reason} onChange={setReason} rows={2} placeholder={t('leave.reasonPlaceholder')} />
            </label>
            <div style={{ marginTop: 10 }}>
              <Button variant="primary" busy={busy} disabled={reason.trim().length < 5} onClick={() => void apply()}>
                {t('leave.submit')}
              </Button>
            </div>
          </Card>

          {message ? <div className="banner banner-info" role="status">{message}</div> : null}
          {error ? <div className="banner banner-error" role="alert">{error}</div> : null}

          {(state.data.applications ?? []).length === 0 ? (
            <EmptyState title={t('leave.none')} detail={t('leave.noneDetail')} />
          ) : (
            state.data.applications.map((row) => <LeaveCard key={row.id} row={row} onCancel={cancel} />)
          )}
        </>
      )}
    </>
  )
}

export function LeaveDeskPage() {
  const { t } = useLanguage()
  const [filter, setFilter] = useState('PENDING')
  const state = useRemote<{ applications: LeaveRow[]; count: number }>(
    `leave:queue:${filter}`,
    (signal) => api.get(`/leave${filter ? `?state=${filter}` : ''}`, signal),
    { cacheKey: null },
  )
  const [busyId, setBusyId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const decide = async (id: number, next: string) => {
    setBusyId(id)
    setError(null)
    try {
      await api.post(`/leave/${id}/decide`, {
        state: next,
        note: next === 'APPROVED' ? t('leave.noteApproved') : t('leave.noteRejected'),
      })
      await state.refresh()
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : t('leave.couldNotDecide'))
    } finally {
      setBusyId(null)
    }
  }

  const rows = state.data?.applications ?? []
  const pending = rows.filter((row) => row.state === 'PENDING').length

  return (
    <>
      <PageHeader
        title={t('leave.deskTitle')}
        subtitle={t('leave.deskSubtitle')}
        kicker={t('leave.kicker')}
        actions={
          <div style={{ minWidth: 180 }}>
            <Select
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'PENDING', label: t('leave.pending') },
                { value: '', label: t('leave.allApplications') },
                { value: 'APPROVED', label: t('leave.approved') },
                { value: 'REJECTED', label: t('leave.rejected') },
              ]}
            />
          </div>
        }
      />

      {/* A summary band above the register, not a split of the page: the two
          counts read as one row of KPI tiles. */}
      <div className="grid-metrics">
        <Metric label={t('leave.waiting')} value={pending} tone={pending > 0 ? 'warn' : 'done'} />
        <Metric label={t('leave.shown')} value={rows.length} />
      </div>

      {error ? <div className="banner banner-error" role="alert">{error}</div> : null}

      {state.loading && !state.data ? (
        <LoadingState />
      ) : state.error && !state.data ? (
        <ErrorState message={state.error} onRetry={() => void state.refresh()} />
      ) : rows.length === 0 ? (
        <EmptyState title={t('leave.empty')} detail={t('leave.emptyDetail')} />
      ) : (
        rows.map((row) => <LeaveCard key={row.id} row={row} onDecide={busyId === null ? decide : undefined} />)
      )}
    </>
  )
}
