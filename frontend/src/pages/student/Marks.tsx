/** Marks: a student's results. */

import { api } from '../../lib/api'
import { useRemote } from '../../state/hooks'
import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  ProgressBar,
  SectionTitle,
} from '../../components/ui'

interface SubjectBrief {
  id: number
  code: string
  name: string
  credits: number
  semester: number
}

interface PerSubject {
  subject_id: number
  subject: SubjectBrief | null
  obtained: number
  max: number
  assessments: number
  percentage: number | null
}

interface MarkRow {
  id: number
  assessment: string
  term: string
  obtained_marks: number
  max_marks: number
  subject: SubjectBrief | null
}

interface MarksPayload {
  student: { id: number; full_name: string; roll_number: string } | null
  summary: { obtained: number; max: number; percentage: number | null; per_subject: PerSubject[] }
  marks: MarkRow[]
}

export function StudentMarksPage() {
  const state = useRemote<MarksPayload>(
    'marks:me',
    (signal) => api.get<MarksPayload>('/marks/me', signal),
    { cacheKey: 'marks:me' },
  )

  const summary = state.data?.summary
  const hasData = Boolean(summary && summary.per_subject.length > 0)

  return (
    <>
      <PageHeader guide="marks-head" title="Marks" subtitle="Your results across every assessment this term." kicker="Academics" />

      {state.loading && !state.data ? (
        <LoadingState />
      ) : state.error && !state.data ? (
        <ErrorState
          message={state.error}
          offline={state.errorCode === 'network_unreachable'}
          onRetry={() => void state.refresh()}
        />
      ) : !hasData ? (
        <EmptyState title="No marks published yet" detail="Your results appear here once your teachers enter them." />
      ) : (
        <>
          <Card data-guide="marks-summary">
            <SectionTitle right={<Badge tone={state.stale ? 'ghost' : 'open'}>{state.stale ? 'Offline copy' : 'Live'}</Badge>}>
              Overall
            </SectionTitle>
            <div className="metric-value">{summary?.percentage ?? 0}%</div>
            <div className="tiny muted">
              {summary?.obtained} of {summary?.max} marks
            </div>
            <div style={{ marginTop: 12 }}>
              <ProgressBar value={summary?.obtained ?? 0} max={summary?.max || 1} tone="mint" />
            </div>
          </Card>

          <Card data-guide="marks-subjects">
            <SectionTitle>By subject</SectionTitle>
            <ul className="list-reset stack" style={{ gap: 12 }}>
              {(summary?.per_subject ?? []).map((row) => (
                <li key={row.subject_id}>
                  <div className="row-between small">
                    <span className="bold">
                      {row.subject ? `${row.subject.code} · ${row.subject.name}` : `Subject ${row.subject_id}`}
                    </span>
                    <Badge tone={(row.percentage ?? 0) < 40 ? 'urgent' : 'done'}>{row.percentage ?? 0}%</Badge>
                  </div>
                  <ProgressBar value={row.obtained} max={row.max || 1} tone="mint" />
                  <div className="tiny muted">
                    {row.obtained}/{row.max} · {row.assessments} assessment{row.assessments === 1 ? '' : 's'}
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <SectionTitle>All assessments</SectionTitle>
            <ul className="list-reset stack" style={{ gap: 6 }}>
              {(state.data?.marks ?? []).map((mark) => (
                <li key={mark.id} className="row-between">
                  <span className="small">
                    <span className="bold">{mark.subject?.code ?? '—'}</span> · {mark.assessment}
                    <span className="tiny muted"> · {mark.term}</span>
                  </span>
                  <span className="small bold">
                    {mark.obtained_marks}/{mark.max_marks}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </>
  )
}
