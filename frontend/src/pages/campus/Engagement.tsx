/** Engagement: feedback about the campus, and the activities it runs.
 *
 *  Four screens in one file because they share a vocabulary and a shape: a
 *  student submits or joins, the office reads and acts. The rating control is a
 *  row of buttons rather than a number input, because a 1-5 score is the whole
 *  interaction and a spinner would be a worse answer to the same question.
 */

import { useState } from 'react'
import { ApiError, api } from '../../lib/api'
import { useRemote } from '../../state/hooks'
import { useSession } from '../../state/session'
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
  ProgressBar,
  SectionTitle,
  Select,
  TextArea,
  TextInput,
} from '../../components/ui'

// --- Feedback --------------------------------------------------------------

interface FeedbackRow {
  id: number
  kind: string
  subject: string
  message: string
  rating: number
  is_anonymous: boolean
  state: string
  response: string | null
  submitted_at: string | null
  responded_at: string | null
}

/** A request from the office, asking a group for their feedback. */
interface FeedbackRequestRow {
  id: number
  subject: string
  message: string
  audience: string[]
  due_on: string | null
  state: string
  created_at: string | null
  asked: number
  answered: number
  average_rating: number | null
  answered_by_me: boolean | null
}

const FEEDBACK_KINDS = ['ACADEMIC', 'FACULTY', 'FACILITY', 'MESS', 'HOSTEL', 'ADMINISTRATION', 'OTHER']

/** Who a request can be addressed to, as the value the API expects, and the
 *  key that names each audience. A request normally goes to one group. */
const AUDIENCES: { value: string; labelKey: string }[] = [
  { value: 'STUDENT', labelKey: 'feedback.audienceStudents' },
  { value: 'TEACHER', labelKey: 'feedback.audienceTeachers' },
  { value: 'STUDENT,TEACHER', labelKey: 'feedback.audienceBoth' },
]

const audienceLabelKey = (key: string) =>
  AUDIENCES.find((audience) => audience.value === key)?.labelKey ??
  (key === 'TEACHER' ? 'feedback.audienceTeachers' : 'feedback.audienceStudents')

const FEEDBACK_TONE: Record<string, 'warn' | 'progress' | 'done'> = {
  OPEN: 'warn',
  ACKNOWLEDGED: 'progress',
  RESOLVED: 'done',
}

const stars = (rating: number) => '★'.repeat(rating) + '☆'.repeat(Math.max(0, 5 - rating))

