/** My fees: what a student has been billed and what has been received.
 *
 *  Two questions matter at this screen, and the old layout answered neither
 *  cleanly: how much is still owed, and can I prove a payment. So the balance
 *  leads, the records become one table ("which head, which term, what is left"),
 *  and every receipt is flattened into a single history with its reference, in
 *  the order a counter clerk would ask for it.
 */

import { api } from '../../lib/api'
import { useRemote } from '../../state/hooks'
import {
  Badge,
  Bento,
  BentoItem,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  Panel,
  ProgressBar,
  StatTile,
} from '../../components/ui'

interface FeePayment {
  id: number
  amount: number
  paid_on: string
  method: string
  reference: string | null
}

interface FeeRecord {
  id: number
  term: string
  label: string
  amount: number
  paid: number
  balance: number
  due_date: string | null
  status: string
  payments: FeePayment[]
}

interface FeesPayload {
  student: { id: number; full_name: string; roll_number: string } | null
  summary: { total: number; paid: number; pending: number; percentage: number | null }
  records: FeeRecord[]
}

const STATUS_TONE: Record<string, 'done' | 'urgent' | 'warn' | 'ghost'> = {
  PAID: 'done',
  PARTIALLY_PAID: 'warn',
  PENDING: 'ghost',
  OVERDUE: 'urgent',
}

const STATUS_WORD: Record<string, string> = {
  PAID: 'Paid in full',
  PARTIALLY_PAID: 'Partly paid',
  PENDING: 'Not yet due',
  OVERDUE: 'Overdue',
}

const money = (value: number) => `₹${value.toLocaleString('en-IN')}`

