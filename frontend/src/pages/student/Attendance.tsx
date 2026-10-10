/** My attendance: a student's own record.
 *
 *  The screen answers three questions in the order they get asked: what is my
 *  overall figure, which subject is pulling it down, and what happened in the
 *  last few classes. It used to be two cards of prose and progress bars with no
 *  totals worth quoting; here the number a student is asked about at the office
 *  window leads, the 75% rule is applied per subject, and the register itself is
 *  a table that survives a phone screen.
 *
 *  The server resolves "whose attendance" from the account - a student is their
 *  own - so the screen never asks which student to show. That would be a client
 *  deciding a data boundary.
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

interface SubjectBrief {
  id: number
  code: string
  name: string
  credits: number
  semester: number
  branch: string | null
  year: string | null
}

interface PerSubject {
  subject_id: number
  subject: SubjectBrief | null
  present: number
  absent: number
  late: number
  excused: number
  total: number
}

interface AttendanceRecord {
  id: number
  on_date: string
  slot: string
  status: string
  subject: SubjectBrief | null
  note: string | null
}

interface AttendancePayload {
  student: { id: number; full_name: string; roll_number: string } | null
  summary: {
    total: number
    present: number
    absent: number
    percentage: number | null
    per_subject: PerSubject[]
  }
  records: AttendanceRecord[]
}

/** The minimum attendance most institutions require before an exam form is
 *  accepted. Named here so the rule is visible in the interface rather than
 *  buried in a percentage colour. */
const MINIMUM_PERCENT = 75

const STATUS_TONE: Record<string, 'done' | 'urgent' | 'warn' | 'ghost'> = {
  PRESENT: 'done',
  ABSENT: 'urgent',
  LATE: 'warn',
  EXCUSED: 'ghost',
}

const STATUS_WORD: Record<string, string> = {
  PRESENT: 'Present',
  ABSENT: 'Absent',
  LATE: 'Late',
  EXCUSED: 'Excused',
}

