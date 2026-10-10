/** Mark attendance for a subject the teacher owns.
 *
 *  The subject list is what the server says this teacher may touch, and the
 *  mark endpoint re-checks ownership - so hiding a subject here is a courtesy,
 *  not the boundary.
 *
 *  Three ways to fill the register, fastest first:
 *    - paste the present roll numbers for a whole class in one go,
 *    - tap "All present" / "All absent" and adjust the exceptions,
 *    - tap each student individually.
 *  A live colour-coded register and the class totals sit beside the entry so a
 *  teacher can see the shape of the class before saving.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
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
  semester: number
}

interface RosterRow {
  student_id: number
  full_name: string
  roll_number: string
  status: string | null
}

const SLOTS = ['P1', 'P2', 'P3', 'P4'].map((slot) => ({ value: slot, label: `Period ${slot.slice(1)}` }))
const STATUSES = ['PRESENT', 'ABSENT', 'LATE'] as const

/** Trim + upper-case a pasted token, so "cse23001 " and "CSE23001" agree. */
function normaliseRoll(value: string): string {
  return value.trim().toUpperCase()
}

/** The trailing run of digits in a roll number ("CSE2023001" -> "2023001").
 *  Lets a teacher paste just the number part when the prefix is a given. */
function numericTail(value: string): string {
  const match = value.match(/(\d+)\s*$/)
  return match ? match[1].replace(/^0+(?=\d)/, '') : ''
}

/** Strip leading zeros so "007" and "7" compare equal. */
function canonicalNumber(value: string): string {
  return value.replace(/^0+(?=\d)/, '')
}

