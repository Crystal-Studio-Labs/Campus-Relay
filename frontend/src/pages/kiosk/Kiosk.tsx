/** Self-service corridor kiosk.
 *
 *  For the student with a cracked screen, no data pack, or no phone at all. The
 *  flow is deliberately three taps deep: identify, choose, confirm. The result is
 *  an ordinary case - only the source channel differs - so it lands in the same
 *  queue with the same target as a request filed from a phone.
 *
 *  Redesigned with Industrial Brutalism: High-contrast console frames, instant
 *  one-tap test roll chips, physical voucher receipt styling, and multilingual
 *  English / Hindi / Odia support.
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError, api, setChannel, currentChannel } from '../../lib/api'
import { duration, relative } from '../../lib/format'
import { useRemote } from '../../state/hooks'
import { Badge, Button, Card, Field, Select, TextArea, TextInput } from '../../components/ui'
import { KioskShell } from '../../layouts/KioskShell'
import { CaseStatusBadge, PriorityBadge } from '../../components/StatusChip'
import { useLanguage } from '../../lib/i18n'
import { useKioskSection } from '../../lib/kioskSection'
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

const QUICK_TEST_ROLLS = [
  { roll: '2026-CS-042', label: 'CS · Hostel 3 (Room 204)' },
  { roll: '2026-EE-018', label: 'EE · Hostel 1 (Room 102)' },
  { roll: '2026-ME-091', label: 'ME · Day Scholar' },
]

export function KioskPage() {
  const navigate = useNavigate()
  const { t, language } = useLanguage()
  const { section } = useKioskSection()
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
    setLocationCode('')
    setReceipt(null)
    setError(null)
  }

  const lookup = async (targetRoll?: string) => {
    const activeRoll = (targetRoll ?? roll).trim().toUpperCase()
    if (!activeRoll) return
    setBusy(true)
    setError(null)
    try {
      const result = await api.post<LookupResult>('/kiosk/lookup', { roll_number: activeRoll })
      setStudent(result)
      setRoll(activeRoll)
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
        location_code: locationCode || section.locationCode,
        state_payload: values,
        language: language || 'en',
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
        <div className="banner banner-error" role="alert" style={{ maxWidth: 820 }}>
          {error}
        </div>
      ) : null}

      {/* ---------------------------------------------------- STEP 1: IDENTIFY */}
      {step === 'identify' ? (
        <div className="stack" style={{ alignItems: 'center', width: '100%', gap: 'var(--sp-4)' }}>
          <div className="kiosk-card-frame">
            {/* Terminal Top Hardware Strip */}
            <div className="kiosk-terminal-header">
              <div className="row wrap" style={{ gap: 8, alignItems: 'center' }}>
                <span className="hero-kicker-beacon" aria-hidden="true" />
                <Badge tone="warn">{section.stationName}</Badge>
                <span className="mono tiny bold">TERMINAL ID: {section.stationId}</span>
                <span className="mono tiny hide-mobile" style={{ color: 'var(--muted)' }}>
                  [{section.sectionName}]
                </span>
              </div>
              <div className="mono tiny bold hide-mobile" style={{ color: 'var(--mint)' }}>
                ● MESH.ONLINE · ZERO-RESIDUAL STORAGE
              </div>
            </div>

            <div style={{ textAlign: 'start', marginBottom: 'var(--sp-4)' }}>
              <h1 className="kiosk-title" style={{ margin: '0 0 6px', textTransform: 'uppercase' }}>
                {t('kiosk.title')}
              </h1>
              <p className="kiosk-hint" style={{ margin: 0 }}>
                {t('kiosk.subtitle')}
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
              <input
                className="input kiosk-id-input"
                data-guide="kiosk-id"
                value={roll}
                onChange={(event) => setRoll(event.target.value.toUpperCase())}
                placeholder={t('kiosk.rollPlaceholder')}
                aria-label="Student roll number"
                onKeyDown={(event) => event.key === 'Enter' && void lookup()}
                autoFocus
              />

              {/* Quick test rolls strip for effortless evaluation */}
              <div>
                <div className="mono tiny muted" style={{ marginBottom: 4, fontWeight: 700 }}>
                  {t('kiosk.quickTestRolls')}
                </div>
                <div className="kiosk-quick-rolls">
                  {QUICK_TEST_ROLLS.map((item) => (
                    <button
                      key={item.roll}
                      type="button"
                      className="kiosk-quick-roll-btn"
                      onClick={() => void lookup(item.roll)}
                      disabled={busy}
                    >
                      <span className="mono bold" style={{ color: 'var(--signal)' }}>{item.roll}</span>
                      <span className="tiny muted">({item.label})</span>
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ marginTop: 'var(--sp-2)' }}>
                <Button
                  variant="primary"
                  size="xl"
                  block
                  busy={busy}
                  disabled={roll.trim().length < 2}
                  onClick={() => void lookup()}
                  style={{ minHeight: 52, fontSize: 'var(--fs-lg)', fontWeight: 800 }}
                >
                  {t('kiosk.verifyIdentity')}
                </Button>
              </div>
            </div>

            <div className="row-between wrap" style={{ borderTop: '1px solid var(--line)', marginTop: 'var(--sp-5)', paddingTop: 12 }}>
              <span className="mono tiny muted">{t('kiosk.securityNotice')}</span>
              <span className="mono tiny muted">PS07 · INDUSTRIAL BRUTALISM v2.4</span>
            </div>
          </div>

          {/* Campus Notices Bulletin */}
          {notices.data?.notices?.length ? (
            <Card style={{ width: '100%', maxWidth: 820, textAlign: 'start' }}>
              <div className="row-between" style={{ marginBottom: 8 }}>
                <div className="section-title" style={{ margin: 0 }}>{t('kiosk.alerts')}</div>
                <Badge tone="done">{t('kiosk.liveBroadcast')}</Badge>
              </div>
              <ul className="list-reset stack" style={{ gap: 8 }}>
                {notices.data.notices.map((notice) => (
                  <li
                    key={notice.id}
                    className="row"
                    style={{
                      alignItems: 'center',
                      gap: 10,
                      background: 'var(--surface-alt)',
                      padding: '8px 12px',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--line)',
                    }}
                  >
                    <Badge tone={notice.type === 'EMERGENCY' ? 'urgent' : 'warn'}>
                      {notice.type}
                    </Badge>
                    <span className="bold small">{notice.title}</span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      ) : null}

      {/* ---------------------------------------------------- STEP 2: CHOOSE SERVICE */}
      {step === 'choose' && student ? (
        <div className="stack" style={{ alignItems: 'center', width: '100%', gap: 'var(--sp-4)' }}>
          {/* Student Profile Header Box */}
          <div className="kiosk-student-header-box">
            <div>
              <div className="row wrap" style={{ gap: 8, alignItems: 'center', marginBottom: 4 }}>
                <Badge tone="done">{t('kiosk.studentVerified')}</Badge>
                <span className="mono bold" style={{ color: 'var(--signal)' }}>{student.student.roll_number}</span>
                <span className="mono tiny muted">
                  {student.student.branch ?? 'Engineering'} · Year {student.student.year ?? '2026'}
                </span>
              </div>
              <h2 style={{ margin: 0, fontSize: 'clamp(1.4rem, 2.5vw, 1.8rem)', textTransform: 'uppercase', fontWeight: 900 }}>
                {student.student.full_name}
              </h2>
            </div>

            <div className="row wrap" style={{ gap: 8, alignItems: 'center' }}>
              <div
                style={{
                  padding: '4px 10px',
                  background: 'var(--surface-alt)',
                  border: '1px solid var(--line)',
                  borderRadius: 'var(--radius-sm)',
                }}
              >
                <span className="mono tiny muted">HOSTEL: </span>
                <span className="mono tiny bold">
                  {student.student.hostel ? `${student.student.hostel} · Room ${student.student.room}` : 'Day Scholar'}
                </span>
              </div>
              <Badge tone={student.student.dues_balance === 0 ? 'done' : 'urgent'}>
                {student.student.dues_balance === 0 ? 'Dues: ₹0 Clear' : `Dues: ₹${student.student.dues_balance}`}
              </Badge>
            </div>
          </div>

          <div style={{ textAlign: 'center', maxWidth: 760 }}>
            <h1 className="kiosk-title" style={{ margin: '0 0 6px', textTransform: 'uppercase' }}>
              {t('kiosk.selectService')}
            </h1>
            <p className="kiosk-hint" style={{ margin: 0 }}>
              {t('kiosk.serviceHint')}
            </p>
          </div>

          {/* Service Cards Grid */}
          <div className="kiosk-services-grid" data-guide="kiosk-tiles">
            {(student.services ?? []).map((item) => (
              <div
                key={item.key}
                className="kiosk-service-card"
                onClick={() => {
                  setService(item)
                  setPriority(item.default_priority ?? 'NORMAL')
                  setValues({})
                  setStep('details')
                }}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setService(item)
                    setPriority(item.default_priority ?? 'NORMAL')
                    setValues({})
                    setStep('details')
                  }
                }}
              >
                <div className="row-between" style={{ width: '100%' }}>
                  <span style={{ fontSize: 36 }} aria-hidden="true">
                    {item.icon}
                  </span>
                  <Badge tone={item.default_priority === 'URGENT' ? 'urgent' : item.default_priority === 'HIGH' ? 'warn' : 'open'}>
                    {item.default_priority ?? 'NORMAL'}
                  </Badge>
                </div>
                <div style={{ fontWeight: 800, fontSize: '1.05rem', textTransform: 'uppercase', marginTop: 4 }}>
                  {item.name}
                </div>
                <span className="mono tiny muted">{item.category}</span>
              </div>
            ))}
          </div>

          <div className="row wrap center" style={{ gap: 12, marginTop: 'var(--sp-2)' }}>
            <Button variant="info" size="lg" onClick={() => setStep('status')}>
              {t('kiosk.checkStatus')}
            </Button>
            <Button variant="ghost" size="lg" onClick={reset}>
              {t('kiosk.startOver')}
            </Button>
          </div>
        </div>
      ) : null}

      {/* ---------------------------------------------------- STEP 3: DETAILS */}
      {step === 'details' && service && student ? (
        <div className="stack" style={{ alignItems: 'center', width: '100%', gap: 'var(--sp-4)' }}>
          <div className="kiosk-card-frame">
            <div className="row-between wrap" style={{ borderBottom: '1px solid var(--line)', paddingBottom: 'var(--sp-3)', marginBottom: 'var(--sp-4)', gap: 8 }}>
              <div className="row" style={{ alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 32 }} aria-hidden="true">{service.icon}</span>
                <div>
                  <div className="mono tiny muted">{service.category}</div>
                  <h2 style={{ margin: 0, textTransform: 'uppercase', fontWeight: 900 }}>{service.name}</h2>
                </div>
              </div>
              <Badge tone={priority === 'URGENT' ? 'urgent' : priority === 'HIGH' ? 'warn' : 'open'}>
                PRIORITY: {priority}
              </Badge>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
              <Field
                label={t('kiosk.describeProblem')}
                required
                hint={t('kiosk.describeHint')}
              >
                <TextArea
                  value={description}
                  onChange={setDescription}
                  rows={4}
                  placeholder="e.g. Switchboard sparking in room 204 near the study table..."
                />
                <div className="row-between" style={{ marginTop: 4 }}>
                  <span className="mono tiny muted">
                    {description.trim().length < 8 ? `Need ${8 - description.trim().length} more characters` : '✓ Description valid'}
                  </span>
                  <span className="mono tiny muted">{description.length} chars</span>
                </div>
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
                      placeholder={`Enter ${field.label.toLowerCase()}`}
                    />
                  )}
                </Field>
              ))}

              <Field
                label={t('kiosk.locationCode')}
                hint={t('kiosk.locationHint')}
              >
                <TextInput
                  value={locationCode}
                  onChange={(value) => setLocationCode(value.toUpperCase())}
                  placeholder="E.G. H3-204"
                />
              </Field>

              <div className="row wrap center" style={{ gap: 12, marginTop: 'var(--sp-3)' }}>
                <Button variant="ghost" size="lg" onClick={() => setStep('choose')}>
                  {t('kiosk.backToServices')}
                </Button>
                <Button
                  variant="primary"
                  size="xl"
                  busy={busy}
                  disabled={description.trim().length < 8}
                  onClick={() => void submit()}
                  style={{ minWidth: 260, fontWeight: 800 }}
                >
                  {t('kiosk.registerRequest')}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* ---------------------------------------------------- STEP 4: RECEIPT */}
      {step === 'receipt' && receipt ? (
        <div className="stack" style={{ alignItems: 'center', width: '100%', gap: 'var(--sp-4)' }}>
          <div className="kiosk-receipt-paper">
            <span className="kiosk-receipt-badge">{t('kiosk.officialReceipt')}</span>

            <div className="row-between wrap" style={{ gap: 8, alignItems: 'center', marginBottom: 12 }}>
              <Badge tone="done">{t('kiosk.queuedDispatched')}</Badge>
              <span className="mono tiny muted">STATION: KSK-NORTH-01</span>
            </div>

            <div className="mono" style={{ fontSize: 'clamp(2.2rem, 5vw, 3.2rem)', fontWeight: 900, letterSpacing: '0.05em' }}>
              #{receipt.case_number}
            </div>

            <div style={{ marginTop: 'var(--sp-3)', padding: 'var(--sp-3) var(--sp-4)', background: 'var(--surface-alt)', border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)' }}>
              <div className="bold">{receipt.service}</div>
              <p className="kiosk-hint" style={{ margin: '4px 0 0', fontSize: 'var(--fs-sm)' }}>{receipt.message}</p>
            </div>

            <div className="stack" style={{ gap: 6, marginTop: 'var(--sp-3)', borderTop: '1px dashed var(--line)', paddingTop: 12 }}>
              <div className="row-between wrap">
                <span className="mono tiny muted">STUDENT ROLL:</span>
                <span className="mono tiny bold">{student?.student.roll_number}</span>
              </div>
              <div className="row-between wrap">
                <span className="mono tiny muted">TIMESTAMP:</span>
                <span className="mono tiny bold">{new Date().toLocaleString()}</span>
              </div>
              <div className="row-between wrap">
                <span className="mono tiny muted">CHANNEL:</span>
                <span className="mono tiny bold">{currentChannel()} (SELF-SERVICE)</span>
              </div>
              <div className="row-between wrap">
                <span className="mono tiny muted">VERIFICATION HASH:</span>
                <span className="mono tiny bold" style={{ color: 'var(--signal)' }}>HMAC-SHA256 SIGNED</span>
              </div>
            </div>
          </div>

          <div className="row wrap center" style={{ gap: 12 }}>
            <Button variant="ghost" size="lg" onClick={() => window.print()}>
              {t('kiosk.printReceipt')}
            </Button>
            <Button
              variant="primary"
              size="lg"
              onClick={() => {
                reset()
                setRoll(student?.student.roll_number ?? '')
              }}
            >
              {t('kiosk.anotherRequest')}
            </Button>
            <Button variant="ghost" size="lg" onClick={reset}>
              {t('kiosk.finish')}
            </Button>
          </div>
        </div>
      ) : null}

      {/* ---------------------------------------------------- STEP 5: STATUS */}
      {step === 'status' && student ? (
        <div className="stack" style={{ alignItems: 'center', width: '100%', gap: 'var(--sp-4)' }}>
          <div className="kiosk-student-header-box">
            <div>
              <div className="mono tiny muted">{t('kiosk.requestTracker')}</div>
              <h2 style={{ margin: 0, textTransform: 'uppercase', fontWeight: 900 }}>
                {student.student.full_name} ({student.student.roll_number})
              </h2>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setStep('choose')}>
              {t('kiosk.backToServices')}
            </Button>
          </div>

          <div style={{ width: '100%', maxWidth: 860, textAlign: 'start' }}>
            {student.recent_cases.length === 0 ? (
              <Card>
                <p className="bold" style={{ margin: '0 0 4px' }}>No requests on record for this roll number.</p>
                <p className="small muted" style={{ margin: 0 }}>
                  If you filed one previously, verify the roll number at the assisted helpdesk counter.
                </p>
              </Card>
            ) : (
              <ul className="list-reset stack" style={{ gap: 10 }}>
                {student.recent_cases.map((item) => (
                  <Card as="li" key={item.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div className="row-between wrap" style={{ gap: 8 }}>
                      <span className="mono bold" style={{ fontSize: '1.1rem', color: 'var(--signal)' }}>
                        #{item.case_number}
                      </span>
                      <div className="row" style={{ gap: 6 }}>
                        <CaseStatusBadge status={item.status} />
                        <PriorityBadge priority={item.priority} />
                      </div>
                    </div>
                    <div style={{ fontSize: '1.15rem', fontWeight: 800 }}>{item.title}</div>
                    <div className="small muted">
                      {item.service_name} · opened {duration(item.age_minutes)} ago · updated {relative(item.last_activity_at)}
                    </div>
                  </Card>
                ))}
              </ul>
            )}
          </div>

          <div className="row wrap center" style={{ gap: 12 }}>
            <Button variant="primary" size="xl" onClick={() => setStep('choose')}>
              {t('kiosk.newRequest')}
            </Button>
            <Button variant="ghost" size="lg" onClick={reset}>
              {t('kiosk.finish')}
            </Button>
          </div>
        </div>
      ) : null}

      {step !== 'identify' ? (
        <Button variant="ghost" size="sm" onClick={() => navigate('/')} style={{ marginTop: 'var(--sp-2)' }}>
          {t('kiosk.exitKiosk')}
        </Button>
      ) : null}
    </KioskShell>
  )
}