export function StudentAttendancePage() {
  const state = useRemote<AttendancePayload>(
    'attendance:me',
    (signal) => api.get<AttendancePayload>('/attendance/me', signal),
    { cacheKey: 'attendance:me' },
  )

  const summary = state.data?.summary
  const hasData = Boolean(summary && summary.total > 0)
  const subjects = summary?.per_subject ?? []

  // Late still counts as attended, matching how the server computes the figure.
  const attended = (summary?.present ?? 0) + subjects.reduce((sum, row) => sum + row.late, 0)
  const shortSubjects = subjects.filter((row) => {
    const counted = row.present + row.late
    return row.total > 0 && Math.round((counted / row.total) * 100) < MINIMUM_PERCENT
  })

  return (
    <div className="stack-lg">
      {state.stale ? (
        <div className="banner banner-info">
          Showing the copy this device saved. It refreshes when the network returns.
        </div>
      ) : null}

      <PageHeader
        guide="attendance-head"
        kicker="Academics"
        title="My attendance"
        subtitle="Every class your teachers have marked this term, subject by subject."
        actions={<Badge tone={state.stale ? 'ghost' : 'done'}>{state.stale ? 'Saved copy' : 'Live'}</Badge>}
      />

      {state.loading && !state.data ? (
        <LoadingState label="Loading your attendance" />
      ) : state.error && !state.data ? (
        <ErrorState
          message={state.error}
          offline={state.errorCode === 'network_unreachable'}
          onRetry={() => void state.refresh()}
        />
      ) : !hasData ? (
        <EmptyState
          title="No attendance recorded yet"
          detail="Attendance appears here as soon as your teachers begin marking the register for your subjects."
        />
      ) : (
        <>
          {shortSubjects.length > 0 ? (
            <div className="banner banner-warn" role="status">
              <strong>{shortSubjects.length}</strong>{' '}
              {shortSubjects.length === 1 ? 'subject is' : 'subjects are'} below the {MINIMUM_PERCENT}% needed to sit
              the exam: {shortSubjects.map((row) => row.subject?.code ?? `Subject ${row.subject_id}`).join(', ')}.
            </div>
          ) : null}

          <div data-guide="attendance-summary">
            <Bento>
              <BentoItem span={3}>
                <StatTile
                  label="Overall attendance"
                  value={`${summary?.percentage ?? 0}%`}
                  hint={`${attended} of ${summary?.total ?? 0} classes attended`}
                  icon="attendance"
                  tone={(summary?.percentage ?? 0) < MINIMUM_PERCENT ? 'urgent' : 'done'}
                />
              </BentoItem>
              <BentoItem span={3}>
                <StatTile
                  label="Classes attended"
                  value={summary?.present ?? 0}
                  hint="Marked present"
                  icon="check"
                  tone="done"
                />
              </BentoItem>
              <BentoItem span={3}>
                <StatTile
                  label="Classes missed"
                  value={summary?.absent ?? 0}
                  hint="Marked absent"
                  icon="warning"
                  tone={(summary?.absent ?? 0) > 0 ? 'warn' : 'ghost'}
                />
              </BentoItem>
              <BentoItem span={3}>
                <StatTile
                  label={`Below ${MINIMUM_PERCENT}%`}
                  value={shortSubjects.length}
                  hint={shortSubjects.length ? 'Needs attention' : 'Every subject is clear'}
                  icon="insights"
                  tone={shortSubjects.length ? 'urgent' : 'ghost'}
                />
              </BentoItem>
            </Bento>
          </div>

          <Panel
            title="Attendance by subject"
            subtitle={`Per-subject figures, with the ${MINIMUM_PERCENT}% rule applied.`}
            guide="attendance-subjects"
            flush
          >
            <div className="table-wrap become-cards">
              <table className="data">
                <thead>
                  <tr>
                    <th>Subject</th>
                    <th>Held</th>
                    <th>Present</th>
                    <th>Late</th>
                    <th>Absent</th>
                    <th>Attendance</th>
                  </tr>
                </thead>
                <tbody>
                  {subjects.map((row) => {
                    const counted = row.present + row.late
                    const percent = row.total ? Math.round((counted / row.total) * 100) : 0
                    const short = percent < MINIMUM_PERCENT
                    return (
                      <tr key={row.subject_id}>
                        <td data-label="Subject">
                          <span className="mono tiny bold">{row.subject?.code ?? `S${row.subject_id}`}</span>
                          <div>{row.subject?.name ?? 'Unnamed subject'}</div>
                          {row.subject?.semester ? (
                            <span className="tiny muted">
                              Semester {row.subject.semester}
                              {row.subject.credits ? ` · ${row.subject.credits} credits` : ''}
                            </span>
                          ) : null}
                        </td>
                        <td data-label="Held">{row.total}</td>
                        <td data-label="Present">{row.present}</td>
                        <td data-label="Late">{row.late}</td>
                        <td data-label="Absent">{row.absent}</td>
                        <td data-label="Attendance">
                          <Badge tone={short ? 'urgent' : 'done'}>{percent}%</Badge>
                          <div style={{ marginTop: 6, minWidth: 120 }}>
                            <ProgressBar value={counted} max={row.total || 1} tone={short ? 'status-warn' : 'mint'} />
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel
            title="Recent classes"
            subtitle="The last register entries, newest first."
            guide="attendance-records"
            flush
          >
            <div className="table-wrap become-cards">
              <table className="data">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Period</th>
                    <th>Subject</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(state.data?.records ?? []).map((record) => (
                    <tr key={record.id}>
                      <td data-label="Date">
                        <span className="mono">{record.on_date}</span>
                      </td>
                      <td data-label="Period">{record.slot}</td>
                      <td data-label="Subject">
                        <span className="mono tiny bold">{record.subject?.code ?? '—'}</span> {record.subject?.name}
                      </td>
                      <td data-label="Status">
                        <Badge tone={STATUS_TONE[record.status] ?? 'ghost'}>
                          {STATUS_WORD[record.status] ?? record.status.replaceAll('_', ' ').toLowerCase()}
                        </Badge>
                        {record.note ? <div className="tiny muted">{record.note}</div> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      )}
    </div>
  )
}
