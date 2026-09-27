/** Self-service kiosk.
 *
 *  For the student with a cracked screen, no data pack, or no phone at all. The
 *  flow is deliberately three taps deep: identify, choose, confirm. The result is
 *  an ordinary case - only the source channel differs - so it lands in the same
 *  queue with the same target as a request filed from a phone.
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError, api, setChannel } from '../../lib/api'
import { currentChannel } from '../../lib/api'
import { duration, relative } from '../../lib/format'
import { useRemote } from '../../state/hooks'
import { Badge, Button, Card, Field, Select, TextArea, TextInput } from '../../components/ui'
import { KioskShell } from '../../layouts/KioskShell'
import { CaseStatusBadge, PriorityBadge } from '../../components/StatusChip'
import type { CaseBrief } from '../../lib/types'

interface KioskService {
  key: string
  name: string
  category: string
  icon: string
  form_schema: { name: string; label: string; type: string; required?: boolean; options?: string[] }[]
  default_priority: string
}

interface LookupResult {
  student: {
    full_name: string
    roll_number: string
    branch: string | null
    year: string | null
    hostel: string | null
    room: string | null
    is_hosteller: boolean
    dues_balance: number
    has_app_account: boolean
  }
  recent_cases: CaseBrief[]
  services: KioskService[]
}

type Step = 'identify' | 'choose' | 'details' | 'receipt' | 'status'

export function KioskPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>('identify')
  const [roll, setRoll] = useState('')
  const [student, setStudent] = useState<LookupResult | null>(null)
  const [service, setService] = useState<KioskService | null>(null)
  const [description, setDescription] = useState('')
  const [values, setValues] = useState<Record<string, string>>({})
  const [priority, setPriority] = useState('NORMAL')
  const [locationCode, setLocationCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [receipt, setReceipt] = useState<{ case_number: string; message: string; service: string } | null>(null)

  const notices = useRemote<{ notices: { id: number; title: string; type: string; summary: string | null }[] }>(
    step === 'identify' ? 'kiosk-notices' : null,
    () => api.get('/kiosk/notices'),
    { cacheKey: null },
  )

  const reset = () => {
    setStep('identify')
    setRoll('')
    setStudent(null)
    setService(null)
    setDescription('')
    setValues({})
    setReceipt(null)
    setError(null)
  }

  const lookup = async () => {
    setBusy(true)
    setError(null)
    try {
      const result = await api.post<LookupResult>('/kiosk/lookup', { roll_number: roll.trim().toUpperCase() })
      setStudent(result)
      setStep('choose')
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : 'That number was not recognised. Check it and try again, or ask at the helpdesk.',
      )
    } finally {
      setBusy(false)
    }
  }

  const submit = async () => {
    if (!service || !student) return
    setBusy(true)
    setError(null)
    setChannel('KIOSK')
    try {
      const response = await api.post<{
        receipt: { case_number: string; service: string; message: string }
        case: CaseBrief
      }>('/kiosk/cases', {
        roll_number: student.student.roll_number,
        service_key: service.key,
        description,
        priority,
        location_code: locationCode || undefined,
        state_payload: values,
        language: 'en',
        client_ref: `kiosk-${Date.now()}`,
      })
      setReceipt(response.receipt)
      setStep('receipt')
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : 'The request could not be registered. Please speak to the helpdesk.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <KioskShell onReset={reset}>
      {error ? (
        <div className="banner banner-error" role="alert" style={{ maxWidth: 720 }}>
          {error}
        </div>
      ) : null}

      {step === 'identify' ? (
        <>
          <div className="kiosk-title">What do you need help with?</div>
          <div className="kiosk-hint">Enter your student ID to begin — it takes about a minute.</div>
          <input
            className="input kiosk-id-input"
            data-guide="kiosk-id"
            value={roll}
            onChange={(event) => setRoll(event.target.value.toUpperCase())}
            placeholder="ROLL NUMBER"
            aria-label="Student roll number"
            onKeyDown={(event) => event.key === 'Enter' && void lookup()}
          />
          <div className="row wrap center">
            <Button variant="primary" size="xl" busy={busy} disabled={roll.trim().length < 2} onClick={() => void lookup()}>
              Continue
            </Button>
          </div>

          {notices.data?.notices?.length ? (
            <Card style={{ maxWidth: 760 }}>
              <div className="section-title">Campus notices</div>
              <ul className="list-reset stack" style={{ gap: 6 }}>
                {notices.data.notices.map((notice) => (
                  <li key={notice.id}>
                    <Badge tone={notice.type === 'EMERGENCY' ? 'urgent' : 'warn'}>{notice.type}</Badge>{' '}
                    <span className="bold">{notice.title}</span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <p className="tiny muted">No phone needed. No app install. Works with just a roll number.</p>
        </>
      ) : null}

      {step === 'choose' && student ? (
        <>
          <div className="kiosk-title">Welcome, {student.student.full_name.split(' ')[0]}</div>
          <div className="kiosk-hint">
            {student.student.roll_number} · {student.student.hostel ? `${student.student.hostel} / Room ${student.student.room}` : 'Day scholar'}
          </div>

          <div className="kiosk-actions" data-guide="kiosk-tiles">
            {(student.services ?? []).slice(0, 10).map((item) => (
              <Button
                key={item.key}
                className="kiosk-tile"
                variant="primary"
                onClick={() => {
                  setService(item)
                  setPriority(item.default_priority ?? 'NORMAL')
                  setValues({})
                  setStep('details')
                }}
              >
                <span style={{ fontSize: 40 }} aria-hidden="true">
                  {item.icon}
                </span>
                <span>{item.name}</span>
              </Button>
            ))}
          </div>

          <div className="row wrap center">
            <Button variant="info" size="lg" onClick={() => setStep('status')}>
              Check the status of my requests
            </Button>
            <Button variant="ghost" size="lg" onClick={reset}>
              Start over
            </Button>
          </div>
        </>
      ) : null}

      {step === 'details' && service && student ? (
        <>
          <div className="kiosk-title">{service.name}</div>
          <Card style={{ width: '100%', maxWidth: 760, textAlign: 'start' }}>
            <Field label="Describe the problem" required hint="Say it in your own words.">
              <TextArea value={description} onChange={setDescription} rows={4} />
            </Field>
            {(service.form_schema ?? []).map((field) => (
              <Field key={field.name} label={field.label} required={field.required}>
                {field.type === 'select' ? (
                  <Select
                    value={values[field.name] ?? ''}
                    onChange={(value) => setValues((current) => ({ ...current, [field.name]: value }))}
                    options={[
                      { value: '', label: 'Select…' },
                      ...(field.options ?? []).map((option) => ({ value: option, label: option })),
                    ]}
                  />
                ) : (
                  <TextInput
                    value={values[field.name] ?? ''}
                    onChange={(value) => setValues((current) => ({ ...current, [field.name]: value }))}
                  />
                )}
              </Field>
            ))}
            <Field label="Location code (if you know it)" hint="Printed on the asset or the room label.">
              <TextInput value={locationCode} onChange={(value) => setLocationCode(value.toUpperCase())} />
            </Field>
          </Card>
          <div className="row wrap center">
            <Button variant="ghost" size="lg" onClick={() => setStep('choose')}>
              ← Back
            </Button>
            <Button
              variant="primary"
              size="xl"
              busy={busy}
              disabled={description.trim().length < 8}
              onClick={() => void submit()}
            >
              Register this request
            </Button>
          </div>
        </>
      ) : null}

      {step === 'receipt' && receipt ? (
        <>
          <div className="kiosk-title">Request registered</div>
          <Card className="tint-mint" style={{ maxWidth: 760 }}>
            <div className="mono" style={{ fontSize: 'clamp(2rem, 6vw, 3.4rem)', fontWeight: 900 }}>
              {receipt.case_number}
            </div>
            <p className="kiosk-hint">{receipt.message}</p>
            <p className="small">{receipt.service}</p>
          </Card>
          <p className="kiosk-hint">
            Write that number down, or come back to any kiosk and check it with your roll number.
          </p>
          <div className="row wrap center">
            <Button
              variant="info"
              size="xl"
              onClick={() => {
                reset()
                setRoll(student?.student.roll_number ?? '')
              }}
            >
              Register another request
            </Button>
            <Button variant="ghost" size="lg" onClick={reset}>
              Finish
            </Button>
          </div>
        </>
      ) : null}

      {step === 'status' && student ? (
        <>
          <div className="kiosk-title">Your requests</div>
          <div className="kiosk-hint">{student.student.roll_number}</div>
          <div style={{ width: '100%', maxWidth: 860, textAlign: 'start' }}>
            {student.recent_cases.length === 0 ? (
              <Card>
                <p className="bold">No requests on record for this roll number.</p>
                <p className="small muted">If you raised one before, check the roll number with the helpdesk.</p>
              </Card>
            ) : (
              <ul className="list-reset stack">
                {student.recent_cases.map((item) => (
                  <Card as="li" key={item.id}>
                    <div style={{ fontSize: '1.1rem' }}>
                      <span className="mono bold">{item.case_number}</span>{' '}
                      <CaseStatusBadge status={item.status} /> <PriorityBadge priority={item.priority} />
                    </div>
                    <div style={{ fontSize: '1.2rem', fontWeight: 800 }}>{item.title}</div>
                    <div className="small muted">
                      {item.service_name} · opened {duration(item.age_minutes)} ago · updated {relative(item.last_activity_at)}
                    </div>
                  </Card>
                ))}
              </ul>
            )}
          </div>
          <div className="row wrap center">
            <Button variant="primary" size="xl" onClick={() => setStep('choose')}>
              Register a new request
            </Button>
            <Button variant="ghost" size="lg" onClick={reset}>
              Finish
            </Button>
          </div>
        </>
      ) : null}

      {/* Printed receipts: the kiosk has a printer in the lobby. */}
      {step === 'receipt' && receipt ? (
        <>
          <div className="divider" />
          <Button variant="ghost" size="sm" onClick={() => window.print()}>
            Print this receipt
          </Button>
          <p className="tiny muted">
            Channel: {currentChannel()} · every kiosk request is attributed to the student and to this desk, so
            nothing is filed anonymously.
          </p>
        </>
      ) : null}

      {step !== 'identify' ? (
        <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
          Exit kiosk mode
        </Button>
      ) : null}
    </KioskShell>
  )
}