function RatingPicker({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const { t } = useLanguage()
  return (
    <div className="row" style={{ gap: 4 }} role="radiogroup" aria-label={t('feedback.rating')}>
      {[1, 2, 3, 4, 5].map((score) => (
        <Button
          key={score}
          size="sm"
          variant={value === score ? 'primary' : 'ghost'}
          onClick={() => onChange(score)}
          ariaLabel={`${score} ${t('feedback.outOf')}`}
        >
          {score}
        </Button>
      ))}
    </div>
  )
}

function FeedbackCard({ row, onRespond }: { row: FeedbackRow; onRespond?: (id: number) => void }) {
  const { t } = useLanguage()
  return (
    <Card>
      <SectionTitle right={<Badge tone={FEEDBACK_TONE[row.state] ?? 'ghost'}>{t(`feedback.state.${row.state}`)}</Badge>}>
        {row.subject}
      </SectionTitle>
      <div className="row" style={{ gap: 8, alignItems: 'center' }}>
        <span aria-label={`${row.rating} ${t('feedback.outOf')}`}>{stars(row.rating)}</span>
        <span className="tiny muted">
          {t(`feedback.kind.${row.kind}`)} ·{' '}
          {row.is_anonymous ? t('feedback.anonymousTag') : t('feedback.signedTag')}
          {row.submitted_at ? ` · ${row.submitted_at.slice(0, 10)}` : ''}
        </span>
      </div>
      <p className="small" style={{ marginTop: 6 }}>{row.message}</p>
      {row.response ? (
        <div className="tiny" style={{ marginTop: 6 }}>
          <strong>{t('feedback.office')}</strong> {row.response}
        </div>
      ) : null}
      {onRespond && row.state !== 'RESOLVED' ? (
        <div style={{ marginTop: 10 }}>
          <Button size="sm" variant="primary" onClick={() => onRespond(row.id)}>
            {t('feedback.respond')}
          </Button>
        </div>
      ) : null}
    </Card>
  )
}

export function FeedbackPage() {
  const { t } = useLanguage()
  const state = useRemote<{ feedback: FeedbackRow[] }>('feedback:me', (signal) =>
    api.get<{ feedback: FeedbackRow[] }>('/feedback/me', signal),
  )
  // What the office has asked this person for. Answering one is the same
  // submission with a request attached, so the form stays the same form and
  // the answer can be counted against the ask.
  const requests = useRemote<{ requests: FeedbackRequestRow[] }>('feedback:requests:mine', (signal) =>
    api.get<{ requests: FeedbackRequestRow[] }>('/feedback/requests/mine', signal),
  )
  const [answering, setAnswering] = useState<FeedbackRequestRow | null>(null)
  const [kind, setKind] = useState('ACADEMIC')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [rating, setRating] = useState(4)
  const [anonymous, setAnonymous] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState<string | null>(null)

  const submit = async () => {
    setBusy(true)
    setError(null)
    setSent(null)
    try {
      await api.post('/feedback', {
        kind,
        subject,
        message,
        rating,
        is_anonymous: anonymous,
        request_id: answering ? answering.id : null,
      })
      setSubject('')
      setMessage('')
      setAnswering(null)
      setSent(t('feedback.thanks'))
      await Promise.all([state.refresh(), requests.refresh()])
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : t('feedback.couldNot'))
    } finally {
      setBusy(false)
    }
  }

  const startAnswer = (row: FeedbackRequestRow) => {
    setAnswering(row)
    setSubject(row.subject)
    setMessage('')
    setSent(null)
    setError(null)
  }

  const openRequests = requests.data?.requests ?? []

  return (
    <>
      <PageHeader
        guide="feedback-head"
        title={t('feedback.title')}
        subtitle={t('feedback.subtitle')}
        kicker={t('engagement.kicker')}
      />

      {openRequests.length > 0 ? (
        <>
          <SectionTitle>{t('feedback.openRequests')}</SectionTitle>
          {openRequests.map((row) => (
            <Card key={row.id} data-guide="feedback-request">
              <SectionTitle
                right={
                  <Badge tone={row.answered_by_me ? 'done' : 'warn'}>
                    {row.answered_by_me ? t('feedback.answered') : t(`feedback.state.OPEN`)}
                  </Badge>
                }
              >
                {row.subject}
              </SectionTitle>
              <p className="small" style={{ marginTop: 6 }}>{row.message}</p>
              {row.due_on ? (
                <div className="tiny muted">{t('feedback.askDue')} {row.due_on.slice(0, 10)}</div>
              ) : null}
              {row.answered_by_me ? null : (
                <div style={{ marginTop: 10 }}>
                  <Button size="sm" variant="primary" onClick={() => startAnswer(row)}>
                    {t('feedback.answer')}
                  </Button>
                </div>
              )}
            </Card>
          ))}
        </>
      ) : null}

      <Card data-guide="feedback-give">
        <SectionTitle
          right={
            answering ? (
              <Button size="sm" variant="ghost" onClick={() => { setAnswering(null); setSubject(''); setMessage('') }}>
                {t('action.cancel')}
              </Button>
            ) : undefined
          }
        >
          {answering ? `${t('feedback.answering')} “${answering.subject}”` : t('feedback.give')}
        </SectionTitle>
        <div className="grid-2">
          <label className="field">
            <span className="field-label">{t('feedback.about')}</span>
            <Select
              value={kind}
              onChange={setKind}
              options={FEEDBACK_KINDS.map((k) => ({ value: k, label: t(`feedback.kind.${k}`) }))}
            />
          </label>
          <div className="field">
            <span className="field-label">{t('feedback.rating')}</span>
            <RatingPicker value={rating} onChange={setRating} />
          </div>
        </div>
        <label className="field" style={{ marginTop: 8 }}>
          <span className="field-label">{t('feedback.subject')}</span>
          <TextInput value={subject} onChange={setSubject} maxLength={160} placeholder={t('feedback.subjectPlaceholder')} />
        </label>
        <label className="field" style={{ marginTop: 8 }}>
          <span className="field-label">{t('feedback.bodyLabel')}</span>
          <TextArea value={message} onChange={setMessage} rows={4} placeholder={t('feedback.bodyPlaceholder')} />
        </label>
        <div className="row-between wrap" style={{ marginTop: 10, gap: 8 }}>
          <label className="row small" style={{ cursor: 'pointer', gap: 6 }}>
            <input
              className="checkbox"
              type="checkbox"
              checked={anonymous}
              onChange={(event) => setAnonymous(event.target.checked)}
            />
            {t('feedback.anonymous')}
          </label>
          <Button
            variant="primary"
            busy={busy}
            disabled={subject.trim().length < 3 || message.trim().length < 5}
            onClick={() => void submit()}
          >
            {t('feedback.send')}
          </Button>
        </div>
      </Card>

      {sent ? <div className="banner banner-info" role="status">{sent}</div> : null}
      {error ? <div className="banner banner-error" role="alert">{error}</div> : null}

      <SectionTitle>{t('feedback.sentTitle')}</SectionTitle>
      {state.loading && !state.data ? (
        <LoadingState />
      ) : state.error && !state.data ? (
        <ErrorState message={state.error} onRetry={() => void state.refresh()} />
      ) : (state.data?.feedback ?? []).length === 0 ? (
        <EmptyState title={t('feedback.empty')} detail={t('feedback.emptyDetail')} />
      ) : (
        (state.data?.feedback ?? []).map((row) => <FeedbackCard key={row.id} row={row} />)
      )}
    </>
  )
}

