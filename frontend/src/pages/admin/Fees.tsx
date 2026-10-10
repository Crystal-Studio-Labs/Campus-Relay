/** Fee collection: the accounts counter's list of what is still owed.
 *
 *  The old screen was one card titled "Balances" with every unpaid record in a
 *  single column and a bare amount box next to each. At the counter the jobs are
 *  different: see the size of the problem, find one student, and take one
 *  payment. So the totals sit at the top, the list is searchable and filterable,
 *  and each row states the balance plainly next to the amount being received.
 */

import { useMemo, useState } from 'react'
import { ApiError, api } from '../../lib/api'
import { useRemote } from '../../state/hooks'
import {
  Badge,
  Bento,
  BentoItem,
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  Panel,
  Select,
  StatTile,
  TextInput,
  Toolbar,
} from '../../components/ui'

interface OutstandingRecord {
  id: number
  term: string
  label: string
  amount: number
  paid: number
  balance: number
  due_date: string | null
  status: string
  student: { id: number; full_name: string; roll_number: string } | null
}

const money = (value: number) => `₹${value.toLocaleString('en-IN')}`

export function FeeCollectionPage() {
  const state = useRemote<{ records: OutstandingRecord[]; count: number }>(
    'fees:outstanding',
    (signal) => api.get('/fees/outstanding', signal),
    { cacheKey: null },
  )
  const [amounts, setAmounts] = useState<Record<number, string>>({})
  const [busyId, setBusyId] = useState<number | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const recordPayment = async (record: OutstandingRecord) => {
    const amount = Number(amounts[record.id] ?? '')
    if (!amount || amount <= 0) {
      setError('Enter an amount to record.')
      return
    }
    if (amount > record.balance) {
      setError(`That is more than the ${money(record.balance)} outstanding on this record.`)
      return
    }
    setBusyId(record.id)
    setError(null)
    setMessage(null)
    try {
      const result = await api.post<{ record: { paid: number; balance: number } }>(
        `/fees/${record.id}/payments`,
        { amount, method: 'CASH' },
      )
      setMessage(
        `Received ${money(amount)} from ${record.student?.full_name ?? 'the student'}. ` +
          `Balance on ${record.label} is now ${money(result.record.balance)}.`,
      )
      setAmounts((current) => ({ ...current, [record.id]: '' }))
      await state.refresh()
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : 'Could not record the payment.')
    } finally {
      setBusyId(null)
    }
  }

  const rows = state.data?.records ?? []

  // Highest balance first: at the counter the largest debt is the one being
  // asked about, and an overdue record outranks a merely large one.
  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return rows
      .filter((row) => {
        if (statusFilter && row.status !== statusFilter) return false
        if (!needle) return true
        return `${row.student?.full_name ?? ''} ${row.student?.roll_number ?? ''} ${row.label}`.toLowerCase().includes(needle)
      })
      .sort((a, b) => {
        const overdue = (row: OutstandingRecord) => (row.status === 'OVERDUE' ? 0 : 1)
        if (overdue(a) !== overdue(b)) return overdue(a) - overdue(b)
        return b.balance - a.balance
      })
  }, [rows, search, statusFilter])

  const totalOutstanding = rows.reduce((sum, row) => sum + row.balance, 0)
  const overdue = rows.filter((row) => row.status === 'OVERDUE')
  const studentsOwing = new Set(rows.map((row) => row.student?.id ?? row.id)).size

  return (
    <div className="stack-lg">
      <PageHeader
        kicker="Accounts & Fees"
        title="Fee collection"
        subtitle="Every open fee balance on the campus, and a quick way to take one payment and record it."
        actions={<Badge tone="warn">{rows.length} open record{rows.length === 1 ? '' : 's'}</Badge>}
      />

      {message ? <div className="banner banner-info" role="status">{message}</div> : null}
      {error ? <div className="banner banner-error" role="alert">{error}</div> : null}

      {state.loading && !state.data ? (
        <LoadingState label="Loading outstanding balances" />
      ) : state.error && !state.data ? (
        <ErrorState message={state.error} onRetry={() => void state.refresh()} />
      ) : rows.length === 0 ? (
        <EmptyState title="Nothing outstanding" detail="Every fee record on the campus is fully paid." />
      ) : (
        <>
          <Bento>
            <BentoItem span={3}>
              <StatTile
                label="Total outstanding"
                value={money(totalOutstanding)}
                hint={`across ${rows.length} record${rows.length === 1 ? '' : 's'}`}
                icon="fees"
                tone="warn"
              />
            </BentoItem>
            <BentoItem span={3}>
              <StatTile
                label="Overdue"
                value={overdue.length}
                hint={`${money(overdue.reduce((sum, row) => sum + row.balance, 0))} past its due date`}
                icon="warning"
                tone={overdue.length ? 'urgent' : 'ghost'}
              />
            </BentoItem>
            <BentoItem span={3}>
              <StatTile
                label="Students owing"
                value={studentsOwing}
                hint="With at least one open record"
                icon="people"
                tone="open"
              />
            </BentoItem>
            <BentoItem span={3}>
              <StatTile
                label="Largest single balance"
                value={money(rows.reduce((max, row) => Math.max(max, row.balance), 0))}
                hint="The first call of the day"
                icon="insights"
                tone="ghost"
              />
            </BentoItem>
          </Bento>

          <Toolbar>
            <div className="toolbar-field">
              <label className="sr-only" htmlFor="fee-search">
                Search by student or fee head
              </label>
              <TextInput
                id="fee-search"
                value={search}
                onChange={setSearch}
                placeholder="Search roll number, name or fee head"
              />
            </div>
            <div className="toolbar-field">
              <label className="sr-only" htmlFor="fee-status">
                Filter by status
              </label>
              <Select
                id="fee-status"
                value={statusFilter}
                onChange={setStatusFilter}
                options={[
                  { value: '', label: 'All open records' },
                  { value: 'OVERDUE', label: 'Overdue only' },
                  { value: 'PARTIALLY_PAID', label: 'Partly paid' },
                  { value: 'PENDING', label: 'Not yet due' },
                ]}
              />
            </div>
          </Toolbar>

          <Panel
            title="Balances"
            subtitle={
              visible.length === rows.length
                ? 'Overdue first, then by the largest balance.'
                : `${visible.length} of ${rows.length} records shown.`
            }
            flush
          >
            {visible.length === 0 ? (
              <div style={{ padding: 'var(--sp-4)' }}>
                <p className="muted small">
                  No record matches that search. Clear it to see all {rows.length} open record
                  {rows.length === 1 ? '' : 's'}.
                </p>
              </div>
            ) : (
              <div className="table-wrap become-cards">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Fee head</th>
                      <th>Term</th>
                      <th>Billed</th>
                      <th>Paid</th>
                      <th>Balance</th>
                      <th>Due</th>
                      <th>Receive payment</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((record) => (
                      <tr key={record.id}>
                        <td data-label="Student">
                          <span className="mono tiny bold">{record.student?.roll_number ?? '—'}</span>
                          <div>{record.student?.full_name ?? 'Unknown student'}</div>
                        </td>
                        <td data-label="Fee head">{record.label}</td>
                        <td data-label="Term">{record.term}</td>
                        <td data-label="Billed">{money(record.amount)}</td>
                        <td data-label="Paid">{money(record.paid)}</td>
                        <td data-label="Balance">
                          <Badge tone={record.status === 'OVERDUE' ? 'urgent' : 'warn'}>{money(record.balance)}</Badge>
                        </td>
                        <td data-label="Due">
                          {record.due_date ?? '—'}
                          <div className="tiny muted">{record.status.replaceAll('_', ' ').toLowerCase()}</div>
                        </td>
                        <td data-label="Receive payment">
                          <div className="row wrap" style={{ gap: 6, alignItems: 'center' }}>
                            <div style={{ width: 130 }}>
                              <TextInput
                                value={amounts[record.id] ?? ''}
                                onChange={(value) => setAmounts((current) => ({ ...current, [record.id]: value }))}
                                type="number"
                                inputMode="numeric"
                                placeholder={`up to ${record.balance}`}
                              />
                            </div>
                            <Button
                              size="sm"
                              variant="primary"
                              busy={busyId === record.id}
                              onClick={() => void recordPayment(record)}
                            >
                              Receive
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="tiny muted" style={{ padding: 'var(--sp-3) var(--sp-4)', margin: 0 }}>
              Payments recorded here are entered as cash received at the counter. The student sees the receipt with
              its reference in their own fee page immediately.
            </p>
          </Panel>
        </>
      )}
    </div>
  )
}
