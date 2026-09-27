/** Helpdesk / assisted access desk.
 *
 *  Some students will never file a request themselves: no smartphone, no data,
 *  no confidence with forms. The desk searches for them, files on their behalf,
 *  and gets a printable receipt. The case is an ordinary case — the only
 *  difference is the recorded source channel, which is how the administrator can
 *  see whether assisted access is actually being used.
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError, api, setChannel } from '../../lib/api'
import { duration, relative } from '../../lib/format'
import { useRemote } from '../../state/hooks'
import type { CaseBrief } from '../../lib/types'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  KV,
  PageHeader,
  SectionTitle,
  Select,
  Tabs,
  TextArea,
  TextInput,
} from '../../components/ui'
import { CaseStatusBadge, PriorityBadge } from '../../components/StatusChip'

interface StudentRow {
  id: number
  full_name: string
  roll_number: string
  branch: string | null
  year: string | null
  hostel: string | null
  room: string | null
  dues_balance: number
  has_app_account: boolean
  recent_case_count: number
}

interface ServiceRow {
  key: string
  name: string
  category: string
  icon: string
  form_schema: { name: string; label: string; type: string; required?: boolean; options?: string[] }[]
  default_priority: string
}

export function HelpDesk() {
  const navigate = useNavigate()
  const [tab, setTab] = useState<'file' | 'desk'>('file')
  const [query, setQuery] = useState('')
  const [students, setStudents] = useState<StudentRow[] | null>(null)
  const [selected, setSelected] = useState<StudentRow | null>(null)
  const [services, setServices] = useState<ServiceRow[]>([])
  const [serviceKey, setServiceKey] = useState('')
  const [description, setDescription] = useState('')
  const [values, setValues] = useState<Record<string, string>>({})
  const [priority, setPriority] = useState('NORMAL')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [receipt, setReceipt] = useState<any | null>(null)

  const desk = useRemote<{ walk_in_cases: CaseBrief[]; counts: { kiosk: number; assisted_desk: number }; note: string }>(
    tab === 'desk' ? 'helpdesk-desk' : null,
    () => api.get('/helpdesk/desk'),
  )

  const search = async () => {
    setBusy(true)
    setError(null)
    setReceipt(null)
    try {
      const result = await api.get<{ students: StudentRow[] }>(`/helpdesk/students?q=${encodeURIComponent(query.trim())}`)
      setStudents(result.students)
      if (result.students.length === 1) await pick(result.students[0])
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : 'Search failed.')
    } finally {
      setBusy(false)
    }
  }

  const pick = async (student: StudentRow) => {
    setSelected(student)
    setError(null)
    try {
      const lookup = await api.post<{ services: ServiceRow[] }>('/kiosk/lookup', { roll_number: student.roll_number })
      setServices(lookup.services)
      if (lookup.services.length) {
        setServiceKey(lookup.services[0].key)
        setPriority(lookup.services[0].default_priority ?? 'NORMAL')
      }
    } catch {
      setError('Could not load the service catalogue for that student.')
    }
  }

  const file = async () => {
    if (!selected) return
    setBusy(true)
    setError(null)
    setChannel('ASSISTED_DESK')
    try {
      const response = await api.post<{ receipt: any; case: CaseBrief }>('/kiosk/cases', {
        roll_number: selected.roll_number,
        service_key: serviceKey,
        description,
        priority,
        state_payload: values,
        language: 'en',
        client_ref: `desk-${Date.now()}`,
      })
      setReceipt(response.receipt)
      setDescription('')
      setValues({})
      void desk.refresh()
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : 'Could not file the request.')
    } finally {
      setBusy(false)
    }
  }

  const current = services.find((item) => item.key === serviceKey)

  return (
    <div className="stack-lg">
      <PageHeader
        title="Helpdesk desk"
        subtitle="Assisted filing for students without a working device — both names stay on the record"
        actions={<Badge tone="ghost">channel: ASSISTED_DESK</Badge>}
      />

      {error ? <div className="banner banner-error" role="alert">{error}</div> : null}
      {receipt ? (
        <div className="banner banner-info" role="status">
          <div className="grow">
            <div className="bold">{receipt.case_number}</div>
            <div className="small">{receipt.message}</div>
          </div>
          <Button size="sm" variant="ghost" onClick={() => window.print()}>
            Print receipt
          </Button>
        </div>
      ) : null}

      <Tabs
        tabs={[
          { id: 'file', label: 'File for a student' },
          { id: 'desk', label: 'Desk activity', count: desk.data?.walk_in_cases?.length },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'file' ? (
        <>
          <Card>
            <SectionTitle>1. Find the student</SectionTitle>
            <div className="row wrap" style={{ gap: 8 }}>
              <div style={{ flex: 1, minWidth: 240 }}>
                <TextInput value={query} onChange={setQuery} placeholder="Roll number, name or registration number" />
              </div>
              <Button variant="primary" busy={busy} disabled={query.trim().length < 2} onClick={() => void search()}>
                Search
              </Button>
            </div>
            {students ? (
              students.length === 0 ? (
                <EmptyState title="No matching student" detail="Check the number, or try part of the name." />
              ) : (
                <ul className="list-reset stack" style={{ marginTop: 12, gap: 8 }}>
                  {students.map((student) => (
                    <li key={student.id}>
                      <Card
                        className="card-flat card-clickable"
                        onClick={() => void pick(student)}
                        accent={selected?.id === student.id ? 'signal' : undefined}
                      >
                        <div className="row-between">
                          <div>
                            <div className="bold">{student.full_name}</div>
                            <div className="tiny muted">
                              <span className="mono">{student.roll_number}</span> · {student.branch ?? '—'} ·{' '}
                              {student.hostel ? `${student.hostel} / ${student.room}` : 'day scholar'}
                            </div>
                          </div>
                          <div className="text-right">
                            {student.has_app_account ? (
                              <Badge tone="done">has the app</Badge>
                            ) : (
                              <Badge tone="warn">no app account</Badge>
                            )}
                            {student.dues_balance > 0 ? (
                              <div>
                                <Badge tone="warn">₹{student.dues_balance.toFixed(0)} dues</Badge>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </Card>
                    </li>
                  ))}
                </ul>
              )
            ) : null}
          </Card>

          {selected ? (
            <>
              <Card accent="signal">
                <SectionTitle>2. Filing for</SectionTitle>
                <KV
                  items={[
                    { label: 'Student', value: selected.full_name },
                    { label: 'Roll number', value: <span className="mono">{selected.roll_number}</span> },
                    { label: 'Hostel', value: selected.hostel ? `${selected.hostel} / ${selected.room ?? '—'}` : 'day scholar' },
                    { label: 'Prior cases', value: selected.recent_case_count },
                  ]}
                />
                <p className="small muted" style={{ marginTop: 8 }}>
                  The request will be recorded as filed by you on their behalf. Both names stay on the record.
                </p>
              </Card>

              <Card>
                <SectionTitle>3. What do they need?</SectionTitle>
                <Field label="Service">
                  <Select
                    value={serviceKey}
                    onChange={(value) => {
                      setServiceKey(value)
                      setValues({})
                      const next = services.find((item) => item.key === value)
                      if (next) setPriority(next.default_priority ?? 'NORMAL')
                    }}
                    options={services.map((item) => ({ value: item.key, label: `${item.icon} ${item.name}` }))}
                  />
                </Field>
                <Field label="Description" required hint="Write what the student tells you, in their words.">
                  <TextArea value={description} onChange={setDescription} rows={4} />
                </Field>
                {(current?.form_schema ?? []).map((field) => (
                  <Field key={field.name} label={field.label} required={field.required}>
                    {field.type === 'select' ? (
                      <Select
                        value={values[field.name] ?? ''}
                        onChange={(value) => setValues((prev) => ({ ...prev, [field.name]: value }))}
                        options={[
                          { value: '', label: 'Select…' },
                          ...(field.options ?? []).map((option) => ({ value: option, label: option })),
                        ]}
                      />
                    ) : (
                      <TextInput
                        value={values[field.name] ?? ''}
                        onChange={(value) => setValues((prev) => ({ ...prev, [field.name]: value }))}
                      />
                    )}
                  </Field>
                ))}
                <Field label="Urgency">
                  <Select
                    value={priority}
                    onChange={setPriority}
                    options={[
                      { value: 'LOW', label: 'Low' },
                      { value: 'NORMAL', label: 'Normal' },
                      { value: 'HIGH', label: 'High' },
                      { value: 'CRITICAL', label: 'Critical' },
                    ]}
                  />
                </Field>
                <Button
                  variant="primary"
                  size="lg"
                  block
                  busy={busy}
                  disabled={!serviceKey || description.trim().length < 8}
                  onClick={() => void file()}
                >
                  Register on behalf of {selected.full_name.split(' ')[0]}
                </Button>
              </Card>
            </>
          ) : null}
        </>
      ) : null}

      {tab === 'desk' ? (
        <>
          <div className="grid-metrics">
            <div className="metric">
              <div className="metric-label">Filed at a kiosk</div>
              <div className="metric-value">{desk.data?.counts?.kiosk ?? 0}</div>
            </div>
            <div className="metric">
              <div className="metric-label">Filed at this desk</div>
              <div className="metric-value">{desk.data?.counts?.assisted_desk ?? 0}</div>
            </div>
          </div>
          {desk.data?.walk_in_cases?.length ? (
            <ul className="list-reset stack">
              {desk.data.walk_in_cases.map((item) => (
                <Card as="li" key={item.id}>
                  <div className="row wrap" style={{ gap: 6 }}>
                    <span className="mono small muted">{item.case_number}</span>
                    <CaseStatusBadge status={item.status} />
                    <PriorityBadge priority={item.priority} />
                    <Badge tone="ghost">{item.source_channel}</Badge>
                  </div>
                  <div className="bold" style={{ marginTop: 4 }}>{item.title}</div>
                  <div className="small muted">
                    {item.service_name} · {item.location?.name ?? 'no location'} · opened {duration(item.age_minutes)} ago
                    · updated {relative(item.last_activity_at)}
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => navigate(`/cases/${item.id}`)}>
                    Open
                  </Button>
                </Card>
              ))}
            </ul>
          ) : (
            <EmptyState title="No assisted or kiosk cases yet" detail={desk.data?.note} />
          )}
        </>
      ) : null}
    </div>
  )
}
