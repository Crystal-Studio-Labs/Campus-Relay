/** The weekly timetable, drawn as a timetable.
 *
 *  A timetable is a grid - days across, periods down - and it was previously
 *  rendered as one card per day with a bulleted list inside. That read as a
 *  backlog, not a schedule: nothing lined up, so "what do I have on Wednesday
 *  afternoon" took reading every row. Here the week is a real grid, the period
 *  column and the day header stay put while it scrolls, and today's column is
 *  marked so the answer to "where am I now" is a glance.
 *
 *  One component serves both audiences. A student's week and a teacher's week
 *  are the same shape from the same endpoint family; only the label, the
 *  endpoint and the empty-state wording differ, and duplicating a grid twice is
 *  how the two drift apart.
 */

import { api } from '../lib/api'
import { useRemote } from '../state/hooks'
import { Badge, Bento, BentoItem, EmptyState, ErrorState, LoadingState, PageHeader, Panel, StatTile } from './ui'

interface SubjectBrief {
  id: number
  code: string
  name: string
}

interface Slot {
  id: number
  day: string
  start_time: string
  end_time: string
  room: string | null
  subject: SubjectBrief | null
}

interface TimetablePayload {
  days: string[]
  slots: Slot[]
}

/** The day codes the academics API speaks, in order. Kept local so the grid
 *  does not depend on the order the server happens to send. */
const DAY_ORDER = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']
const DAY_NAMES: Record<string, string> = {
  MON: 'Monday',
  TUE: 'Tuesday',
  WED: 'Wednesday',
  THU: 'Thursday',
  FRI: 'Friday',
  SAT: 'Saturday',
  SUN: 'Sunday',
}

/** The day code for the day the screen is being read on, so the current column
 *  is the reader's today and not the server's. */
function todayCode(): string {
  // getDay() is 0=Sunday, which matches DAY_ORDER only after rotating it.
  return ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][new Date().getDay()]
}