export function MarkAttendancePage() {
  const subjects = useRemote<{ subjects: SubjectBrief[] }>(
    'subjects:mine',
    (signal) => api.get<{ subjects: SubjectBrief[] }>('/subjects', signal),
    { cacheKey: 'subjects:mine' },
  )

  const today = useMemo(() => new Date().toISOString().slice(0, 10), [])
  const [subjectId, setSubjectId] = useState<string>('')
  const [date, setDate] = useState(today)
  const [slot, setSlot] = useState('P1')
  const [roster, setRoster] = useState<RosterRow[] | null>(null)
  const [marks, setMarks] = useState<Record<number, string>>({})
  const [loadingRoster, setLoadingRoster] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Bulk entry + register + export
  const [bulkText, setBulkText] = useState('')
  const [bulkFeedback, setBulkFeedback] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null)
  const [exporting, setExporting] = useState<'png' | 'pdf' | null>(null)
  const registerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!subjectId) return
    let active = true
    setLoadingRoster(true)
    setError(null)
    setMessage(null)
    setBulkFeedback(null)
    api
      .get<{ roster: RosterRow[] }>(`/attendance/subject/${subjectId}?on_date=${date}`)
      .then((payload) => {
        if (!active) return
        setRoster(payload.roster)
        const initial: Record<number, string> = {}
        payload.roster.forEach((row) => {
          initial[row.student_id] = row.status ?? 'PRESENT'
        })
        setMarks(initial)
      })
      .catch((requestError) => {
        if (active) setError(requestError instanceof ApiError ? requestError.message : 'Could not load the class list.')
      })
      .finally(() => {
        if (active) setLoadingRoster(false)
      })
    return () => {
      active = false
    }
  }, [subjectId, date])

  const setEveryone = (status: string) => {
    if (!roster) return
    const next: Record<number, string> = {}
    roster.forEach((row) => {
      next[row.student_id] = status
    })
    setMarks(next)
    setBulkFeedback(null)
  }

  /** Mark every pasted roll present; everyone else absent. Matching is exact on
   *  the full roll number, or on its trailing digits, so both "CSE2023001" and
   *  "1" find the same student. */
  const applyBulk = () => {
    if (!roster) return
    const tokens = bulkText
      .split(/[\s,;]+/)
      .map(normaliseRoll)
      .filter(Boolean)

    if (tokens.length === 0) {
      setBulkFeedback({ tone: 'warn', text: 'Paste at least one roll number.' })
      return
    }

    const matched = new Set<number>()
    const unmatched: string[] = []
    const seen = new Set<string>()
    let duplicates = 0

    for (const token of tokens) {
      if (seen.has(token)) {
        duplicates += 1
        continue
      }
      seen.add(token)
      const tokenNumber = canonicalNumber(token)
      const hits = roster.filter((row) => {
        const roll = normaliseRoll(row.roll_number)
        if (roll === token) return true
        if (/^\d+$/.test(token)) {
          const tail = numericTail(roll)
          return tail !== '' && tail === tokenNumber
        }
        return false
      })
      if (hits.length === 0) unmatched.push(token)
      hits.forEach((row) => matched.add(row.student_id))
    }

    const next: Record<number, string> = {}
    roster.forEach((row) => {
      next[row.student_id] = matched.has(row.student_id) ? 'PRESENT' : 'ABSENT'
    })
    setMarks(next)

    const parts = [`${matched.size} present, ${roster.length - matched.size} absent.`]
    if (unmatched.length) parts.push(`No match for ${unmatched.join(', ')}.`)
    if (duplicates) parts.push(`${duplicates} duplicate${duplicates === 1 ? '' : 's'} ignored.`)
    setBulkFeedback({ tone: unmatched.length ? 'warn' : 'ok', text: parts.join(' ') })
  }

  const stats = useMemo(() => {
    if (!roster) return { total: 0, present: 0, absent: 0, late: 0, percent: 0 }
    let present = 0
    let absent = 0
    let late = 0
    roster.forEach((row) => {
      const status = marks[row.student_id] ?? 'PRESENT'
      if (status === 'PRESENT') present += 1
      else if (status === 'LATE') late += 1
      else absent += 1
    })
    const total = roster.length
    // Late still counts as attended, matching how the server computes the figure.
    const percent = total ? Math.round(((present + late) / total) * 100) : 0
    return { total, present, absent, late, percent }
  }, [roster, marks])

  const groups = useMemo(() => {
    if (!roster) return []
    const sorted = [...roster].sort((a, b) => a.roll_number.localeCompare(b.roll_number))
    const out: RosterRow[][] = []
    for (let i = 0; i < sorted.length; i += 4) out.push(sorted.slice(i, i + 4))
    return out
  }, [roster])

  const statusLetter = (status: string) => (status === 'PRESENT' ? 'P' : status === 'LATE' ? 'L' : 'A')
  const statusClass = (status: string) =>
    status === 'PRESENT' ? 'is-present' : status === 'LATE' ? 'is-late' : 'is-absent'

  const exportImage = async (kind: 'png' | 'pdf') => {
    if (!registerRef.current) return
    setExporting(kind)
    setError(null)
    try {
      // Loaded on demand so the export libraries never weigh down first paint.
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ])
      const canvas = await html2canvas(registerRef.current, { backgroundColor: '#ffffff', scale: 2 })
      const chosen = (subjects.data?.subjects ?? []).find((item) => String(item.id) === subjectId)
      const stem = `attendance-${(chosen?.code ?? 'class').toLowerCase()}-${date}-${slot}`
      if (kind === 'png') {
        const link = document.createElement('a')
        link.download = `${stem}.png`
        link.href = canvas.toDataURL('image/png')
        link.click()
      } else {
        const orientation = canvas.width > canvas.height ? 'landscape' : 'portrait'
        const pdf = new jsPDF({ orientation, unit: 'mm', format: 'a4' })
        const pageWidth = pdf.internal.pageSize.getWidth() - 20
        const pageHeight = pdf.internal.pageSize.getHeight() - 20
        const ratio = Math.min(pageWidth / canvas.width, pageHeight / canvas.height)
        const width = canvas.width * ratio
        const height = canvas.height * ratio
        pdf.addImage(
          canvas.toDataURL('image/png'),
          'PNG',
          (pageWidth - width) / 2 + 10,
          (pageHeight - height) / 2 + 10,
          width,
          height,
        )
        pdf.save(`${stem}.pdf`)
      }
    } catch {
      setError('Export failed. Try again, or use a screenshot of the register.')
    } finally {
      setExporting(null)
    }
  }

  const submit = async () => {
    if (!subjectId || !roster) return
    setSaving(true)
    setError(null)
    setMessage(null)
    try {
      const records = roster.map((row) => ({ student_id: row.student_id, status: marks[row.student_id] ?? 'PRESENT' }))
      const result = await api.post<{ saved: number }>('/attendance/mark', {
        subject_id: Number(subjectId),
        on_date: date,
        slot,
        records,
      })
      setMessage(`Saved ${result.saved} record${result.saved === 1 ? '' : 's'} for ${date} · ${slot}.`)
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : 'Could not save attendance.')
    } finally {
      setSaving(false)
    }
  }

  const options = [{ value: '', label: 'Choose a subject…' }].concat(
    (subjects.data?.subjects ?? []).map((subject) => ({ value: String(subject.id), label: `${subject.code} · ${subject.name}` })),
  )

  return (
    <>
      <PageHeader guide="mark-head" title="Mark attendance" subtitle="Record who attended a class you teach." kicker="Academics" />

      {subjects.loading && !subjects.data ? (
        <LoadingState />
      ) : subjects.error && !subjects.data ? (
        <ErrorState message={subjects.error} onRetry={() => void subjects.refresh()} />
      ) : (subjects.data?.subjects ?? []).length === 0 ? (
        <EmptyState title="No subjects are assigned to you" detail="An administrator assigns subjects before attendance can be marked." />
      ) : (
        <>
          <Card data-guide="mark-setup">
            <div className="grid-2">
              <label className="field">
                <span className="field-label">Subject</span>
                <Select
                  value={subjectId}
                  onChange={(value) => {
                    setSubjectId(value)
                    setRoster(null)
                    setMarks({})
                    setBulkFeedback(null)
                  }}
                  options={options}
                />
              </label>
              <label className="field">
                <span className="field-label">Date</span>
                <TextInput value={date} onChange={setDate} type="date" />
              </label>
            </div>
            <div style={{ maxWidth: 220, marginTop: 8 }}>
              <label className="field">
                <span className="field-label">Period</span>
                <Select value={slot} onChange={setSlot} options={SLOTS} />
              </label>
            </div>
          </Card>

          {message ? <div className="banner banner-info" role="status">{message}</div> : null}
          {error ? <div className="banner banner-error" role="alert">{error}</div> : null}

          {loadingRoster ? (
            <LoadingState />
          ) : roster && roster.length > 0 ? (
            <>
              {/* Bulk entry: paste the present rolls for the whole class. */}
              <Card data-guide="mark-bulk">
                <SectionTitle
                  right={
                    <div className="row" style={{ gap: 6 }}>
                      <Button size="sm" variant="ghost" onClick={() => setEveryone('PRESENT')}>
                        All present
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEveryone('ABSENT')}>
                        All absent
                      </Button>
                    </div>
                  }
                >
                  Paste present roll numbers
                </SectionTitle>
                <div className="stack" style={{ gap: 8 }}>
                  <textarea
                    className="bulk-input"
                    value={bulkText}
                    spellCheck={false}
                    placeholder={'Paste rolls in any order…\n\nCSE2023001 CSE2023005\nCSE2023012, CSE2023018'}
                    onChange={(event) => setBulkText(event.target.value)}
                    aria-label="Present roll numbers"
                  />
                  <p className="bulk-hint">
                    Spaces, commas or new lines all work. Matching rolls become Present; everyone else becomes Absent.
                    Pasting just the number part also matches.
                  </p>
                  <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                    <Button size="sm" variant="primary" onClick={applyBulk}>
                      Mark pasted rolls present
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { setBulkText(''); setBulkFeedback(null) }}>
                      Clear
                    </Button>
                    {bulkFeedback ? (
                      <span className={`bulk-feedback ${bulkFeedback.tone === 'ok' ? 'is-ok' : 'is-warn'}`} role="status">
                        {bulkFeedback.text}
                      </span>
                    ) : null}
                  </div>
                </div>
              </Card>

              {/* Live totals + colour-coded roll-wise register. */}
              <Card data-guide="mark-roster">
                <SectionTitle
                  right={
                    <div className="row" style={{ gap: 6 }}>
                      <Button size="sm" variant="ghost" busy={exporting === 'png'} onClick={() => void exportImage('png')}>
                        PNG
                      </Button>
                      <Button size="sm" variant="ghost" busy={exporting === 'pdf'} onClick={() => void exportImage('pdf')}>
                        PDF
                      </Button>
                    </div>
                  }
                >
                  Register ({roster.length})
                </SectionTitle>

                <div ref={registerRef} className="stack" style={{ gap: 'var(--sp-3)', background: 'var(--surface)', padding: 'var(--sp-3)', borderRadius: 'var(--radius-sm)' }}>
                  <div className="reg-stats">
                    <div className="reg-stat is-present">
                      <span className="reg-stat-value">{stats.present}</span>
                      <span className="reg-stat-label">Present</span>
                    </div>
                    <div className="reg-stat is-late">
                      <span className="reg-stat-value">{stats.late}</span>
                      <span className="reg-stat-label">Late</span>
                    </div>
                    <div className="reg-stat is-absent">
                      <span className="reg-stat-value">{stats.absent}</span>
                      <span className="reg-stat-label">Absent</span>
                    </div>
                    <div className="reg-stat">
                      <span className="reg-stat-value">{stats.percent}%</span>
                      <span className="reg-stat-label">Attendance</span>
                    </div>
                  </div>

                  <div className="reg-grid">
                    {groups.map((group) => {
                      const first = group[0]
                      const last = group[group.length - 1]
                      return (
                        <article key={first.student_id} className="reg-group">
                          <div className="reg-group-head">
                            <span>{first.roll_number}–{last.roll_number}</span>
                            <span>{group.length}</span>
                          </div>
                          <div className="reg-rolls">
                            {group.map((row) => {
                              const status = marks[row.student_id] ?? 'PRESENT'
                              return (
                                <div key={row.student_id} className={`reg-roll ${statusClass(status)}`}>
                                  <span className="reg-roll-no">{row.roll_number}</span>
                                  <span className="reg-roll-status">{statusLetter(status)}</span>
                                </div>
                              )
                            })}
                          </div>
                        </article>
                      )
                    })}
                  </div>
                  <p className="bulk-hint">P = present · L = late · A = absent</p>
                </div>

                <div className="row" style={{ gap: 8, marginTop: 12, alignItems: 'center' }}>
                  <Button variant="primary" busy={saving} onClick={() => void submit()}>
                    Save attendance
                  </Button>
                  <Badge tone="ghost">{roster.length} students</Badge>
                </div>
              </Card>

              {/* Fine-grained, per-student control. */}
              <Card data-guide="mark-students">
                <SectionTitle>Adjust individual students</SectionTitle>
                <ul className="list-reset stack" style={{ gap: 8 }}>
                  {roster.map((row) => (
                    <li key={row.student_id} className="row-between wrap" style={{ gap: 8 }}>
                      <span className="small">
                        <span className="bold">{row.roll_number}</span> · {row.full_name}
                      </span>
                      <div className="row" style={{ gap: 4 }}>
                        {STATUSES.map((status) => (
                          <Button
                            key={status}
                            size="sm"
                            variant={marks[row.student_id] === status ? 'primary' : 'ghost'}
                            onClick={() => {
                              setMarks((current) => ({ ...current, [row.student_id]: status }))
                              setBulkFeedback(null)
                            }}
                          >
                            {status}
                          </Button>
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>
            </>
          ) : subjectId ? (
            <EmptyState title="No students in this class" detail="Nobody is enrolled in this subject's branch and year yet." />
          ) : (
            <EmptyState title="Choose a subject" detail="Pick a subject and date to load the class list." />
          )}
        </>
      )}
    </>
  )
}
