/** Enter marks for one assessment of a subject the teacher owns. */

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
  Select,
  SectionTitle,
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

export function MarkEntryPage() {
  const subjects = useRemote<{ subjects: SubjectBrief[] }>(
    'subjects:mine',
    (signal) => api.get<{ subjects: SubjectBrief[] }>('/subjects', signal),
    { cacheKey: 'subjects:mine' },
  )

  const [subjectId, setSubjectId] = useState('')
  const [assessment, setAssessment] = useState('Internal 1')
  const [term, setTerm] = useState('2026-ODD')
  const [maxMarks, setMaxMarks] = useState('50')
  const [roster, setRoster] = useState<RosterRow[] | null>(null)
  const [scores, setScores] = useState<Record<number, string>>({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadClass = async () => {
    if (!subjectId || !assessment.trim()) return
    setLoading(true)
    setError(null)
    setMessage(null)
    try {
      const payload = await api.get<{ roster: RosterRow[] }>(
        `/marks/subject/${subjectId}?assessment=${encodeURIComponent(assessment)}&term=${encodeURIComponent(term)}`,
      )
      setRoster(payload.roster)
      const initial: Record<number, string> = {}
      let seenMax: number | null = null
      payload.roster.forEach((row) => {
        initial[row.student_id] = row.obtained_marks === null ? '' : String(row.obtained_marks)
        if (seenMax === null && row.max_marks) seenMax = row.max_marks
      })
      setScores(initial)
      if (seenMax) setMaxMarks(String(seenMax))
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : 'Could not load the class list.')
    } finally {
      setLoading(false)
    }
  }

  const submit = async () => {
    if (!subjectId || !roster) return
    setSaving(true)
    setError(null)
    setMessage(null)
    try {
      const maximum = Number(maxMarks) || 100
      const marks = roster.map((row) => ({
        student_id: row.student_id,
        obtained_marks: scores[row.student_id] === '' || scores[row.student_id] === undefined ? 0 : Number(scores[row.student_id]),
        max_marks: maximum,
      }))
      const result = await api.post<{ saved: number }>('/marks', {
        subject_id: Number(subjectId),
        assessment,
        term,
        marks,
      })
      setMessage(`Saved ${result.saved} mark${result.saved === 1 ? '' : 's'} for ${assessment} · ${term}.`)
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : 'Could not save marks.')
    } finally {
      setSaving(false)
    }
  }

  const options = [{ value: '', label: 'Choose a subject…' }].concat(
    (subjects.data?.subjects ?? []).map((subject) => ({ value: String(subject.id), label: `${subject.code} · ${subject.name}` })),
  )

  return (
    <>
      <PageHeader guide="entry-head" title="Enter marks" subtitle="Record scores for one assessment of a subject you teach." kicker="Academics" />

      {subjects.loading && !subjects.data ? (
        <LoadingState />
      ) : subjects.error && !subjects.data ? (
        <ErrorState message={subjects.error} onRetry={() => void subjects.refresh()} />
      ) : (subjects.data?.subjects ?? []).length === 0 ? (
        <EmptyState title="No subjects are assigned to you" detail="An administrator assigns subjects before marks can be entered." />
      ) : (
        <>
          <Card data-guide="entry-setup">
            <div className="grid-2">
              <label className="field">
                <span className="field-label">Subject</span>
                <Select
                  value={subjectId}
                  onChange={(value) => {
                    setSubjectId(value)
                    setRoster(null)
                    setScores({})
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
              <label className="field">
                <span className="field-label">Maximum marks</span>
                <TextInput value={maxMarks} onChange={setMaxMarks} type="number" inputMode="numeric" />
              </label>
            </div>
            <div style={{ marginTop: 8 }}>
              <Button variant="info" busy={loading} onClick={() => void loadClass()}>
                Load class list
              </Button>
            </div>
          </Card>

          {message ? <div className="banner banner-info" role="status">{message}</div> : null}
          {error ? <div className="banner banner-error" role="alert">{error}</div> : null}

          {loading ? (
            <LoadingState />
          ) : roster && roster.length > 0 ? (
            <Card data-guide="entry-roster">
              <SectionTitle right={<Badge tone="ghost">{assessment} · max {maxMarks}</Badge>}>
                Class list ({roster.length})
              </SectionTitle>
              <ul className="list-reset stack" style={{ gap: 8 }}>
                {roster.map((row) => (
                  <li key={row.student_id} className="row-between wrap" style={{ gap: 8 }}>
                    <span className="small">
                      <span className="bold">{row.roll_number}</span> · {row.full_name}
                    </span>
                    <div style={{ width: 120 }}>
                      <TextInput
                        value={scores[row.student_id] ?? ''}
                        onChange={(value) => setScores((current) => ({ ...current, [row.student_id]: value }))}
                        type="number"
                        inputMode="numeric"
                        placeholder="—"
                      />
                    </div>
                  </li>
                ))}
              </ul>
              <div className="row" style={{ gap: 8, marginTop: 12, alignItems: 'center' }}>
                <Button variant="primary" busy={saving} onClick={() => void submit()}>
                  Save marks
                </Button>
              </div>
            </Card>
          ) : (
            <EmptyState title="No class loaded" detail="Choose a subject and assessment, then load the class list." />
          )}
        </>
      )}
    </>
  )
}