export function FeedbackInboxPage() {
  const { t } = useLanguage()
  const [filter, setFilter] = useState('')
  const state = useRemote<{
    feedback: FeedbackRow[]
    count: number
    average_rating: number | null
    open: number
  }>(
    `feedback:inbox:${filter}`,
    (signal) => api.get(`/feedback${filter ? `?state=${filter}` : ''}`, signal),
    { cacheKey: null },
  )
  const [responding, setResponding] = useState<FeedbackRow | null>(null)
  const [response, setResponse] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const send = async () => {
    if (!responding) return
    setBusy(true)
    setError(null)
    try {
      await api.post(`/feedback/${responding.id}/respond`, { response, state: 'RESOLVED' })
      setResponding(null)
      setResponse('')
      await state.refresh()
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : t('feedback.couldNotRespond'))
    } finally {
      setBusy(false)
    }
  }

  const rows = state.data?.feedback ?? []

  // Asking is management's half of the office: faculty read the queue they hold
  // feedback:manage for, but they do not get to go around requesting feedback
  // from the people they teach.
  const { can } = useSession()
  const canAsk = can('feedback:request')
  const asks = useRemote<{ requests: FeedbackRequestRow[]; count: number; open: number }>(
    canAsk ? 'feedback:requests:sent' : null,
    () => api.get('/feedback/requests'),
  )
  const [askSubject, setAskSubject] = useState('')
  const [askMessage, setAskMessage] = useState('')
  const [askAudience, setAskAudience] = useState(AUDIENCES[0].value)
  const [askDue, setAskDue] = useState('')
  const [askBusy, setAskBusy] = useState(false)
  const [askNotice, setAskNotice] = useState<string | null>(null)
  const [askError, setAskError] = useState<string | null>(null)

  const ask = async () => {
    setAskBusy(true)
    setAskError(null)
    setAskNotice(null)
    try {
      await api.post('/feedback/requests', {
        subject: askSubject,
        message: askMessage,
        audience: askAudience.split(','),
        due_on: askDue ? `${askDue}T00:00:00` : null,
      })
      setAskSubject('')
      setAskMessage('')
      setAskDue('')
      setAskNotice(t('feedback.askSent'))
      await asks.refresh()
    } catch (requestError) {
      setAskError(requestError instanceof ApiError ? requestError.message : t('feedback.askCouldNot'))
    } finally {
      setAskBusy(false)
    }
  }

  const closeAsk = async (id: number) => {
    setAskError(null)
    try {
      await api.post(`/feedback/requests/${id}/close`, {})
      await asks.refresh()
    } catch (requestError) {
      setAskError(requestError instanceof ApiError ? requestError.message : t('feedback.askCouldNot'))
    }
  }

  return (
    <>
      <PageHeader
        title={t('feedback.inboxTitle')}
        subtitle={t('feedback.inboxSubtitle')}
        kicker={t('engagement.kicker')}
        actions={
          <div style={{ minWidth: 180 }}>
            <Select
              value={filter}
              onChange={setFilter}
              options={[
                { value: '', label: t('feedback.everything') },
                { value: 'OPEN', label: t('feedback.state.OPEN') },
                { value: 'ACKNOWLEDGED', label: t('feedback.state.ACKNOWLEDGED') },
                { value: 'RESOLVED', label: t('feedback.state.RESOLVED') },
              ]}
            />
          </div>
        }
      />

      {canAsk ? (
        <Card data-guide="feedback-ask">
          <SectionTitle>{t('feedback.askTitle')}</SectionTitle>
          <div className="grid-2">
            <label className="field">
              <span className="field-label">{t('feedback.subject')}</span>
              <TextInput
                value={askSubject}
                onChange={setAskSubject}
                maxLength={160}
                placeholder={t('feedback.subjectPlaceholder')}
              />
            </label>
            <label className="field">
              <span className="field-label">{t('feedback.askAudience')}</span>
              <Select
                value={askAudience}
                onChange={setAskAudience}
                options={AUDIENCES.map((row) => ({ value: row.value, label: t(row.labelKey) }))}
              />
            </label>
          </div>
          <label className="field" style={{ marginTop: 8 }}>
            <span className="field-label">{t('feedback.bodyLabel')}</span>
            <TextArea
              value={askMessage}
              onChange={setAskMessage}
              rows={3}
              placeholder={t('feedback.askMessagePlaceholder')}
            />
          </label>
          <div className="row-between wrap" style={{ marginTop: 10, gap: 8, alignItems: 'flex-end' }}>
            <label className="field" style={{ maxWidth: 200 }}>
              <span className="field-label">{t('feedback.askDue')}</span>
              <TextInput value={askDue} onChange={setAskDue} type="date" />
            </label>
            <Button
              variant="primary"
              busy={askBusy}
              disabled={askSubject.trim().length < 3 || askMessage.trim().length < 5}
              onClick={() => void ask()}
            >
              {t('feedback.askSend')}
            </Button>
          </div>
        </Card>
      ) : null}

      {askNotice ? <div className="banner banner-info" role="status">{askNotice}</div> : null}
      {askError ? <div className="banner banner-error" role="alert">{askError}</div> : null}

      {canAsk ? (
        <>
          <SectionTitle>{t('feedback.askedTitle')}</SectionTitle>
          {asks.loading && !asks.data ? (
            <LoadingState />
          ) : (asks.data?.requests ?? []).length === 0 ? (
            <EmptyState title={t('feedback.nothingAsked')} detail={t('feedback.nothingAskedDetail')} />
          ) : (
            (asks.data?.requests ?? []).map((row) => (
              <Card key={row.id}>
                <SectionTitle
                  right={
                    <Badge tone={row.state === 'OPEN' ? 'progress' : 'ghost'}>
                      {row.state === 'OPEN' ? t('feedback.requestOpen') : t('feedback.requestClosed')}
                    </Badge>
                  }
                >
                  {row.subject}
                </SectionTitle>
                <div className="tiny muted">
                  {row.audience.map((key) => t(audienceLabelKey(key))).join(' · ')}
                  {row.due_on ? ` · ${t('feedback.askDue')} ${row.due_on.slice(0, 10)}` : ''}
                </div>
                <p className="small" style={{ marginTop: 6 }}>{row.message}</p>
                <div className="row-between wrap" style={{ marginTop: 8, gap: 8, alignItems: 'center' }}>
                  <Badge tone={row.answered > 0 ? 'done' : 'ghost'}>
                    {row.answered}/{row.asked} {t('feedback.answers')}
                  </Badge>
                  {row.state === 'OPEN' ? (
                    <Button size="sm" variant="ghost" onClick={() => void closeAsk(row.id)}>
                      {t('feedback.closeRequest')}
                    </Button>
                  ) : null}
                </div>
              </Card>
            ))
          )}
        </>
      ) : null}

      <Card>
        <div className="grid-3">
          <Metric label={t('feedback.received')} value={state.data?.count ?? 0} />
          <Metric label={t('feedback.stillOpen')} value={state.data?.open ?? 0} tone={(state.data?.open ?? 0) > 0 ? 'warn' : 'done'} />
          <Metric label={t('feedback.averageRating')} value={state.data?.average_rating ?? '—'} />
        </div>
      </Card>

      {error ? <div className="banner banner-error" role="alert">{error}</div> : null}

      {responding ? (
        <Card>
          <SectionTitle
            right={
              <Button size="sm" variant="ghost" onClick={() => setResponding(null)}>
                {t('action.cancel')}
              </Button>
            }
          >
            {t('feedback.respondTo')} “{responding.subject}”
          </SectionTitle>
          <TextArea value={response} onChange={setResponse} rows={3} placeholder={t('feedback.responsePlaceholder')} />
          <div style={{ marginTop: 10 }}>
            <Button variant="primary" busy={busy} disabled={response.trim().length === 0} onClick={() => void send()}>
              {t('feedback.sendResponse')}
            </Button>
          </div>
        </Card>
      ) : null}

      {state.loading && !state.data ? (
        <LoadingState />
      ) : state.error && !state.data ? (
        <ErrorState message={state.error} onRetry={() => void state.refresh()} />
      ) : rows.length === 0 ? (
        <EmptyState title={t('feedback.noMatches')} detail={t('feedback.noMatchesDetail')} />
      ) : (
        rows.map((row) => (
          <FeedbackCard
            key={row.id}
            row={row}
            onRespond={(id) => {
              const target = rows.find((candidate) => candidate.id === id) ?? null
              setResponding(target)
              setResponse('')
            }}
          />
        ))
      )}
    </>
  )
}

