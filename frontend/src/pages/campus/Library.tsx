/** Library: the catalogue and a student's loans, plus the circulation desk.
 *
 *  Availability, overdue days and the fine are all computed by the server, so
 *  this screen renders the numbers it is told rather than re-deriving them. A
 *  client that recomputed a fine could disagree with the ledger on the desk.
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
  Metric,
  PageHeader,
  SectionTitle,
  Select,
  TextInput,
} from '../../components/ui'

interface BookRow {
  id: number
  isbn: string
  title: string
  author: string | null
  category: string | null
  shelf: string | null
  copies_total: number
  copies_available: number
  is_active: boolean
}

interface LoanRow {
  id: number
  issued_on: string
  due_on: string
  returned_on: string | null
  state: string
  overdue_days: number
  fine: number
  book: BookRow | null
  student: { id: number; full_name: string; roll_number: string } | null
}

const money = (value: number) => `₹${value.toLocaleString('en-IN')}`

function LoanCard({ row, onReturn }: { row: LoanRow; onReturn?: (id: number) => void }) {
  const { t } = useLanguage()
  const overdue = row.overdue_days > 0 && row.state === 'ISSUED'
  return (
    <Card>
      <SectionTitle
        right={
          <Badge tone={row.state === 'RETURNED' ? 'done' : overdue ? 'urgent' : 'progress'}>
            {overdue ? `${row.overdue_days} ${t('library.daysLate')}` : t(`library.state.${row.state}`)}
          </Badge>
        }
      >
        {row.book?.title ?? t('library.unknownTitle')}
      </SectionTitle>
      {row.book ? <div className="tiny muted">{row.book.author}</div> : null}
      {row.student ? (
        <div className="small bold" style={{ marginTop: 4 }}>
          {row.student.roll_number} · {row.student.full_name}
        </div>
      ) : null}
      <div className="row-between small" style={{ marginTop: 6 }}>
        <span className="muted">{t('library.issued')} {row.issued_on}</span>
        <span>{t('library.due')} {row.due_on}</span>
      </div>
      {row.fine > 0 ? (
        <div className="small" style={{ marginTop: 4 }}>
          {t('library.fineOf')} <strong>{money(row.fine)}</strong>
        </div>
      ) : null}
      {onReturn && row.state === 'ISSUED' ? (
        <div style={{ marginTop: 10 }}>
          <Button size="sm" variant="primary" onClick={() => onReturn(row.id)}>
            {t('library.takeReturn')}
          </Button>
        </div>
      ) : null}
    </Card>
  )
}

export function LibraryPage() {
  const { t } = useLanguage()
  const [query, setQuery] = useState('')
  const books = useRemote<{ books: BookRow[]; count: number }>(
    `library:books:${query}`,
    (signal) => api.get(`/library/books${query ? `?q=${encodeURIComponent(query)}` : ''}`, signal),
    { cacheKey: null },
  )
  const loans = useRemote<{ student: { roll_number: string } | null; loans: LoanRow[]; outstanding_fine: number }>(
    'library:loans:me',
    (signal) => api.get('/library/loans/me', signal),
  )

  const active = (loans.data?.loans ?? []).filter((loan) => loan.state === 'ISSUED')

  return (
    <>
      <PageHeader guide="library-head" title={t('library.title')} subtitle={t('library.subtitle')} kicker={t('library.kicker')} />

      <Card data-guide="library-metrics">
        <div className="grid-3">
          <Metric label={t('library.onLoan')} value={active.length} tone={active.length > 0 ? 'progress' : 'done'} />
          <Metric
            label={t('library.fineOutstanding')}
            value={money(loans.data?.outstanding_fine ?? 0)}
            tone={(loans.data?.outstanding_fine ?? 0) > 0 ? 'urgent' : 'done'}
          />
          <Metric label={t('library.titlesFound')} value={books.data?.count ?? 0} />
        </div>
      </Card>

      {loans.loading && !loans.data ? (
        <LoadingState />
      ) : loans.error && !loans.data ? (
        <ErrorState message={loans.error} onRetry={() => void loans.refresh()} />
      ) : active.length === 0 ? (
        <EmptyState title={t('library.nothingOnLoan')} detail={t('library.nothingOnLoanDetail')} />
      ) : (
        active.map((row) => <LoanCard key={row.id} row={row} />)
      )}

      <Card data-guide="library-catalogue">
        <SectionTitle right={<Badge tone="ghost">{books.data?.count ?? 0} {t('library.titles')}</Badge>}>{t('library.catalogue')}</SectionTitle>
        <TextInput value={query} onChange={setQuery} placeholder={t('library.searchPlaceholder')} inputMode="search" />
      </Card>

      {books.loading && !books.data ? (
        <LoadingState />
      ) : (books.data?.books ?? []).length === 0 ? (
        <EmptyState title={t('library.noTitles')} detail={t('library.noTitlesDetail')} />
      ) : (
        (books.data?.books ?? []).map((book) => (
          <Card key={book.id}>
            <SectionTitle
              right={
                <Badge tone={book.copies_available > 0 ? 'done' : 'urgent'}>
                  {book.copies_available > 0 ? `${book.copies_available} ${t('library.available')}` : t('library.allOut')}
                </Badge>
              }
            >
              {book.title}
            </SectionTitle>
            <div className="tiny muted">
              {book.author} · {book.category} · {t('library.shelf')} {book.shelf ?? '—'}
            </div>
          </Card>
        ))
      )}
    </>
  )
}

export function LibraryDeskPage() {
  const { t } = useLanguage()
  const [search, setSearch] = useState('')
  const [issueTarget, setIssueTarget] = useState('')
  const [studentId, setStudentId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const books = useRemote<{ books: BookRow[]; count: number }>(
    `library:desk:books:${search}`,
    (signal) => api.get(`/library/books${search ? `?q=${encodeURIComponent(search)}` : ''}`, signal),
    { cacheKey: null },
  )
  const loans = useRemote<{ loans: LoanRow[]; count: number; overdue: number }>(
    'library:desk:loans',
    (signal) => api.get('/library/loans?active_only=true', signal),
  )

  const run = async (action: () => Promise<unknown>, done: string) => {
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      await action()
      setMessage(done)
      await Promise.all([loans.refresh(), books.refresh()])
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : t('library.didNotWork'))
    } finally {
      setBusy(false)
    }
  }

  const bookOptions = [{ value: '', label: t('library.chooseTitle') }].concat(
    (books.data?.books ?? [])
      .filter((book) => book.copies_available > 0)
      .map((book) => ({ value: String(book.id), label: `${book.title} (${book.copies_available} ${t('library.left')})` })),
  )

  return (
    <>
      <PageHeader
        title={t('library.deskTitle')}
        subtitle={t('library.deskSubtitle')}
        kicker={t('library.kicker')}
      />

      <Card>
        <div className="grid-3">
          <Metric label={t('library.onLoan')} value={loans.data?.count ?? 0} />
          <Metric label={t('library.overdue')} value={loans.data?.overdue ?? 0} tone={(loans.data?.overdue ?? 0) > 0 ? 'urgent' : 'done'} />
          <Metric label={t('library.titles')} value={books.data?.count ?? 0} />
        </div>
      </Card>

      <Card>
        <SectionTitle>{t('library.issueBook')}</SectionTitle>
        <label className="field">
          <span className="field-label">{t('library.titles')}</span>
          <Select value={issueTarget} onChange={setIssueTarget} options={bookOptions} />
        </label>
        <div className="grid-2" style={{ alignItems: 'end', marginTop: 8 }}>
          <label className="field">
            <span className="field-label">{t('library.studentId')}</span>
            <TextInput value={studentId} onChange={setStudentId} inputMode="numeric" placeholder="e.g. 1" />
          </label>
          <div className="field">
            <Button
              variant="primary"
              busy={busy}
              disabled={!issueTarget || !studentId}
              onClick={() =>
                void run(
                  () => api.post('/library/loans', { book_id: Number(issueTarget), student_id: Number(studentId) }),
                  t('library.bookIssued'),
                )
              }
            >
              {t('library.issue')}
            </Button>
          </div>
        </div>
        <div className="hint" style={{ marginTop: 4 }}>
          {t('library.loanPeriodHint')}
        </div>
      </Card>

      <Card>
        <SectionTitle>{t('library.findTitle')}</SectionTitle>
        <TextInput value={search} onChange={setSearch} placeholder={t('library.searchCatalogue')} inputMode="search" />
      </Card>

      {message ? <div className="banner banner-info" role="status">{message}</div> : null}
      {error ? <div className="banner banner-error" role="alert">{error}</div> : null}

      <SectionTitle>{t('library.copiesOut')}</SectionTitle>
      {loans.loading && !loans.data ? (
        <LoadingState />
      ) : loans.error && !loans.data ? (
        <ErrorState message={loans.error} onRetry={() => void loans.refresh()} />
      ) : (loans.data?.loans ?? []).length === 0 ? (
        <EmptyState title={t('library.noCopies')} detail={t('library.noCopiesDetail')} />
      ) : (
        (loans.data?.loans ?? []).map((row) => (
          <LoanCard
            key={row.id}
            row={row}
            onReturn={(id) =>
              void run(() => api.post(`/library/loans/${id}/return`, {}), t('library.returnRecorded'))
            }
          />
        ))
      )}
    </>
  )
}
