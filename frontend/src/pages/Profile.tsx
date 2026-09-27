/** Profile, device and demo controls.
 *
 *  The honesty rules of this product live on this screen: what the deployment
 *  actually has configured (agents, channels), what is demo data, and which
 *  integrations are placeholders rather than working features.
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError, api, currentChannel } from '../lib/api'
import { LANGUAGES, currentLanguage, setLanguage, translationCoverage, type LanguageCode } from '../lib/i18n'
import { dateTime } from '../lib/format'
import { useRemote, useSyncState } from '../state/hooks'
import { useSession } from '../state/session'
import type { MetaPayload } from '../lib/types'
import { Badge, Button, Card, KV, PageHeader, SectionTitle, Select } from '../components/ui'
import { SyncCentreSheet } from '../components/OfflineBar'

export function ProfilePage() {
  const navigate = useNavigate()
  const { profile, logout, can, refresh } = useSession()
  const sync = useSyncState()
  const [syncOpen, setSyncOpen] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [language, setLocal] = useState<LanguageCode>(currentLanguage())

  const { data: meta } = useRemote<MetaPayload>('meta', () => api.get<MetaPayload>('/meta'))
  const { data: config } = useRemote<any>(
    can('config:manage') ? 'config-summary' : null,
    () => api.get('/admin/config/summary'),
  )

  const student = profile?.student

  return (
    <div className="stack-lg">
      <PageHeader
        title="Profile"
        subtitle="Your account, your device, and what this deployment really has configured"
      />

      {message ? <div className="banner banner-info">{message}</div> : null}

      <Card>
        <SectionTitle right={<Badge tone="ghost">{profile?.role.replaceAll('_', ' ').toLowerCase()}</Badge>}>
          Account
        </SectionTitle>
        <KV
          items={[
            { label: 'Name', value: profile?.full_name },
            { label: 'Email', value: <span className="mono">{profile?.email}</span> },
            { label: 'Phone', value: profile?.phone ?? '—' },
            { label: 'Campus', value: profile?.campus?.name ?? '—' },
            { label: 'Device channel', value: currentChannel() },
          ]}
        />
      </Card>

      {student ? (
        <Card>
          <SectionTitle>Student record</SectionTitle>
          <KV
            items={[
              { label: 'Roll number', value: <span className="mono">{student.roll_number}</span> },
              { label: 'Programme', value: `${student.branch ?? '—'} · ${student.year ?? '—'}` },
              { label: 'Hostel', value: student.is_hosteller ? `${student.hostel ?? '—'} / Room ${student.room ?? '—'}` : 'Day scholar' },
              {
                label: 'Dues',
                value:
                  student.dues_balance > 0 ? (
                    <span>
                      <Badge tone="warn">₹{student.dues_balance.toFixed(0)} outstanding</Badge>
                    </span>
                  ) : (
                    <Badge tone="done">cleared</Badge>
                  ),
              },
              { label: 'Smartphone', value: student.has_smartphone ? 'yes' : 'no — kiosk/helpdesk applies' },
            ]}
          />
          {student.dues_balance > 0 ? (
            <p className="small muted" style={{ marginTop: 8 }}>
              Certificate requests check dues automatically, so a pending balance can block one. The case will say
              exactly which rule stopped it.
            </p>
          ) : null}
        </Card>
      ) : null}

      {profile?.staff ? (
        <Card>
          <SectionTitle>Work details</SectionTitle>
          <KV
            items={[
              { label: 'Designation', value: profile.staff.designation },
              { label: 'Department', value: profile.staff.department ?? '—' },
              { label: 'Open cases', value: `${profile.staff.open_cases} of ${profile.staff.workload_capacity} capacity` },
            ]}
          />
        </Card>
      ) : null}

      <Card>
        <SectionTitle>Language</SectionTitle>
        <Select
          value={language}
          onChange={async (value) => {
            const next = value as LanguageCode
            setLanguage(next)
            setLocal(next)
            try {
              await api.patch(`/admin/users/${profile?.id}`, { language: next })
              setMessage('Language preference saved on your account.')
              void refresh()
            } catch {
              setMessage('Saved on this device only — the server could not be reached.')
            }
          }}
          options={LANGUAGES.map((item) => ({ value: item.code, label: `${item.native} (${item.label})` }))}
        />
        <ul className="list-reset small" style={{ marginTop: 8 }}>
          {translationCoverage().map((row) => (
            <li key={row.language}>
              {row.language.toUpperCase()}: {row.translated}/{row.total} interface strings translated
              {row.language === 'or' ? ' — the rest fall back to English rather than showing a blank' : ''}
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <SectionTitle>Offline & sync</SectionTitle>
        <KV
          items={[
            { label: 'Connection', value: sync.online ? 'Online' : 'Offline' },
            { label: 'Waiting to send', value: sync.pending + sync.retrying },
            { label: 'Needs attention', value: sync.conflicts + sync.requiresAction },
            { label: 'Last successful sync', value: sync.lastFlushAt ? dateTime(sync.lastFlushAt) : 'not yet' },
            {
              label: 'Storage',
              value: sync.storageAvailable ? 'available' : sync.storageReason ?? 'blocked',
            },
          ]}
        />
        <div className="row wrap" style={{ marginTop: 12 }}>
          <Button variant="primary" onClick={() => setSyncOpen(true)}>
            Open the offline queue
          </Button>
          <Button variant="info" onClick={() => void sync.probe()}>
            Check connection
          </Button>
          <Button variant="ghost" onClick={() => navigate('/sync')}>
            Full sync page
          </Button>
        </div>
      </Card>

      <Card>
        <SectionTitle>What this deployment really has</SectionTitle>
        {meta ? (
          <>
            <KV
              items={[
                { label: 'Environment', value: meta.env },
                { label: 'Demo mode', value: meta.demo_mode ? 'yes' : 'no' },
                { label: 'Server time', value: dateTime(meta.server_time) },
                {
                  label: 'Clock offset',
                  value: `${meta.clock_offset_minutes.toFixed(0)} minutes (demo time travel)`,
                },
                {
                  label: 'Agents',
                  value: `${meta.agents.mode} — ${meta.agents.remote ? 'remote model' : 'deterministic rules'}`,
                },
              ]}
            />
            <div className="divider" />
            <ul className="list-reset stack" style={{ gap: 6 }}>
              {Object.entries(meta.notification_channels).map(([channel, info]) => (
                <li key={channel} className="row-between">
                  <span>{channel}</span>
                  <Badge tone={info.configured ? 'done' : 'ghost'}>
                    {info.configured ? 'configured' : 'not configured'}
                  </Badge>
                </li>
              ))}
            </ul>
            <p className="small muted" style={{ marginTop: 8 }}>
              {meta.external_messaging.note}
            </p>
          </>
        ) : (
          <p className="small muted">Loading deployment info…</p>
        )}
      </Card>

      {config && can('config:manage') ? (
        <Card>
          <SectionTitle>Configuration</SectionTitle>
          <p className="small muted">
            {typeof config === 'object' ? Object.keys(config).join(', ') : String(config)}
          </p>
          <div className="row wrap">
            <Button variant="ghost" onClick={() => navigate('/directory')}>
              Open directory & config
            </Button>
          </div>
        </Card>
      ) : null}

      {can('demo:reset') ? (
        <Card accent="sun">
          <SectionTitle>Demo controls</SectionTitle>
          <p className="small">
            Resetting rebuilds the seeded campus and its 30 days of history. Use it between demonstrations so the
            numbers are reproducible.
          </p>
          <div className="row wrap">
            <Button
              variant="danger"
              busy={busy}
              onClick={async () => {
                if (!window.confirm('Rebuild the demo campus? All current demo data is replaced.')) return
                setBusy(true)
                try {
                  await api.post('/admin/demo/reset', { confirm: true, days_of_history: 30 })
                  setMessage('Demo campus rebuilt.')
                  void refresh()
                } catch (requestError) {
                  setMessage(requestError instanceof ApiError ? requestError.message : 'Reset failed.')
                } finally {
                  setBusy(false)
                }
              }}
            >
              Rebuild demo data
            </Button>
            <Button
              variant="attention"
              busy={busy}
              onClick={async () => {
                setBusy(true)
                try {
                  await api.post('/admin/demo/time-travel', { days: 5 })
                  setMessage('Clock moved forward 5 days — SLA states and escalations should now reflect that.')
                  void refresh()
                } catch (requestError) {
                  setMessage(requestError instanceof ApiError ? requestError.message : 'Time travel failed.')
                } finally {
                  setBusy(false)
                }
              }}
            >
              Jump 5 days ahead
            </Button>
            <Button
              variant="ghost"
              busy={busy}
              onClick={async () => {
                setBusy(true)
                try {
                  await api.post('/admin/demo/time-reset', {})
                  setMessage('Clock reset to real time.')
                } catch {
                  setMessage('Could not reset the clock.')
                } finally {
                  setBusy(false)
                }
              }}
            >
              Reset clock
            </Button>
          </div>
        </Card>
      ) : null}

      <Button variant="danger" block size="lg" onClick={logout}>
        Sign out
      </Button>

      <SyncCentreSheet open={syncOpen} onClose={() => setSyncOpen(false)} />
    </div>
  )
}
