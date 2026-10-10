/** Clearance: a student's no-dues requests, and the desk that decides them.
 *
 *  A student raises a request and watches its state; the desk sees the campus
 *  queue. Deciding is one-way on the server, so the button disappears once a
 *  request has been decided rather than offering an action that would 422.
 */

import { useState } from 'react'
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
  PageHeader,
  ProgressBar,
  SectionTitle,
  Select,
  TextArea,
} from '../../components/ui'

interface ClearanceRow {
  id: number
  kind: string
  state: string
  purpose: string | null
  remarks: string | null
  requested_at: string | null
  decided_at: string | null
  decision_note: string | null
  student: { id: number; full_name: string; roll_number: string } | null
}

interface MinePayload {
  student: { id: number; full_name: string; roll_number: string } | null
  requests: ClearanceRow[]
  summary: { open: number; approved: number; rejected: number }
}

const STATE_TONE: Record<string, 'warn' | 'done' | 'urgent'> = {
  PENDING: 'warn',
  APPROVED: 'done',
  REJECTED: 'urgent',
}

const KINDS = ['NO_DUES', 'TRANSFER', 'GRADUATION', 'HOSTEL_VACATE', 'MIGRATION', 'OTHER']

function ClearanceCard({ row, onDecide }: { row: ClearanceRow; onDecide?: (id: number, state: string) => void }) {
  const { t } = useLanguage()
  return (
    <Card>
      <SectionTitle right={<Badge tone={STATE_TONE[row.state] ?? 'ghost'}>{t(`clearance.state.${row.state}`)}</Badge>}>
        {t(`clearance.kind.${row.kind}`)}
      </SectionTitle>
      {row.student ? (
        <div className="small bold">
          {row.student.roll_number} · {row.student.full_name}
        </div>
      ) : null}
      {row.purpose ? <div className="small" style={{ marginTop: 4 }}>{row.purpose}</div> : null}
      {row.remarks ? <p className="tiny muted" style={{ marginTop: 4 }}>{row.remarks}</p> : null}
      <div className="tiny muted" style={{ marginTop: 6 }}>
        {t('clearance.raised')} {row.requested_at ? row.requested_at.slice(0, 10) : '—'}
        {row.decided_at ? ` · ${t('clearance.decided')} ${row.decided_at.slice(0, 10)}` : ''}
      </div>
      {row.decision_note ? <div className="tiny" style={{ marginTop: 4 }}>{row.decision_note}</div> : null}
      {onDecide && row.state === 'PENDING' ? (
        <div className="row" style={{ gap: 8, marginTop: 10 }}>
          <Button size="sm" variant="success" onClick={() => onDecide(row.id, 'APPROVED')}>
            {t('clearance.approve')}
          </Button>
          <Button size="sm" variant="danger" onClick={() => onDecide(row.id, 'REJECTED')}>
            {t('clearance.reject')}
          </Button>
        </div>
      ) : null}
    </Card>
  )
}

