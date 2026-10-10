/** Employment: an employee's own leave and payslips, and the HR/payroll desk.
 *
 *  Net pay is what the server computed, not a sum this screen adds up: the
 *  payslip is a financial record and must read the same here as in the ledger.
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

interface StaffLeaveRow {
  id: number
  kind: string
  state: string
  from_date: string
  to_date: string
  reason: string
  applied_at: string | null
  decided_at: string | null
  decision_note: string | null
  employee: { id: number; full_name: string } | null
}

interface PayslipRow {
  id: number
  period: string
  basic: number
  allowances: number
  deductions: number
  net_pay: number
  state: string
  paid_on: string | null
  reference: string | null
  employee: { id: number; full_name: string } | null
}

interface EmploymentPayload {
  employee: { id: number; full_name: string; role: string }
  leave: StaffLeaveRow[]
  payslips: PayslipRow[]
  summary: { pending_leave: number; approved_leave: number; payslips: number; last_net_pay: number | null }
}

const LEAVE_KINDS = ['CASUAL', 'SICK', 'MEDICAL', 'EARNED', 'DUTY', 'OTHER']

const LEAVE_TONE: Record<string, 'warn' | 'done' | 'urgent' | 'ghost'> = {
  PENDING: 'warn',
  APPROVED: 'done',
  REJECTED: 'urgent',
  CANCELLED: 'ghost',
}

const money = (value: number) => `₹${value.toLocaleString('en-IN')}`

export function EmploymentPage() {
  const { t } = useLanguage()
  const state = useRemote<EmploymentPayload>('hrms:me', (signal) => api.get<EmploymentPayload>('/hrms/me', signal))
  const today = useMemo(() => new Date().toISOString().slice(0, 10), [])
  const [kind, setKind] = useState('CASUAL')
  const [from, setFrom] = useState(today)
  const [to, setTo] = useState(today)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const apply = async () => {
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      await api.post('/hrms/leave', { kind, from_date: from, to_date: to, reason })
      setReason('')
      setMessage(t('employment.submitted'))
      await state.refresh()
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : t('leave.couldNotSubmit'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <PageHeader
        title={t('employment.title')}
        subtitle={t('employment.subtitle')}
        kicker={t('employment.kicker')}
      />

      {state.loading && !state.data ? (
        <LoadingState />
      ) : state.error && !state.data ? (
        <ErrorState message={state.error} onRetry={() => void state.refresh()} />
      ) : !state.data ? (
        <EmptyState title={t('employment.empty')} detail={t('employment.emptyDetail')} />
      ) : (
        <>
          <Card>
            <div className="grid-3">
              <Metric label={t('employment.pendingLeave')} value={state.data.summary.pending_leave} tone={state.data.summary.pending_leave > 0 ? 'warn' : 'done'} />
              <Metric label={t('employment.approvedLeave')} value={state.data.summary.approved_leave} tone="done" />
              <Metric
                label={t('employment.lastNetPay')}
                value={state.data.summary.last_net_pay === null ? '—' : money(state.data.summary.last_net_pay)}
              />
            </div>
          </Card>

          <Card>
            <SectionTitle>{t('leave.applyTitle')}</SectionTitle>
            <div className="grid-3">
              <label className="field">
                <span className="field-label">{t('leave.type')}</span>
                <Select
                  value={kind}
                  onChange={setKind}
                  options={LEAVE_KINDS.map((k) => ({ value: k, label: t(`leave.kind.${k}`) }))}
                />
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
            <label className="field" style={{ marginTop: 8 }}>
              <span className="field-label">{t('leave.reason')}</span>
              <TextArea value={reason} onChange={setReason} rows={2} />
            </label>
            <div style={{ marginTop: 10 }}>
              <Button variant="primary" busy={busy} disabled={reason.trim().length < 5} onClick={() => void apply()}>
                {t('employment.submitToHr')}
              </Button>
            </div>
          </Card>

          {message ? <div className="banner banner-info" role="status">{message}</div> : null}
          {error ? <div className="banner banner-error" role="alert">{error}</div> : null}

          <SectionTitle>{t('employment.yourLeave')}</SectionTitle>
          {state.data.leave.length === 0 ? (
            <EmptyState title={t('employment.noLeave')} detail={t('employment.noLeaveDetail')} />
          ) : (
            state.data.leave.map((row) => (
              <Card key={row.id}>
                <SectionTitle right={<Badge tone={LEAVE_TONE[row.state] ?? 'ghost'}>{t(`leave.state.${row.state}`)}</Badge>}>
                  {t(`leave.kind.${row.kind}`)} {t('employment.leaveWord')}
                </SectionTitle>
                <div className="small muted">
                  {row.from_date} → {row.to_date}
                </div>
                <p className="tiny" style={{ marginTop: 4 }}>{row.reason}</p>
                {row.decision_note ? <div className="tiny muted">{t('leave.note')} {row.decision_note}</div> : null}
              </Card>
            ))
          )}

          <SectionTitle>{t('employment.payslips')}</SectionTitle>
          {state.data.payslips.length === 0 ? (
            <EmptyState title={t('employment.noPayslips')} detail={t('employment.noPayslipsDetail')} />
          ) : (
            state.data.payslips.map((slip) => (
              <Card key={slip.id}>
                <SectionTitle
                  right={<Badge tone={slip.state === 'PAID' ? 'done' : 'warn'}>{t(`employment.slipState.${slip.state}`)}</Badge>}
                >
                  {slip.period}
                </SectionTitle>
                <div className="metric-value">{money(slip.net_pay)}</div>
                <div className="tiny muted">
                  {t('employment.basic')} {money(slip.basic)} · {t('employment.allowances')} {money(slip.allowances)} ·{' '}
                  {t('employment.deductions')} {money(slip.deductions)}
                </div>
                {slip.paid_on ? <div className="tiny muted">{t('employment.paid')} {slip.paid_on}{slip.reference ? ` · ${slip.reference}` : ''}</div> : null}
              </Card>
            ))
          )}
        </>
      )}
    </>
  )
}

export function HrmsPage() {
  const { t } = useLanguage()
  const [leaveFilter, setLeaveFilter] = useState('PENDING')
  const [period, setPeriod] = useState('')

  const leave = useRemote<{ leave: StaffLeaveRow[]; count: number }>(
    `hrms:leave:${leaveFilter}`,
    (signal) => api.get(`/hrms/leave${leaveFilter ? `?state=${leaveFilter}` : ''}`, signal),
    { cacheKey: null },
  )
  const payroll = useRemote<{ payslips: PayslipRow[]; count: number; total_net: number; unpaid: number }>(
    `hrms:payroll:${period}`,
    (signal) => api.get(`/hrms/payroll${period ? `?period=${period}` : ''}`, signal),
    { cacheKey: null },
  )

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [employeeId, setEmployeeId] = useState('')
  const [runPeriod, setRunPeriod] = useState(new Date().toISOString().slice(0, 7))
  const [basic, setBasic] = useState('')
  const [allowances, setAllowances] = useState('')
  const [deductions, setDeductions] = useState('')

  const run = async (action: () => Promise<unknown>, done: string) => {
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      await action()
      setMessage(done)
      await Promise.all([leave.refresh(), payroll.refresh()])
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : t('employment.didNotWork'))
    } finally {
      setBusy(false)
    }
  }

  const decideLeave = async (id: number, next: string) => {
    setBusy(true)
    setError(null)
    try {
      await api.post(`/hrms/leave/${id}/decide`, {
        state: next,
        note: next === 'APPROVED' ? t('employment.hrNoteApproved') : t('employment.hrNoteRejected'),
      })
      await leave.refresh()
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : t('leave.couldNotDecide'))
    } finally {
      setBusy(false)
    }
  }

  const leaveRows = leave.data?.leave ?? []
  const pending = leaveRows.filter((row) => row.state === 'PENDING').length

  return (
    <>
      <PageHeader title={t('employment.deskTitle')} subtitle={t('employment.deskSubtitle')} kicker={t('employment.kicker')} />

      <Card>
        <div className="grid-3">
          <Metric label={t('employment.leaveWaiting')} value={pending} tone={pending > 0 ? 'warn' : 'done'} />
          <Metric label={t('employment.payslipsShown')} value={payroll.data?.count ?? 0} />
          <Metric label={t('employment.totalNet')} value={money(payroll.data?.total_net ?? 0)} />
        </div>
      </Card>

      {message ? <div className="banner banner-info" role="status">{message}</div> : null}
      {error ? <div className="banner banner-error" role="alert">{error}</div> : null}

      <Card>
        <SectionTitle
          right={
            <div style={{ minWidth: 160 }}>
              <Select
                value={leaveFilter}
                onChange={setLeaveFilter}
                options={[
                  { value: 'PENDING', label: t('leave.pending') },
                  { value: '', label: t('employment.allLeave') },
                  { value: 'APPROVED', label: t('leave.approved') },
                ]}
              />
            </div>
          }
        >
          {t('employment.staffLeave')}
        </SectionTitle>
        {leave.loading && !leave.data ? (
          <LoadingState />
        ) : leaveRows.length === 0 ? (
          <div className="tiny muted">{t('employment.nothingInView')}</div>
        ) : (
          <ul className="list-reset stack" style={{ gap: 10 }}>
            {leaveRows.map((row) => (
              <li key={row.id} className="row-between wrap" style={{ gap: 8 }}>
                <span className="small">
                  <span className="bold">
                    {row.employee?.full_name ?? `${t('employment.employeePrefix')} ${row.id}`}
                  </span>
                  <span className="muted">
                    {' '}· {t(`leave.kind.${row.kind}`)} · {row.from_date} → {row.to_date} ·{' '}
                    {t(`leave.state.${row.state}`)}
                  </span>
                </span>
                {row.state === 'PENDING' ? (
                  <div className="row" style={{ gap: 6 }}>
                    <Button size="sm" variant="success" busy={busy} onClick={() => void decideLeave(row.id, 'APPROVED')}>
                      {t('leave.approve')}
                    </Button>
                    <Button size="sm" variant="danger" busy={busy} onClick={() => void decideLeave(row.id, 'REJECTED')}>
                      {t('leave.reject')}
                    </Button>
                  </div>
                ) : (
                  <Badge tone={LEAVE_TONE[row.state] ?? 'ghost'}>{t(`leave.state.${row.state}`)}</Badge>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <SectionTitle>{t('employment.runPayslip')}</SectionTitle>
        <div className="grid-3">
          <label className="field">
            <span className="field-label">{t('employment.employeeUserId')}</span>
            <TextInput value={employeeId} onChange={setEmployeeId} inputMode="numeric" placeholder={t('employment.blankSelf')} />
          </label>
          <label className="field">
            <span className="field-label">{t('employment.period')}</span>
            <TextInput value={runPeriod} onChange={setRunPeriod} />
          </label>
          <label className="field">
            <span className="field-label">{t('employment.basic')}</span>
            <TextInput value={basic} onChange={setBasic} inputMode="numeric" />
          </label>
        </div>
        <div className="grid-3" style={{ marginTop: 8 }}>
          <label className="field">
            <span className="field-label">{t('employment.allowancesLabel')}</span>
            <TextInput value={allowances} onChange={setAllowances} inputMode="numeric" />
          </label>
          <label className="field">
            <span className="field-label">{t('employment.deductionsLabel')}</span>
            <TextInput value={deductions} onChange={setDeductions} inputMode="numeric" />
          </label>
          <div className="field">
            <Button
              variant="primary"
              busy={busy}
              disabled={!basic}
              onClick={() =>
                void run(
                  () =>
                    api.post('/hrms/payslips', {
                      user_id: employeeId ? Number(employeeId) : null,
                      period: runPeriod,
                      basic: Number(basic),
                      allowances: Number(allowances) || 0,
                      deductions: Number(deductions) || 0,
                    }),
                  t('employment.generated'),
                )
              }
            >
              {t('employment.generate')}
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <SectionTitle
          right={
            <div style={{ minWidth: 150 }}>
              <TextInput value={period} onChange={setPeriod} placeholder={t('employment.periodFilterPlaceholder')} />
            </div>
          }
        >
          {t('employment.payroll')}
        </SectionTitle>
        {payroll.loading && !payroll.data ? (
          <LoadingState />
        ) : (payroll.data?.payslips ?? []).length === 0 ? (
          <div className="tiny muted">{t('employment.noPayslipsView')}</div>
        ) : (
          <ul className="list-reset stack" style={{ gap: 8 }}>
            {(payroll.data?.payslips ?? []).map((slip) => (
              <li key={slip.id} className="row-between wrap small" style={{ gap: 8 }}>
                <span>
                  <span className="bold">
                    {slip.employee?.full_name ?? `${t('employment.employeePrefix')} ${slip.id}`}
                  </span>
                  <span className="muted"> · {slip.period} </span>
                  <Badge tone={slip.state === 'PAID' ? 'done' : 'warn'}>{t(`employment.slipState.${slip.state}`)}</Badge>
                </span>
                <span className="row" style={{ gap: 8, alignItems: 'center' }}>
                  <strong>{money(slip.net_pay)}</strong>
                  {slip.state !== 'PAID' ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      busy={busy}
                      onClick={() => void run(() => api.post(`/hrms/payslips/${slip.id}/pay`, {}), t('employment.settled'))}
                    >
                      {t('employment.markPaid')}
                    </Button>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  )
}
