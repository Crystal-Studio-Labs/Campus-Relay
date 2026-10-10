/** Marks, for the office: read-only oversight of any subject on this campus.
 *
 *  The teacher's marks screen is a pen - it exists to write scores. This one is
 *  deliberately not: management holds `marks:manage`, not `marks:entry`, so the
 *  server refuses a save even if this screen offered one, and the screen does
 *  not offer one. Same subject list, same roster, no input boxes - the office
 *  reads the register it audits.
 */

import { useState } from 'react'
import { ApiError, api } from '../../lib/api'
import { useRemote } from '../../state/hooks'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  SectionTitle,
  Select,
  TextInput,
} from '../../components/ui'

interface SubjectBrief {
  id: number
  code: string
  name: string
}

interface RosterRow {
  student_id: number
  full_name: string
  roll_number: string
  obtained_marks: number | null
  max_marks: number | null
}

export function MarksViewPage() {
  // Management sees every active subject on the campus - the endpoint scopes
  // by role, so no extra filter is needed here.
  const subjects = useRemote<{ subjects: SubjectBrief[] }>(
    'subjects:all',
    (signal) => api.get<{ subjects: SubjectBrief[] }>('/subjects', signal),
    { cacheKey: 'subjects:all' },
  )

  const [subjectId, setSubjectId] = useState('')
  const [assessment, setAssessment] = useState('Internal 1')
  const [term, setTerm] = useState('2026-ODD')
  const [roster, setRoster] = useState<RosterRow[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadClass = async () => {
    if (!subjectId || !assessment.trim()) return
    setLoading(true)
    setError(null)
    try {
      const payload = await api.get<{ roster: RosterRow[] }>(
        `/marks/subject/${subjectId}?assessment=${encodeURIComponent(assessment)}&term=${encodeURIComponent(term)}`,
      )
      setRoster(payload.roster)
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : 'Could not load the class list.')
    } finally {
      setLoading(false)
    }
  }

  const marked = (roster ?? []).filter((row) => row.obtained_marks !== null).length

  const options = [{ value: '', label: 'Choose a subject…' }].concat(
    (subjects.data?.subjects ?? []).map((subject) => ({ value: String(subject.id), label: `${subject.code} · ${subject.name}` })),
  )

  return (
    <>
      <PageHeader
        title="View marks"
        subtitle="Read-only oversight of marks for any subject on this campus. Marks are entered by teachers; this screen cannot change them."
        kicker="Examinations"
        actions={<Badge tone="ghost">View only</Badge>}
      />

      {subjects.loading && !subjects.data ? (
        <LoadingState />
      ) : subjects.error && !subjects.data ? (
        <ErrorState message={subjects.error} onRetry={() => void subjects.refresh()} />
      ) : (subjects.data?.subjects ?? []).length === 0 ? (
        <EmptyState title="No subjects on this campus" detail="Subjects appear here once the institution setup defines them." />
      ) : (
        <>
          <Card>
            <div className="grid-3">
              <label className="field">
                <span className="field-label">Subject</span>
                <Select
                  value={subjectId}
                  onChange={(value) => {
                    setSubjectId(value)
                    setRoster(null)
                  }}
                  options={options}
                />
              </label>
              <label className="field">
                <span className="field-label">Assessment</span>
                <TextInput value={assessment} onChange={setAssessment} placeholder="e.g. Internal 1" />
              </label>
              <label className="field">
                <span className="field-label">Term</span>
                <TextInput value={term} onChange={setTerm} placeholder="e.g. 2026-ODD" />
              </label>
            </div>
            <div style={{ marginTop: 8 }}>
              <Button variant="info" busy={loading} onClick={() => void loadClass()}>
                Load class list
              </Button>
            </div>
          </Card>

          {error ? <div className="banner banner-error" role="alert">{error}</div> : null}

          {loading ? (
            <LoadingState />
          ) : roster && roster.length > 0 ? (
            <Card>
              <SectionTitle right={<Badge tone="ghost">{marked} of {roster.length} marked</Badge>}>
                Class list ({roster.length})
              </SectionTitle>
              <ul className="list-reset stack" style={{ gap: 8 }}>
                {roster.map((row) => (
                  <li key={row.student_id} className="row-between wrap" style={{ gap: 8 }}>
                    <span className="small">
                      <span className="bold">{row.roll_number}</span> · {row.full_name}
                    </span>
                    <span className="ident">
                      {row.obtained_marks === null ? (
                        <span className="muted">— not marked</span>
                      ) : (
                        <>
                          {row.obtained_marks}
                          {row.max_marks !== null ? ` / ${row.max_marks}` : ''}
                        </>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : (
            <EmptyState title="No class loaded" detail="Choose a subject and assessment, then load the class list." />
          )}
        </>
      )}
    </>
  )
}