export function StudentFeesPage() {
  const state = useRemote<FeesPayload>('fees:me', (signal) => api.get<FeesPayload>('/fees/me', signal), {
    cacheKey: 'fees:me',
  })

  const summary = state.data?.summary
  const records = state.data?.records ?? []
  const overdue = records.filter((record) => record.status === 'OVERDUE')
  const receipts = records
    .flatMap((record) => record.payments.map((payment) => ({ ...payment, label: record.label, term: record.term })))
    .sort((a, b) => b.paid_on.localeCompare(a.paid_on))
  const nextDue = records
    .filter((record) => record.balance > 0 && record.due_date)
    .sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? ''))[0]

  return (
    <div className="stack-lg">
      {state.stale ? (
        <div className="banner banner-info">
          Showing the copy this device saved. It refreshes when the network returns.
        </div>
      ) : null}

      <PageHeader
        guide="fees-head"
        kicker="Accounts & Fees"
        title="My fees"
        subtitle="What the accounts office has billed you, what has been received, and what you still owe."
        actions={
          <Badge tone={summary && summary.pending > 0 ? 'urgent' : 'done'}>
            {summary && summary.pending > 0 ? `${money(summary.pending)} due` : 'All settled'}
          </Badge>
        }
      />

      {state.loading && !state.data ? (
        <LoadingState label="Loading your fee records" />
      ) : state.error && !state.data ? (
        <ErrorState
          message={state.error}
          offline={state.errorCode === 'network_unreachable'}
          onRetry={() => void state.refresh()}
        />
      ) : records.length === 0 ? (
        <EmptyState
          title="No fee records yet"
          detail="Your fee heads and dues appear here once the accounts office publishes them for the term."
        />
      ) : (
        <>
          {overdue.length > 0 ? (
            <div className="banner banner-warn" role="status">
              {overdue.length === 1 ? 'One fee head is overdue' : `${overdue.length} fee heads are overdue`} —{' '}
              {money(overdue.reduce((sum, record) => sum + record.balance, 0))} in total. A dues clearance is held
              until these are settled.
            </div>
          ) : null}

          <div data-guide="fees-summary">
            <Bento>
              <BentoItem span={3}>
                <StatTile
                  label="Outstanding"
                  value={money(summary?.pending ?? 0)}
                  hint="Still to be paid"
                  icon="fees"
                  tone={summary && summary.pending > 0 ? 'urgent' : 'done'}
                />
              </BentoItem>
              <BentoItem span={3}>
                <StatTile
                  label="Paid so far"
                  value={money(summary?.paid ?? 0)}
                  hint={`of ${money(summary?.total ?? 0)} billed`}
                  icon="check"
                  tone="done"
                />
              </BentoItem>
              <BentoItem span={3}>
                <StatTile
                  label="Fee heads"
                  value={records.length}
                  hint={`${receipts.length} receipt${receipts.length === 1 ? '' : 's'} recorded`}
                  icon="list"
                  tone="ghost"
                />
              </BentoItem>
              <BentoItem span={3}>
                <StatTile
                  label="Next due"
                  value={nextDue?.due_date ?? '—'}
                  hint={nextDue ? `${nextDue.label} · ${money(nextDue.balance)}` : 'Nothing pending'}
                  icon="clock"
                  tone={nextDue ? 'warn' : 'ghost'}
                />
              </BentoItem>
            </Bento>
            <div style={{ marginTop: 'var(--sp-3)', maxWidth: 420 }}>
              <ProgressBar value={summary?.paid ?? 0} max={summary?.total || 1} tone="mint" />
              <p className="tiny muted" style={{ marginTop: 6 }}>
                {summary?.percentage ?? 0}% of everything billed has been received.
              </p>
            </div>
          </div>

          <Panel title="Fee records" subtitle="One row per fee head, with its term and due date." guide="fees-records" flush>
            <div className="table-wrap become-cards">
              <table className="data">
                <thead>
                  <tr>
                    <th>Fee head</th>
                    <th>Term</th>
                    <th>Billed</th>
                    <th>Paid</th>
                    <th>Balance</th>
                    <th>Due date</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((record) => (
                    <tr key={record.id}>
                      <td data-label="Fee head">{record.label}</td>
                      <td data-label="Term">{record.term}</td>
                      <td data-label="Billed">{money(record.amount)}</td>
                      <td data-label="Paid">{money(record.paid)}</td>
                      <td data-label="Balance">
                        <span className={record.balance > 0 ? 'bold' : 'muted'}>{money(record.balance)}</span>
                      </td>
                      <td data-label="Due date">{record.due_date ?? '—'}</td>
                      <td data-label="Status">
                        <Badge tone={STATUS_TONE[record.status] ?? 'ghost'}>
                          {STATUS_WORD[record.status] ?? record.status.replaceAll('_', ' ').toLowerCase()}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel
            title="Payment history"
            subtitle="Every receipt the office has recorded against your name, newest first."
            guide="fees-payments"
            flush
          >
            {receipts.length === 0 ? (
              <p className="muted small" style={{ padding: 'var(--sp-4)', margin: 0 }}>
                No payment has been recorded yet.
              </p>
            ) : (
              <div className="table-wrap become-cards">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Paid on</th>
                      <th>Fee head</th>
                      <th>Method</th>
                      <th>Reference</th>
                      <th>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {receipts.map((payment) => (
                      <tr key={`${payment.label}-${payment.id}`}>
                        <td data-label="Paid on">
                          <span className="mono">{payment.paid_on}</span>
                        </td>
                        <td data-label="Fee head">
                          {payment.label}
                          <span className="tiny muted"> · {payment.term}</span>
                        </td>
                        <td data-label="Method">{payment.method}</td>
                        <td data-label="Reference">
                          <span className="mono tiny">{payment.reference ?? '—'}</span>
                        </td>
                        <td data-label="Amount">{money(payment.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="tiny muted" style={{ marginTop: 'var(--sp-3)' }}>
              Payments are recorded by the accounts office at the counter. Keep the reference number for any query.
            </p>
          </Panel>
        </>
      )}
    </div>
  )
}