// --- Activities ------------------------------------------------------------

interface ActivityRow {
  id: number
  name: string
  kind: string
  state: string
  description: string | null
  venue: string | null
  starts_at: string | null
  ends_at: string | null
  capacity: number
  registered: number
  seats_left: number | null
  is_full: boolean
}

const ACTIVITY_KINDS = ['CLUB', 'SPORT', 'CULTURAL', 'TECHNICAL', 'COMMUNITY']

const when = (value: string | null) => (value ? value.replace('T', ' ').slice(0, 16) : '—')

export function ActivitiesPage() {
  const { t } = useLanguage()
  const state = useRemote<{ activities: ActivityRow[]; count: number }>('activities:board', (signal) =>
    api.get('/activities', signal),
  )
  const mine = useRemote<{ registrations: { id: number; state: string; activity: { id: number } | null }[] }>(
    'activities:mine',
    (signal) => api.get('/activities/me', signal),
  )
  const [busyId, setBusyId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const joined = new Set(
    (mine.data?.registrations ?? [])
      .filter((registration) => registration.state !== 'CANCELLED')
      .map((registration) => registration.activity?.id),
  )

  const act = async (activity: ActivityRow, join: boolean) => {
    setBusyId(activity.id)
    setError(null)
    setMessage(null)
    try {
      if (join) {
        const result = await api.post<{ waitlisted: boolean }>(`/activities/${activity.id}/register`, {})
        setMessage(
          result.waitlisted
            ? `${t('activities.onWaitlist')} ${activity.name}.`
            : `${t('activities.registeredForMsg')} ${activity.name}.`,
        )
      } else {
        await api.post(`/activities/${activity.id}/withdraw`, {})
        setMessage(`${t('activities.withdrawnFrom')} ${activity.name}.`)
      }
      await Promise.all([state.refresh(), mine.refresh()])
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : t('activities.didNotWork'))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <>
      <PageHeader
        guide="activities-head"
        title={t('activities.title')}
        subtitle={t('activities.subtitle')}
        kicker={t('engagement.kicker')}
      />

      {message ? <div className="banner banner-info" role="status">{message}</div> : null}
      {error ? <div className="banner banner-error" role="alert">{error}</div> : null}

      {state.loading && !state.data ? (
        <LoadingState />
      ) : state.error && !state.data ? (
        <ErrorState message={state.error} onRetry={() => void state.refresh()} />
      ) : (state.data?.activities ?? []).length === 0 ? (
        <EmptyState title={t('activities.empty')} detail={t('activities.emptyDetail')} />
      ) : (
        (state.data?.activities ?? []).map((activity) => {
          const isJoined = joined.has(activity.id)
          return (
            <Card key={activity.id} data-guide="activities-list">
              <SectionTitle
                right={
                  <Badge tone={activity.is_full ? 'urgent' : activity.state === 'OPEN' ? 'done' : 'ghost'}>
                    {activity.is_full ? t('activities.waitlist') : t(`activities.state.${activity.state}`)}
                  </Badge>
                }
              >
                {activity.name}
              </SectionTitle>
              <div className="tiny muted">
                {t(`activities.kind.${activity.kind}`)} · {when(activity.starts_at)}
                {activity.venue ? ` · ${activity.venue}` : ''}
              </div>
              {activity.description ? <p className="small" style={{ marginTop: 6 }}>{activity.description}</p> : null}
              <div className="row-between small" style={{ marginTop: 8 }}>
                <span className="muted">
                  {activity.capacity === 0
                    ? `${activity.registered} ${t('activities.registered')} · ${t('activities.noCap')}`
                    : `${activity.registered} / ${activity.capacity} ${t('activities.places')}`}
                </span>
                <span className="tiny muted">
                  {activity.seats_left === null ? '' : `${activity.seats_left} ${t('activities.left')}`}
                </span>
              </div>
              {activity.capacity > 0 ? (
                <div style={{ marginTop: 6 }}>
                  <ProgressBar value={activity.registered} max={activity.capacity} tone="mint" />
                </div>
              ) : null}
              <div style={{ marginTop: 10 }}>
                {isJoined ? (
                  <Button size="sm" variant="ghost" busy={busyId === activity.id} onClick={() => void act(activity, false)}>
                    {t('activities.withdraw')}
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="primary"
                    busy={busyId === activity.id}
                    disabled={activity.state !== 'OPEN'}
                    onClick={() => void act(activity, true)}
                  >
                    {activity.is_full ? t('activities.joinWaitlist') : t('activities.register')}
                  </Button>
                )}
              </div>
            </Card>
          )
        })
      )}
    </>
  )
}

export function ActivityManagePage() {
  const { t } = useLanguage()
  const state = useRemote<{ activities: ActivityRow[]; count: number }>('activities:manage', (signal) =>
    api.get('/activities?include_closed=true', signal),
  )
  const [name, setName] = useState('')
  const [kind, setKind] = useState('CLUB')
  const [venue, setVenue] = useState('')
  const [starts, setStarts] = useState('')
  const [capacity, setCapacity] = useState('0')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [roster, setRoster] = useState<{ name: string; rows: { id: number; state: string; student: { full_name: string; roll_number: string } | null }[] } | null>(null)

  const publish = async () => {
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      await api.post('/activities', {
        name,
        kind,
        venue: venue || null,
        description: description || null,
        starts_at: starts,
        capacity: Number(capacity) || 0,
        state: 'OPEN',
      })
      setName('')
      setDescription('')
      setMessage(t('activities.published'))
      await state.refresh()
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : t('activities.couldNotPublish'))
    } finally {
      setBusy(false)
    }
  }

  const showRoster = async (activity: ActivityRow) => {
    setError(null)
    try {
      const payload = await api.get<{
        registrations: { id: number; state: string; student: { full_name: string; roll_number: string } | null }[]
      }>(`/activities/${activity.id}/registrations`)
      setRoster({ name: activity.name, rows: payload.registrations })
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : t('activities.couldNotLoad'))
    }
  }

  return (
    <>
      <PageHeader
        title={t('activities.deskTitle')}
        subtitle={t('activities.deskSubtitle')}
        kicker={t('engagement.kicker')}
      />

      <Card>
        <SectionTitle>{t('activities.publishTitle')}</SectionTitle>
        <div className="grid-3">
          <label className="field">
            <span className="field-label">{t('activities.name')}</span>
            <TextInput value={name} onChange={setName} maxLength={160} />
          </label>
          <label className="field">
            <span className="field-label">{t('activities.type')}</span>
            <Select value={kind} onChange={setKind} options={ACTIVITY_KINDS.map((k) => ({ value: k, label: t(`activities.kind.${k}`) }))} />
          </label>
          <label className="field">
            <span className="field-label">{t('activities.capacity')}</span>
            <TextInput value={capacity} onChange={setCapacity} inputMode="numeric" />
          </label>
        </div>
        <div className="grid-3" style={{ marginTop: 8 }}>
          <label className="field">
            <span className="field-label">{t('activities.starts')}</span>
            <TextInput value={starts} onChange={setStarts} type="datetime-local" />
          </label>
          <label className="field">
            <span className="field-label">{t('activities.venue')}</span>
            <TextInput value={venue} onChange={setVenue} />
          </label>
        </div>
        <label className="field" style={{ marginTop: 8 }}>
          <span className="field-label">{t('activities.description')}</span>
          <TextArea value={description} onChange={setDescription} rows={2} />
        </label>
        <div className="hint" style={{ marginTop: 4 }}>{t('activities.capacityHint')}</div>
        <div style={{ marginTop: 10 }}>
          <Button variant="primary" busy={busy} disabled={name.trim().length < 3 || !starts} onClick={() => void publish()}>
            {t('activities.publish')}
          </Button>
        </div>
      </Card>

      {message ? <div className="banner banner-info" role="status">{message}</div> : null}
      {error ? <div className="banner banner-error" role="alert">{error}</div> : null}

      {roster ? (
        <Card>
          <SectionTitle
            right={
              <Button size="sm" variant="ghost" onClick={() => setRoster(null)}>
                {t('action.close')}
              </Button>
            }
          >
            {t('activities.rosterTitle')} {roster.name}
          </SectionTitle>
          {roster.rows.length === 0 ? (
            <div className="tiny muted">{t('activities.nobodyRegistered')}</div>
          ) : (
            <ul className="list-reset stack" style={{ gap: 4 }}>
              {roster.rows.map((row) => (
                <li key={row.id} className="row-between tiny">
                  <span>
                    {row.student?.roll_number} · {row.student?.full_name}
                  </span>
                  <span className="muted">{t(`activities.regState.${row.state}`)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}

      {state.loading && !state.data ? (
        <LoadingState />
      ) : state.error && !state.data ? (
        <ErrorState message={state.error} onRetry={() => void state.refresh()} />
      ) : (
        (state.data?.activities ?? []).map((activity) => (
          <Card key={activity.id}>
            <SectionTitle right={<Badge tone={activity.state === 'OPEN' ? 'done' : 'ghost'}>{t(`activities.state.${activity.state}`)}</Badge>}>
              {activity.name}
            </SectionTitle>
            <div className="tiny muted">
              {t(`activities.kind.${activity.kind}`)} · {when(activity.starts_at)} · {activity.registered}{' '}
              {t('activities.registered')}
            </div>
            <div style={{ marginTop: 10 }}>
              <Button size="sm" variant="ghost" onClick={() => void showRoster(activity)}>
                {t('activities.viewRegistrations')}
              </Button>
            </div>
          </Card>
        ))
      )}
    </>
  )
}