export function ClearancePage() {
  const { t } = useLanguage()
  const state = useRemote<MinePayload>('clearance:me', (signal) => api.get<MinePayload>('/clearance/me', signal))
  const [kind, setKind] = useState('NO_DUES')
  const [purpose, setPurpose] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const submit = async () => {
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      await api.post('/clearance', { kind, purpose: purpose || null })
      setPurpose('')
      setMessage(t('clearance.submitted'))
      await state.refresh()
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : t('clearance.couldNot'))
    } finally {
      setBusy(false)
    }
  }

  const summary = state.data?.summary

  return (
    <>
      <PageHeader
        guide="clearance-head"
        title={t('clearance.title')}
        subtitle={t('clearance.subtitle')}
        kicker={t('clearance.kicker')}
      />

      {state.loading && !state.data ? (
        <LoadingState />
      ) : state.error && !state.data ? (
        <ErrorState message={state.error} onRetry={() => void state.refresh()} />
      ) : !state.data?.student ? (
        <EmptyState
          title={t('clearance.noStudent')}
          detail={t('clearance.noStudentDetail')}
        />
      ) : (
        <>
          <Card data-guide="clearance-request">
            <SectionTitle right={<Badge tone={summary && summary.open > 0 ? 'warn' : 'done'}>
              {summary ? `${summary.open} ${t('clearance.open')}` : '—'}
            </Badge>}>
              {t('clearance.newRequest')}
            </SectionTitle>
            <div style={{ maxWidth: 320 }}>
              <label className="field">
                <span className="field-label">{t('clearance.type')}</span>
                <Select value={kind} onChange={setKind} options={KINDS.map((k) => ({ value: k, label: t(`clearance.kind.${k}`) }))} />
              </label>
            </div>
            <label className="field" style={{ marginTop: 8 }}>
              <span className="field-label">{t('clearance.purpose')}</span>
              <TextArea value={purpose} onChange={setPurpose} rows={2} placeholder={t('clearance.purposePlaceholder')} />
            </label>
            <div className="row" style={{ gap: 8, marginTop: 10, alignItems: 'center' }}>
              <Button variant="primary" busy={busy} onClick={() => void submit()}>
                {t('clearance.raise')}
              </Button>
              {summary ? (
                <span className="tiny muted">
                  {summary.approved} {t('clearance.approved')} · {summary.rejected} {t('clearance.rejected')}
                </span>
              ) : null}
            </div>
          </Card>

          {message ? <div className="banner banner-info" role="status">{message}</div> : null}
          {error ? <div className="banner banner-error" role="alert">{error}</div> : null}

          {(state.data.requests ?? []).length === 0 ? (
            <EmptyState title={t('clearance.none')} detail={t('clearance.noneDetail')} />
          ) : (
            state.data.requests.map((row) => <ClearanceCard key={row.id} row={row} />)
          )}
        </>
      )}
    </>
  )
}

export function ClearanceDeskPage() {
  const { t } = useLanguage()
  const [filter, setFilter] = useState('PENDING')
  const state = useRemote<{ requests: ClearanceRow[]; count: number }>(
    `clearance:queue:${filter}`,
    (signal) => api.get(`/clearance${filter ? `?state=${filter}` : ''}`, signal),
    { cacheKey: null },
  )
  const [busyId, setBusyId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const decide = async (id: number, next: string) => {
    setBusyId(id)
    setError(null)
    try {
      await api.post(`/clearance/${id}/decide`, {
        state: next,
        note: next === 'APPROVED' ? t('clearance.noteApproved') : t('clearance.noteRejected'),
      })
      await state.refresh()
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : t('clearance.couldNotDecide'))
    } finally {
      setBusyId(null)
    }
  }

  const rows = state.data?.requests ?? []
  const pending = rows.filter((row) => row.state === 'PENDING').length

  return (
    <>
      <PageHeader
        title={t('clearance.deskTitle')}
        subtitle={t('clearance.deskSubtitle')}
        kicker={t('clearance.kicker')}
        actions={
          <div style={{ minWidth: 180 }}>
            <Select
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'PENDING', label: t('clearance.pending') },
                { value: '', label: t('clearance.allRequests') },
                { value: 'APPROVED', label: t('clearance.state.APPROVED') },
                { value: 'REJECTED', label: t('clearance.state.REJECTED') },
              ]}
            />
          </div>
        }
      />

      <Card>
        <SectionTitle right={<Badge tone={pending > 0 ? 'warn' : 'done'}>{rows.length} {t('clearance.shown')}</Badge>}>
          {t('clearance.queue')}
        </SectionTitle>
        <ProgressBar value={rows.length - pending} max={rows.length || 1} tone="mint" />
        <div className="tiny muted" style={{ marginTop: 6 }}>
          {pending} {t('clearance.waitingOn')}
        </div>
      </Card>

      {error ? <div className="banner banner-error" role="alert">{error}</div> : null}

      {state.loading && !state.data ? (
        <LoadingState />
      ) : state.error && !state.data ? (
        <ErrorState message={state.error} onRetry={() => void state.refresh()} />
      ) : rows.length === 0 ? (
        <EmptyState title={t('clearance.emptyQueue')} detail={t('clearance.emptyQueueDetail')} />
      ) : (
        rows.map((row) => (
          <ClearanceCard key={row.id} row={row} onDecide={busyId === null ? decide : undefined} />
        ))
      )}
    </>
  )
}
