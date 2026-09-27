/** Raise a request.
 *
 *  Three steps, one screen each, because the target device is a phone held in
 *  one hand. The important behaviour is what happens with no network: the request
 *  is written to the device's outbox with a key generated *here*, then replayed
 *  until the server accepts it exactly once. The person is told the truth about
 *  which parts made it (the text does; the photo cannot until it syncs).
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ApiError, api } from '../../lib/api'
import { currentLanguage } from '../../lib/i18n'
import { enqueue, newIdempotencyKey, readDraft, saveDraft, deleteDraft } from '../../lib/offline'
import { useSession } from '../../state/session'
import { useRemote, useSyncState } from '../../state/hooks'
import type { CaseDetail, FormField, ServiceDefinition } from '../../lib/types'
import { Badge, Button, Card, Field, KV, Select, TextArea, TextInput } from '../../components/ui'
import { ScanTarget } from '../../components/ScanTarget'

interface CatalogContext {
  services: ServiceDefinition[]
  role: string
}

interface IntakeAnalysis {
  service_key: string
  category: string
  priority: string
  title: string
  summary: string
  location_hint: string | null
  missing_information: string[]
  possible_duplicate: any
  confidence: number
  engine: string
  fallback_reason: string | null
}

type Values = Record<string, string>

export function ReportPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const sync = useSyncState()
  const { profile } = useSession()

  const { data: catalog, loading } = useRemote<CatalogContext>('catalog-context', () =>
    api.get<CatalogContext>('/catalog/context'),
  )

  const [step, setStep] = useState(1)
  const [serviceKey, setServiceKey] = useState<string | null>(params.get('service'))
  const [description, setDescription] = useState('')
  const [title, setTitle] = useState('')
  const [priority, setPriority] = useState('NORMAL')
  const [values, setValues] = useState<Values>({})
  const [locationCode, setLocationCode] = useState('')
  const [showScanner, setShowScanner] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [analysis, setAnalysis] = useState<IntakeAnalysis | null>(null)
  const [receipt, setReceipt] = useState<{ reference: string; offline: boolean; message: string } | null>(null)
  const [duplicateOf, setDuplicateOf] = useState<string | null>(null)
  const draftLoaded = useRef(false)

  const services = catalog?.services ?? []
  const service = useMemo(
    () => services.find((item) => item.key === serviceKey) ?? null,
    [services, serviceKey],
  )

  // Draft recovery: a half-written complaint must survive a phone restart.
  useEffect(() => {
    if (draftLoaded.current) return
    draftLoaded.current = true
    void (async () => {
      const draft = await readDraft('hostel-report')
      if (draft && !params.get('service')) {
        setDescription(draft.values.description ?? '')
        setValues(draft.values.fields ?? {})
        setLocationCode(draft.values.location_code ?? '')
        setServiceKey(draft.values.service_key ?? null)
      }
    })()
  }, [params])

  useEffect(() => {
    if (!draftLoaded.current) return
    if (!description && !Object.keys(values).length) return
    void saveDraft('hostel-report', { description, fields: values, location_code: locationCode, service_key: serviceKey })
  }, [description, values, locationCode, serviceKey])

  useEffect(() => {
    if (service) setPriority(service.default_priority ?? 'NORMAL')
  }, [service])

  const runIntake = async () => {
    if (description.trim().length < 8) return
    setBusy(true)
    setError(null)
    try {
      const result = await api.post<IntakeAnalysis>('/agents/intake', {
        text: description,
        service_key: serviceKey ?? undefined,
        location_code: locationCode || undefined,
      })
      setAnalysis(result)
      if (!serviceKey && result.service_key) setServiceKey(result.service_key)
      if (result.priority) setPriority(result.priority)
      if (!title && result.title) setTitle(result.title)
      if (result.location_hint && !locationCode) setLocationCode(result.location_hint)
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : 'The assistant could not read that just now. You can still choose a category yourself.',
      )
    } finally {
      setBusy(false)
    }
  }

  const missing = useMemo(() => {
    if (!service) return []
    return (service.form_schema || [])
      .filter((field) => field.required && !String(values[field.name] ?? '').trim())
      .map((field) => field.label)
  }, [service, values])

  const canSubmit =
    Boolean(service) && description.trim().length >= 8 && missing.length === 0

  const submit = async () => {
    if (!service) return
    setBusy(true)
    setError(null)
    const key = newIdempotencyKey('case')
    const payload = {
      service_key: service.key,
      description,
      title: title || undefined,
      priority,
      location_code: locationCode || undefined,
      state_payload: values,
      language: currentLanguage(),
      client_ref: key,
    }

    try {
      const response = await api.post<{
        created: boolean
        case: CaseDetail
        possible_duplicate_of: string | null
      }>('/cases', payload, { 'Idempotency-Key': key })

      // Photos need a case id, which only exists once the server has it.
      for (const file of files) {
        const form = new FormData()
        form.append('file', file)
        form.append('kind', 'EVIDENCE')
        form.append('note', 'Added from the phone app')
        try {
          await api.upload(`/cases/${response.case.id}/attachments`, form)
        } catch {
          /* the case exists; a failed photo is recoverable from the case screen */
        }
      }

      await deleteDraft('hostel-report')
      if (response.possible_duplicate_of) setDuplicateOf(response.possible_duplicate_of)
      navigate(`/cases/${response.case.id}`)
    } catch (requestError) {
      const offline = requestError instanceof ApiError && (requestError.status === 0 || requestError.status >= 500)
      if (!offline) {
        setError(
          requestError instanceof ApiError ? requestError.message : 'The request could not be submitted.',
        )
        setBusy(false)
        return
      }

      // Offline path: queue it. The key is already stable, so a repeated submit
      // (double tap, app restart) cannot create two cases.
      await enqueue({
        operation: 'CASE_CREATE',
        payload,
        client_base: {},
        entity_id: null,
        label: `${service.name} — ${description.slice(0, 60)}`,
        case_ref: key.slice(-6).toUpperCase(),
      })
      await sync.flush().catch(() => undefined)
      await deleteDraft('hostel-report')
      setReceipt({
        reference: key.slice(-6).toUpperCase(),
        offline: true,
        message:
          files.length > 0
            ? 'Your request is saved on this phone and will be filed automatically. Photos could not be attached offline — add them from the case once it syncs.'
            : 'Your request is saved on this phone and will be filed automatically as soon as you have a signal.',
      })
    } finally {
      setBusy(false)
    }
  }

  if (receipt) {
    return (
      <div className="stack-lg">
        <Card className="tint-mint">
          <h1>Request saved</h1>
          <p className="bold" style={{ marginBottom: 0 }}>
            Reference on this phone: <span className="mono">{receipt.reference}</span>
          </p>
          <p className="small" style={{ marginTop: 8 }}>
            {receipt.message}
          </p>
        </Card>
        <Card>
          <KV
            items={[
              { label: 'Service', value: service?.name ?? '—' },
              { label: 'Where', value: locationCode || 'not specified' },
              { label: 'Urgency', value: priority },
              { label: 'Status', value: <Badge tone="warn">Queued on this device</Badge> },
            ]}
          />
        </Card>
        <Button variant="primary" size="lg" block onClick={() => navigate('/sync')}>
          See the offline queue
        </Button>
        <Button variant="ghost" block onClick={() => navigate('/cases')}>
          My cases
        </Button>
      </div>
    )
  }

  return (
    <div className="stack-lg">
      <div className="row-between" data-guide="report-offline">
        <h1>New request</h1>
        <Badge tone={sync.online ? 'done' : 'warn'}>{sync.online ? 'Online' : 'Offline'}</Badge>
      </div>
      {!sync.online ? (
        <div className="banner banner-offline">
          No connection. You can still submit — it will be filed the moment the network returns.
        </div>
      ) : null}
      {duplicateOf ? (
        <div className="banner banner-info">A similar case exists: {duplicateOf}</div>
      ) : null}

      {step === 1 ? (
        <>
          <Card data-guide="report-describe">
            <Field
              label="What is the problem or request?"
              hint="Write it the way you would tell a friend. We will work out the category."
            >
              <TextArea
                value={description}
                onChange={setDescription}
                rows={5}
                placeholder="The ceiling fan in my room stopped working and it is very hot at night."
              />
            </Field>
            <div className="row wrap">
              <Button variant="agent" busy={busy} onClick={() => void runIntake()} disabled={description.trim().length < 8}>
                Suggest category
              </Button>
              <Button variant="ghost" onClick={() => setStep(2)} disabled={description.trim().length < 8}>
                Choose myself →
              </Button>
            </div>
          </Card>

          {analysis ? (
            <Card className="card-accent-agent">
              <div className="row wrap" style={{ gap: 6 }}>
                <Badge tone="agent">Understood</Badge>
                <Badge tone="ghost">{analysis.engine}</Badge>
                <Badge tone="ghost">confidence {Math.round(analysis.confidence * 100)}%</Badge>
              </div>
              <h3 style={{ marginTop: 6 }}>{analysis.title}</h3>
              <p className="small">{analysis.summary}</p>
              {analysis.location_hint ? (
                <p className="small">
                  Suspected location: <span className="mono">{analysis.location_hint}</span>
                </p>
              ) : null}
              {analysis.missing_information?.length ? (
                <p className="small">
                  Still needed: {analysis.missing_information.join(', ')}
                </p>
              ) : null}
              <Button variant="primary" onClick={() => setStep(2)}>
                Continue
              </Button>
            </Card>
          ) : null}

          <Card data-guide="report-services">
            <div className="section-title">All services</div>
            <div className="stack" style={{ gap: 8 }}>
              {loading ? <p className="muted">Loading the service catalogue…</p> : null}
              {services
                .filter((item) => item.can_raise !== false)
                .map((item) => (
                  <Button
                    key={item.key}
                    variant={item.key === serviceKey ? 'primary' : 'ghost'}
                    block
                    onClick={() => {
                      setServiceKey(item.key)
                      setStep(2)
                    }}
                  >
                    {item.icon} {item.name}
                  </Button>
                ))}
            </div>
          </Card>
        </>
      ) : null}

      {step === 2 && service ? (
        <>
          <Card>
            <div className="row-between">
              <div>
                <div className="bold">{service.name}</div>
                <div className="small muted">{service.description}</div>
              </div>
              <Badge tone="ghost">{service.category}</Badge>
            </div>
          </Card>

          <Card>
            <Field label="Short title" hint="Optional — we will use your description if left empty.">
              <TextInput value={title} onChange={setTitle} placeholder="Fan not working in room AA-101" />
            </Field>

            <Field label="Urgency">
              <Select
                value={priority}
                onChange={setPriority}
                options={[
                  { value: 'LOW', label: 'Low — whenever possible' },
                  { value: 'NORMAL', label: 'Normal' },
                  { value: 'HIGH', label: 'High — affecting my studies' },
                  { value: 'CRITICAL', label: 'Critical — unsafe situation' },
                ]}
              />
            </Field>
            <p className="hint">
              Requests also carry a service target. Choosing "Critical" where it is not true slows down work for
              everyone.
            </p>
          </Card>

          {(service.form_schema || []).length ? (
            <Card>
              <div className="section-title">Details</div>
              {(service.form_schema || []).map((field) => (
                <DynamicField
                  key={field.name}
                  field={field}
                  value={values[field.name] ?? ''}
                  onChange={(value) => setValues((current) => ({ ...current, [field.name]: value }))}
                />
              ))}
            </Card>
          ) : null}

          <Card>
            <div className="section-title">Location</div>
            {locationCode ? (
              <KV items={[{ label: 'Code', value: <span className="mono">{locationCode}</span> }]} />
            ) : null}
            <div className="row wrap" style={{ marginTop: 8 }}>
              <Button variant="info" onClick={() => setShowScanner((value) => !value)}>
                {showScanner ? 'Hide scanner' : 'Scan the label'}
              </Button>
              {locationCode ? (
                <Button variant="ghost" onClick={() => setLocationCode('')}>
                  Clear
                </Button>
              ) : null}
            </div>
            {showScanner ? (
              <div style={{ marginTop: 12 }}>
                <ScanTarget onCode={(code) => { setLocationCode(code); setShowScanner(false) }} />
              </div>
            ) : null}
          </Card>

          {service.requires_attachment ? (
            <Card>
              <div className="section-title">Photo evidence</div>
              <Field label="Attach a photo" hint="A picture halves the time it takes to fix most maintenance issues.">
                <input
                  className="input"
                  type="file"
                  accept="image/*,application/pdf"
                  multiple
                  onChange={(event) => setFiles(Array.from(event.target.files ?? []).slice(0, 3))}
                />
              </Field>
              {!sync.online ? (
                <p className="small muted">
                  Offline: photos cannot be attached until this request reaches the server. Submit now and add them
                  from the case afterwards.
                </p>
              ) : null}
            </Card>
          ) : null}

          {error ? <div className="banner banner-error">{error}</div> : null}

          <div className="row wrap">
            <Button variant="ghost" onClick={() => setStep(1)}>
              ← Back
            </Button>
            <Button variant="primary" onClick={() => setStep(3)} disabled={!canSubmit}>
              Review
            </Button>
          </div>
          {missing.length ? (
            <p className="small field-error">Still needed: {missing.join(', ')}</p>
          ) : null}
        </>
      ) : null}

      {step === 3 && service ? (
        <>
          <Card>
            <div className="section-title">Check before sending</div>
            <KV
              items={[
                { label: 'Service', value: service.name },
                { label: 'Urgency', value: priority },
                { label: 'Location', value: locationCode || '—' },
                { label: 'Target', value: `${service.default_sla_minutes} minutes (service standard)` },
                ...Object.entries(values).map(([key, value]) => ({
                  label: key.replaceAll('_', ' '),
                  value: value || '—',
                })),
              ]}
            />
            <div className="divider" />
            <div className="bold">{title || description.slice(0, 80)}</div>
            <p className="small">{description}</p>
            {files.length ? <p className="small">{files.length} photo(s) attached</p> : null}
          </Card>

          {error ? <div className="banner banner-error">{error}</div> : null}

          <Button variant="primary" size="xl" block busy={busy} onClick={() => void submit()} disabled={!canSubmit}>
            Submit request
          </Button>
          <Button variant="ghost" block onClick={() => setStep(2)}>
            ← Edit details
          </Button>
          <p className="tiny muted">
            You will get a case number immediately. {profile?.role === 'STUDENT' ? 'You can follow every step of it.' : ''}
          </p>
        </>
      ) : null}
    </div>
  )
}

function DynamicField({
  field,
  value,
  onChange,
}: {
  field: FormField
  value: string
  onChange: (value: string) => void
}) {
  if (field.type === 'textarea') {
    return (
      <Field label={field.label} required={field.required}>
        <TextArea value={value} onChange={onChange} rows={3} />
      </Field>
    )
  }
  if (field.type === 'select') {
    return (
      <Field label={field.label} required={field.required}>
        <Select
          value={value}
          onChange={onChange}
          options={[{ value: '', label: 'Select…' }, ...(field.options ?? []).map((option) => ({ value: option, label: option }))]}
        />
      </Field>
    )
  }
  if (field.type === 'location') {
    return (
      <Field label={field.label} required={field.required} hint="Room or asset code, e.g. CR-ROOM-AA-101">
        <TextInput value={value} onChange={onChange} placeholder="CR-ROOM-AA-101" />
      </Field>
    )
  }
  return (
    <Field label={field.label} required={field.required}>
      <TextInput
        value={value}
        onChange={onChange}
        type={field.type === 'date' ? 'date' : 'text'}
        inputMode={field.type === 'number' ? 'numeric' : 'text'}
      />
    </Field>
  )
}
