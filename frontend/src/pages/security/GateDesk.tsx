/** Gate desk.
 *
 *  Built for a guard holding a phone at a barrier in daylight: one input, one
 *  enormous verdict, no ambiguity. Refusal always states a reason — "no" without
 *  a reason starts an argument the guard cannot win.
 *
 *  Movements are recorded offline too. A gate with no signal is normal here, so
 *  the entry/exit is queued with the time it happened on the device.
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError, api } from '../../lib/api'
import { dateTime, relative } from '../../lib/format'
import { enqueue } from '../../lib/offline'
import { useRemote, useSyncState } from '../../state/hooks'
import { useSession } from '../../state/session'
import type { GateVerification } from '../../lib/types'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  KV,
  LoadingState,
  Metric,
  PageHeader,
  SectionTitle,
  Tabs,
  TextInput,
} from '../../components/ui'
import { ScanTarget } from '../../components/ScanTarget'

interface PassRow {
  id: number
  pass_code: string
  student_name: string | null
  roll_number: string | null
  hostel: string | null
  room: string | null
  valid_from: string
  valid_to: string
  state: string
  destination: string | null
  is_currently_valid: boolean
  case_id: number | null
}

interface LogRow {
  id: number
  direction: string
  occurred_at: string
  student_name: string | null
  roll_number: string | null
  pass_code: string | null
  logged_by: string | null
  offline_captured_at: string | null
  source_channel: string
}

export function GateDesk() {
  const navigate = useNavigate()
  const sync = useSyncState()
  const { can } = useSession()
  const [tab, setTab] = useState<'verify' | 'passes' | 'logs' | 'out'>('verify')
  const [code, setCode] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [verdict, setVerdict] = useState<GateVerification | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const passes = useRemote<{ passes: PassRow[] }>(
    tab === 'passes' ? 'gate-passes' : tab === 'out' ? 'gate-passes' : null,
    () => api.get<{ passes: PassRow[] }>('/gate/passes'),
  )
  const logs = useRemote<{ logs: LogRow[] }>(tab === 'logs' ? 'gate-logs' : null, () =>
    api.get<{ logs: LogRow[] }>('/gate/logs?limit=80'),
  )
  const summary = useRemote<any>(tab === 'out' ? 'gate-summary' : null, () => api.get('/gate/summary'))

  const verify = async (value = code) => {
    const trimmed = value.trim().toUpperCase()
    if (trimmed.length < 3) return
    setVerifying(true)
    setError(null)
    setVerdict(null)
    try {
      const result = await api.post<GateVerification>('/gate/verify', { pass_code: trimmed })
      setVerdict(result)
      setCode(trimmed)
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 0) {
        setError('No connection. Verification needs the server — do not admit on an unverified pass.')
      } else {
        setError(requestError instanceof ApiError ? requestError.message : 'Verification failed.')
      }
    } finally {
      setVerifying(false)
    }
  }

  const recordMovement = async (dir: 'ENTRY' | 'EXIT') => {
    setError(null)
    setMessage(null)
    const payload = {
      direction: dir,
      pass_code: code.trim().toUpperCase() || undefined,
      offline_captured_at: new Date().toISOString(),
      client_ref: `gate-${Date.now()}`,
    }
    try {
      await api.post('/gate/movements', payload)
      setMessage(`${dir === 'EXIT' ? 'Exit' : 'Entry'} recorded at ${dateTime(new Date().toISOString())}.`)
      setCode('')
      setVerdict(null)
      void passes.refresh()
      void logs.refresh()
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 0) {
        await enqueue({
          operation: 'GATE_LOG',
          payload,
          label: `${dir} ${code || 'movement'}`,
          case_ref: code || null,
        })
        setMessage('Recorded on this device. It will be sent when the network returns — the real time is kept.')
        setCode('')
        setVerdict(null)
        void sync.flush()
      } else {
        setError(requestError instanceof ApiError ? requestError.message : 'Could not record the movement.')
      }
    }
  }

  return (
    <div className="stack-lg">
      <PageHeader
        title="Gate desk"
        subtitle={`${dateTime(new Date().toISOString())} · verify passes, record movements, watch who is out`}
        actions={<Badge tone={sync.online ? 'done' : 'warn'}>{sync.online ? 'Connected' : 'Working offline'}</Badge>}
      />

      {message ? <div className="banner banner-info" role="status">{message}</div> : null}
      {error ? <div className="banner banner-error" role="alert">{error}</div> : null}

      <div data-guide="gate-tabs">
        <Tabs
          tabs={[
            { id: 'verify', label: 'Verify a pass' },
            { id: 'out', label: 'Who is out', count: summary.data?.currently_out_count },
            { id: 'passes', label: 'Active passes', count: passes.data?.passes?.length },
            { id: 'logs', label: 'Movement log' },
          ]}
          active={tab}
          onChange={setTab}
        />
      </div>

      {tab === 'verify' ? (
        <>
          <Card data-guide="gate-input">
            <Field label="Pass code" hint="Type it from the student's screen, or scan the QR.">
              <TextInput
                value={code}
                onChange={(value) => setCode(value.toUpperCase())}
                placeholder="GP-XXXXXX"
                inputMode="text"
                autoComplete="off"
              />
            </Field>
            <div className="row wrap">
              <Button variant="primary" size="lg" busy={verifying} onClick={() => void verify()}>
                Check this pass
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setCode('')
                  setVerdict(null)
                  setMessage(null)
                  setError(null)
                }}
              >
                Clear
              </Button>
            </div>
          </Card>

          <ScanTarget onCode={(value) => void verify(value)} hint="QR on a printed slip or the student's phone." submitLabel="Check this code" />

          {verdict ? (
            <>
              <div className={`gate-verdict ${verdict.valid ? 'allow' : 'refuse'}`} role="status">
                {verdict.valid ? 'ALLOW ENTRY' : 'DO NOT ADMIT'}
                <div style={{ fontSize: '0.42em', fontWeight: 700 }}>{verdict.reason ?? ''}</div>
              </div>

              <Card>
                <SectionTitle>Pass details</SectionTitle>
                <KV
                  items={[
                    { label: 'Student', value: verdict.student?.name ?? '—' },
                    { label: 'Roll number', value: <span className="mono">{verdict.student?.roll_number ?? '—'}</span> },
                    { label: 'Hostel / room', value: `${verdict.student?.hostel ?? '—'} / ${verdict.student?.room ?? '—'}` },
                    { label: 'Pass state', value: verdict.pass?.state ?? '—' },
                    { label: 'Valid from', value: dateTime(verdict.pass?.valid_from) },
                    { label: 'Valid to', value: dateTime(verdict.pass?.valid_to) },
                    { label: 'Destination', value: verdict.pass?.destination ?? '—' },
                    { label: 'Linked case', value: verdict.case?.case_number ?? '—' },
                  ]}
                />
                {verdict.case?.id ? (
                  <Button variant="ghost" style={{ marginTop: 10 }} onClick={() => navigate(`/cases/${verdict.case?.id}`)}>
                    Open {verdict.case.case_number}
                  </Button>
                ) : null}
              </Card>

              {can('gate:operate') ? (
                <Card accent={verdict.valid ? 'mint' : 'urgent'}>
                  <SectionTitle>Record the movement</SectionTitle>
                  <p className="small">
                    {verdict.valid
                      ? 'Record entry or exit against this pass so the register stays truthful.'
                      : 'A refused movement is still a fact worth recording, with the reason.'}
                  </p>
                  <div className="row wrap">
                    <Button variant="success" size="lg" onClick={() => void recordMovement('EXIT')}>
                      Recording EXIT
                    </Button>
                    <Button variant="info" size="lg" onClick={() => void recordMovement('ENTRY')}>
                      Recording ENTRY
                    </Button>
                  </div>
                </Card>
              ) : null}
            </>
          ) : null}
        </>
      ) : null}

      {tab === 'out' ? (
        <>
          <div className="grid-metrics">
            <Metric label="Currently out" value={summary.data?.currently_out_count ?? 0} tone="warn" />
            <Metric label="Exits today" value={summary.data?.exits_today ?? 0} />
            <Metric label="Entries today" value={summary.data?.entries_today ?? 0} />
            <Metric label="Active passes" value={summary.data?.active_passes ?? 0} hint={`${summary.data?.hostellers_on_record ?? 0} hostellers on record`} />
          </div>
          {summary.data?.currently_out?.length ? (
            <Card>
              <SectionTitle>Students currently outside</SectionTitle>
              <ul className="list-reset stack" style={{ gap: 8 }}>
                {summary.data.currently_out.map((row: any) => (
                  <li key={row.id} className="row-between">
                    <div>
                      <div className="bold">{row.student_name}</div>
                      <div className="tiny muted">
                        <span className="mono">{row.roll_number}</span> · {row.hostel ?? '—'} / {row.room ?? '—'} ·{' '}
                        {row.destination ?? 'no destination recorded'}
                      </div>
                    </div>
                    <div className="text-right">
                      <Badge tone={row.is_currently_valid ? 'warn' : 'urgent'}>
                        {row.is_currently_valid ? 'pass valid' : 'pass expired'}
                      </Badge>
                      <div className="tiny muted">left {relative(row.last_movement)}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          ) : (
            <EmptyState title="Nobody is recorded as outside" detail="Every active pass is either unused or already returned." />
          )}
        </>
      ) : null}

      {tab === 'passes' ? (
        <Card>
          <SectionTitle>Active passes</SectionTitle>
          {!passes.data?.passes?.length ? (
            <EmptyState title="No active passes" detail="Passes appear once a leave request is approved." />
          ) : (
            <div className="table-wrap become-cards">
              <table className="data">
                <thead>
                  <tr>
                    <th>Pass</th>
                    <th>Student</th>
                    <th>Where</th>
                    <th>Validity</th>
                    <th>State</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {passes.data.passes.map((row) => (
                    <tr key={row.id}>
                      <td data-label="Pass">
                        <span className="mono bold">{row.pass_code}</span>
                      </td>
                      <td data-label="Student">
                        {row.student_name}
                        <div className="tiny muted mono">{row.roll_number}</div>
                      </td>
                      <td data-label="Where">
                        {row.hostel ?? '—'} / {row.room ?? '—'}
                      </td>
                      <td data-label="Validity">
                        {row.is_currently_valid ? <Badge tone="done">valid now</Badge> : <Badge tone="dead">outside window</Badge>}
                        <div className="tiny muted">until {dateTime(row.valid_to)}</div>
                      </td>
                      <td data-label="State">{row.state}</td>
                      <td data-label="Actions">
                        <Button size="sm" variant="info" onClick={() => { setCode(row.pass_code); setTab('verify'); void verify(row.pass_code) }}>
                          Verify
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : null}

      {tab === 'logs' ? (
        <Card>
          <SectionTitle right={<Badge tone="ghost">append-only</Badge>}>Recent movements</SectionTitle>
          {logs.loading && !logs.data ? <LoadingState /> : null}
          {logs.data?.logs?.length ? (
            <div className="table-wrap become-cards">
              <table className="data">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Direction</th>
                    <th>Student</th>
                    <th>Pass</th>
                    <th>Recorded by</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.data.logs.map((row) => (
                    <tr key={row.id}>
                      <td data-label="When">
                        {dateTime(row.occurred_at)}
                        <div className="tiny muted">{relative(row.occurred_at)}</div>
                        {row.offline_captured_at ? (
                          <Badge tone="warn">captured offline {relative(row.offline_captured_at)}</Badge>
                        ) : null}
                      </td>
                      <td data-label="Direction">
                        <Badge tone={row.direction === 'EXIT' ? 'warn' : 'done'}>{row.direction}</Badge>
                      </td>
                      <td data-label="Student">
                        {row.student_name ?? '—'}
                        <div className="tiny muted mono">{row.roll_number ?? ''}</div>
                      </td>
                      <td data-label="Pass">
                        <span className="mono tiny">{row.pass_code ?? '—'}</span>
                      </td>
                      <td data-label="Recorded by">
                        {row.logged_by ?? '—'}
                        <div className="tiny muted">{row.source_channel}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="No movements recorded yet" />
          )}
        </Card>
      ) : null}

      {!sync.online ? (
        <p className="small muted">
          Offline: verifications are refused rather than guessed, because admitting someone on an unverifiable pass is
          the one mistake a gate cannot undo. Movements are queued with the time they actually happened, so the
          register stays accurate.
        </p>
      ) : null}
    </div>
  )
}