export function TimetableBoard({
  title,
  subtitle,
  kicker,
  endpoint,
  cacheKey,
  emptyTitle,
  emptyDetail,
  guide,
}: {
  title: string
  subtitle: string
  kicker: string
  /** '/timetable/me' for a student, '/timetable/mine' for the staff member. */
  endpoint: string
  cacheKey: string
  emptyTitle: string
  emptyDetail: string
  guide: string
}) {
  const state = useRemote<TimetablePayload>(cacheKey, (signal) => api.get<TimetablePayload>(endpoint, signal), {
    cacheKey,
  })

  const slots = state.data?.slots ?? []
  const today = todayCode()

  // Days come from the server so an institution running a five-day week is not
  // shown a Saturday column it does not teach.
  const days = (state.data?.days ?? DAY_ORDER).slice().sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b))

  const byDay = new Map<string, Slot[]>()
  slots.forEach((slot) => {
    const list = byDay.get(slot.day) ?? []
    list.push(slot)
    byDay.set(slot.day, list)
  })
  byDay.forEach((list) => list.sort((a, b) => a.start_time.localeCompare(b.start_time)))

  // One row per distinct period, so 09:00 Monday and 09:00 Thursday line up.
  const periods = [...new Set(slots.map((slot) => `${slot.start_time}–${slot.end_time}`))].sort()

  const todaySlots = byDay.get(today) ?? []
  const subjectCount = new Set(slots.map((slot) => slot.subject?.code ?? '—')).size
  const activeDays = days.filter((day) => (byDay.get(day) ?? []).length > 0)
  const busiest = activeDays
    .slice()
    .sort((a, b) => (byDay.get(b) ?? []).length - (byDay.get(a) ?? []).length)[0]

  return (
    <div className="stack-lg">
      {state.stale ? (
        <div className="banner banner-info">
          Showing the timetable this device saved. It refreshes when the network returns.
        </div>
      ) : null}

      <PageHeader
        guide={guide}
        kicker={kicker}
        title={title}
        subtitle={subtitle}
        actions={
          <Badge tone={state.stale ? 'ghost' : 'done'}>{state.stale ? 'Saved copy' : 'Live'}</Badge>
        }
      />

      {state.loading && !state.data ? (
        <LoadingState label="Loading the timetable" />
      ) : state.error && !state.data ? (
        <ErrorState
          message={state.error}
          offline={state.errorCode === 'network_unreachable'}
          onRetry={() => void state.refresh()}
        />
      ) : slots.length === 0 ? (
        <EmptyState title={emptyTitle} detail={emptyDetail} />
      ) : (
        <>
          <Bento data-guide={`${guide}-summary`}>
            <BentoItem span={3}>
              <StatTile label="Periods a week" value={slots.length} hint="Across every subject" icon="timetable" tone="open" />
            </BentoItem>
            <BentoItem span={3}>
              <StatTile label="Subjects" value={subjectCount} hint="On your timetable" icon="book" tone="ghost" />
            </BentoItem>
            <BentoItem span={3}>
              <StatTile
                label="Working days"
                value={activeDays.length}
                hint={`of ${days.length} in the week`}
                icon="clock"
                tone="done"
              />
            </BentoItem>
            <BentoItem span={3}>
              <StatTile
                label="Busiest day"
                value={busiest ? DAY_NAMES[busiest] ?? busiest : '—'}
                hint={busiest ? `${(byDay.get(busiest) ?? []).length} periods` : 'Nothing scheduled'}
                icon="insights"
                tone="warn"
              />
            </BentoItem>
          </Bento>

          {/* Today first: this is what a person opens the screen for. */}
          <Panel title="Today" subtitle={DAY_NAMES[today] ?? today} guide={`${guide}-today`}>
            {todaySlots.length === 0 ? (
              <p className="muted small">No classes scheduled today.</p>
            ) : (
              <ul className="list-reset stack" style={{ gap: 'var(--sp-2)' }}>
                {todaySlots.map((slot) => (
                  <li key={slot.id} className="row-between wrap" style={{ gap: 'var(--sp-3)' }}>
                    <span className="row" style={{ gap: 'var(--sp-3)' }}>
                      <span className="mono tiny bold">
                        {slot.start_time}–{slot.end_time}
                      </span>
                      <span className="small">
                        <span className="bold">{slot.subject?.name ?? '—'}</span>
                        {slot.subject?.code ? <span className="mono tiny muted"> · {slot.subject.code}</span> : null}
                      </span>
                    </span>
                    <span className="tiny muted">{slot.room ? `Room ${slot.room}` : 'Room not set'}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {/* The week itself. The plate scrolls sideways rather than shrinking
              a class into an unreadable column. */}
          <Panel
            title="The week"
            subtitle="Periods down, days across. Today is marked."
            guide={`${guide}-week`}
            flush
          >
            <div className="timetable-wrap">
              <table className="timetable">
                <thead>
                  <tr>
                    <th className="period-col" scope="col">
                      Period
                    </th>
                    {days.map((day) => (
                      <th key={day} scope="col" className={day === today ? 'is-today' : undefined}>
                        {DAY_NAMES[day] ?? day}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {periods.map((period) => {
                    const [start, end] = period.split('–')
                    return (
                      <tr key={period}>
                        <td className="period-col">
                          {start}
                          <span className="muted"> – {end}</span>
                        </td>
                        {days.map((day) => {
                          const cell = (byDay.get(day) ?? []).find((slot) => slot.start_time === start)
                          return (
                            <td key={`${day}-${period}`} className={day === today ? 'is-today' : undefined}>
                              {cell ? (
                                <span className="timetable-cell">
                                  <span className="cell-code">{cell.subject?.code ?? '—'}</span>
                                  <span className="cell-name">{cell.subject?.name ?? 'Unassigned'}</span>
                                  <span className="cell-room">{cell.room ? `Room ${cell.room}` : 'Room not set'}</span>
                                </span>
                              ) : (
                                <span className="timetable-gap">—</span>
                              )}
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      )}
    </div>
  )
}
