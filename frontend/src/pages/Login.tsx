/** Sign-in, in three shapes.
 *
 *  The sign-in screen has to match the station it is standing on:
 *
 *    standard  a person signing in on their own phone or laptop
 *    kiosk     a shared tablet in a corridor, signed in once by an operator and
 *              then left alone — so: giant targets, operator-only accounts, no
 *              navigation, no personal session left behind
 *    desk      the helpdesk counter, where the signed-in person files requests
 *              on behalf of students who walk up
 *
 *  The variant comes from the route or an explicit mode, and the chosen station
 *  is remembered on the device so a rebooted kiosk opens as a kiosk.
 */

import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ApiError, api, currentDeviceMode, setDeviceMode, type DeviceMode } from '../lib/api'
import { useSession } from '../state/session'
import { useInstitution } from '../state/institution'
import { useTheme } from '../state/theme'
import { Badge, Button, Card, Field, TextInput } from '../components/ui'
import { KioskShell } from '../layouts/KioskShell'
import { THEME_OPTIONS } from '../state/theme'
import type { Profile, RoleKey } from '../lib/types'

interface DemoAccount {
  role: string
  email: string
  password: string
  label: string
}

const KIOSK_ROLES: RoleKey[] = ['HELPDESK_OPERATOR', 'ADMIN', 'SUPER_ADMIN', 'WARDEN']
const DESK_ROLES: RoleKey[] = ['HELPDESK_OPERATOR', 'WARDEN', 'ADMIN', 'SUPER_ADMIN']

/** High-fidelity SVG icons for auth feature points */
function IconWifiOff() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="square">
      <path d="M1 1l22 22M16.72 11.06A10.94 10.94 0 0 1 19 12.55M5 12.55a10.94 10.94 0 0 1 5.17-2.39M10.71 5.05A16 16 0 0 1 22.58 9M1.42 9a15.91 15.91 0 0 1 4.7-2.88M8.53 16.11a6 6 0 0 1 6.95 0" />
      <line x1="12" y1="20" x2="12.01" y2="20" />
    </svg>
  )
}

function IconShieldCheck() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="square">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  )
}

function IconStations() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="square">
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  )
}

/** Three architectural guarantees verified by the system */
const AUTH_POINTS = [
  {
    icon: <IconWifiOff />,
    title: 'Offline-First Mesh Resilience',
    body: 'Transactions write to device IndexedDB outbox first with UUIDv4 idempotency keys. Reconnect auto-sync guarantees zero data lost in basement dead zones.',
  },
  {
    icon: <IconShieldCheck />,
    title: 'Immutable Cryptographic Proof',
    body: 'HMAC-SHA256 digital passes and append-only PostgreSQL 16 audit ledger log who approved what, when, and from which device without deletion capability.',
  },
  {
    icon: <IconStations />,
    title: '8 Tailored Station Workspaces',
    body: 'Ergonomic, specialized operational environments for Students, Technicians, Wardens, Security Officers, Admins, and Corridor Kiosks.',
  },
]

const PERSONAS_CONFIG: Record<string, { label: string; tone: 'open' | 'warn' | 'done' | 'urgent'; desc: string }> = {
  STUDENT: {
    label: 'Student PWA',
    tone: 'open',
    desc: 'Roll 2026-CS-042 · Hostel 3 Room 204',
  },
  STAFF: {
    label: 'Technician Queue',
    tone: 'warn',
    desc: 'Senior Maintenance Electrician',
  },
  WARDEN: {
    label: 'Hostel Warden',
    tone: 'done',
    desc: 'Boys Hostel 1 · Leave & Policy Approvals',
  },
  SECURITY: {
    label: 'Gate Security',
    tone: 'urgent',
    desc: 'Main Gate 1 · HMAC QR Pass Scanner',
  },
  ADMIN: {
    label: 'Command Centre',
    tone: 'warn',
    desc: 'Campus Director · AI Fleet & Ledger',
  },
  HELPDESK_OPERATOR: {
    label: 'Assisted Desk',
    tone: 'open',
    desc: 'Walk-up Assisted Counter Operator',
  },
}

/** Where each role wakes up. The login "type" decides the landing experience. */
export function landingFor(profile: Profile, mode: DeviceMode): string {
  if (mode === 'kiosk') return '/kiosk'
  if (mode === 'desk') return '/helpdesk'
  switch (profile.role) {
    case 'SECURITY':
      return '/gate'
    case 'HELPDESK_OPERATOR':
      return '/helpdesk'
    case 'ADMIN':
    case 'SUPER_ADMIN':
    case 'WARDEN':
    case 'DEPARTMENT_HEAD':
      return '/operations'
    case 'STAFF':
      return '/tasks'
    default:
      return '/'
  }
}

export function LoginPage({ variant = 'standard' }: { variant?: 'standard' | 'kiosk' | 'desk' }) {
  const { login, status } = useSession()
  const institution = useInstitution()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [accounts, setAccounts] = useState<DemoAccount[] | null>(null)
  const [showPassword, setShowPassword] = useState(false)

  useEffect(() => {
    void api
      .get<{ accounts: DemoAccount[] }>('/auth/demo-accounts')
      .then((response) => setAccounts(response.accounts))
      .catch(() => setAccounts([]))
  }, [])

  const submit = async (nextEmail = email, nextPassword = password, mode?: DeviceMode) => {
    setBusy(true)
    setError(null)
    const station: DeviceMode = mode ?? (variant === 'kiosk' ? 'kiosk' : variant === 'desk' ? 'desk' : currentDeviceMode())
    setDeviceMode(station)
    try {
      const profile = await login(nextEmail, nextPassword)
      navigate(landingFor(profile, station), { replace: true })
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.status === 0
            ? 'The campus server is not reachable. Check the connection and try again.'
            : requestError.message
          : 'Sign-in failed.',
      )
    } finally {
      setBusy(false)
    }
  }

  const filtered = (accounts ?? []).filter((account) => {
    if (variant === 'kiosk') return KIOSK_ROLES.includes(account.role as RoleKey)
    if (variant === 'desk') return DESK_ROLES.includes(account.role as RoleKey)
    return true
  })

  const form = (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}
    >
      <Field label={variant === 'kiosk' ? 'Operator Email' : 'Campus Email'} htmlFor="email">
        <TextInput
          id="email"
          value={email}
          onChange={setEmail}
          type="email"
          autoComplete="username"
          inputMode="email"
          placeholder={variant === 'kiosk' ? 'operator@campus.example' : 'you@campus.example'}
        />
      </Field>
      <Field label="Password" htmlFor="password">
        <div className="auth-pw">
          <TextInput
            id="password"
            value={password}
            onChange={setPassword}
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            placeholder="••••••••"
          />
          <button
            type="button"
            className="auth-pw-toggle"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            onClick={() => setShowPassword((current) => !current)}
          >
            {showPassword ? 'Hide' : 'Show'}
          </button>
        </div>
      </Field>
      {error ? (
        <div className="banner banner-error" role="alert">
          {error}
        </div>
      ) : null}
      <Button
        type="submit"
        variant="primary"
        size={variant === 'standard' ? 'lg' : 'xl'}
        block
        busy={busy || status === 'loading'}
        style={{ fontWeight: 800, letterSpacing: '0.02em', minHeight: 46 }}
      >
        {variant === 'kiosk'
          ? '⚡ Initialize Public Kiosk'
          : variant === 'desk'
          ? '⚡ Open Assisted Counter Desk'
          : 'Authenticate & Enter Station →'}
      </Button>
    </form>
  )

  // ---------------------------------------------------------------- KIOSK VARIANT
  if (variant === 'kiosk') {
    return (
      <KioskShell>
        <div className="stack" style={{ alignItems: 'center', width: '100%', maxWidth: 860, gap: 'var(--sp-4)' }}>
          <div className="landing-kicker">
            <span className="hero-kicker-beacon" aria-hidden="true" />
            <Badge tone="warn">STATION 06</Badge>
            <span className="mono tiny bold">[PUBLIC CORRIDOR KIOSK BOOTLOADER]</span>
          </div>

          <div style={{ textAlign: 'center' }}>
            <h1 className="kiosk-title" style={{ margin: '0 0 6px', textTransform: 'uppercase' }}>
              Corridor Kiosk Provisioning
            </h1>
            <p className="kiosk-hint" style={{ margin: 0, maxWidth: 600 }}>
              Operator authorization required to unlock and provision this shared corridor terminal.
              Once unlocked, the terminal enters public student self-service mode with automatic 90s idle wipe.
            </p>
          </div>

          <div className="kiosk-auth-frame">
            <div className="auth-station-tag">
              <span className="mono tiny bold" style={{ color: 'var(--signal)' }}>OPERATOR CREDENTIALS REQUIRED</span>
              <Badge tone="done">90S IDLE RESET ACTIVE</Badge>
            </div>
            <div style={{ marginTop: 'var(--sp-3)' }}>
              {form}
            </div>
          </div>

          {/* Quick Operator Fast-Pass */}
          <div style={{ width: '100%', maxWidth: 680 }}>
            <div className="section-title" style={{ textAlign: 'start', marginBottom: 8 }}>
              Quick Operator Provisioning — Tap to Initialize
            </div>
            <div className="kiosk-operator-grid">
              {filtered.map((account) => (
                <div
                  key={account.email}
                  className="kiosk-operator-tile"
                  onClick={() => void submit(account.email, account.password, 'kiosk')}
                >
                  <div className="row-between">
                    <span className="mono tiny bold" style={{ color: 'var(--signal)' }}>
                      {account.role.replaceAll('_', ' ')}
                    </span>
                    <Badge tone="open" className="tiny mono">OPERATOR</Badge>
                  </div>
                  <div className="bold small">{account.label}</div>
                  <code className="tiny muted">{account.email}</code>
                  <Button
                    size="sm"
                    variant="primary"
                    busy={busy}
                    style={{ marginTop: 4, width: '100%', justifyContent: 'center' }}
                  >
                    ⚡ Initialize as {account.role.split('_')[0]}
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {/* Security & Audit Directives */}
          <div className="kiosk-security-strip">
            <div className="kiosk-sec-card">
              <span className="mono tiny bold" style={{ color: 'var(--signal)' }}>01 · ZERO RESIDUAL CACHE</span>
              <span className="tiny muted">
                Students query tickets by roll number only. No personal passwords or persistent tokens remain on this terminal.
              </span>
            </div>
            <div className="kiosk-sec-card">
              <span className="mono tiny bold" style={{ color: 'var(--status-warn)' }}>02 · 90-SECOND IDLE PURGE</span>
              <span className="tiny muted">
                The terminal immediately scrubs local storage, resets all form inputs, and returns to the home screen if idle for 90s.
              </span>
            </div>
            <div className="kiosk-sec-card">
              <span className="mono tiny bold" style={{ color: 'var(--mint)' }}>03 · OFFLINE BUFFERING</span>
              <span className="tiny muted">
                During network blackouts, complaints are queued into local IndexedDB and issue a local verification hash.
              </span>
            </div>
          </div>

          <div className="row wrap center" style={{ gap: 12, marginTop: 12 }}>
            <VariantPicker active="kiosk" />
            <Link className="btn btn-ghost btn-sm" to="/">
              ← Back to Campus Portal
            </Link>
          </div>
        </div>
      </KioskShell>
    )
  }

  // ---------------------------------------------------------------- DESK VARIANT
  if (variant === 'desk') {
    return (
      <div className="desk-auth-shell animate-entrance">
        {/* Helpdesk Top Bar */}
        <div className="row-between wrap" style={{ gap: 12, marginBottom: 'var(--sp-4)' }}>
          <div className="row" style={{ alignItems: 'center', gap: 10 }}>
            <Link to="/" className="sidebar-brand" style={{ marginBottom: 0 }}>
              <span className="brand-mark" aria-hidden="true" data-monogram={institution.monogram} />
              <span className="brand-name">{institution.shortName}</span>
            </Link>
            <div
              className="status-pill hide-mobile"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '2px 8px',
                borderRadius: 'var(--radius-sm)',
                border: 'var(--border-w) solid var(--line)',
                background: 'var(--surface)',
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--mint)', display: 'inline-block' }} />
              <span className="mono tiny bold">SYS.ONLINE</span>
            </div>
          </div>
          <div className="row wrap" style={{ gap: 8, alignItems: 'center' }}>
            <VariantPicker active="desk" />
            <ThemeToggle />
          </div>
        </div>

        {/* Station Identification Plate */}
        <div className="desk-auth-header">
          <div>
            <div className="row wrap" style={{ gap: 8, alignItems: 'center', marginBottom: 6 }}>
              <Badge tone="warn">STATION 02</Badge>
              <span className="mono tiny bold">[ASSISTED WALK-UP HELPDESK]</span>
              <Badge tone="done">CHANNEL: ASSISTED_DESK</Badge>
            </div>
            <h1 style={{ margin: '0 0 6px', fontSize: 'clamp(1.6rem, 3vw, 2.4rem)', textTransform: 'uppercase', fontWeight: 900 }}>
              Helpdesk Operator Authentication
            </h1>
            <p className="desk-protocol-desc" style={{ maxWidth: 720 }}>
              This station files requests on behalf of students who lack smartphones or network connectivity.
              Every ticket filed records <strong>dual identity</strong> (student roll number + operating staff signature)
              in the immutable audit ledger.
            </p>
          </div>
          <div className="hide-mobile mono tiny muted" style={{ textAlign: 'right' }}>
            <div>GATEWAY: ENCRYPTED TLS</div>
            <div>STATION ID: DESK_01</div>
          </div>
        </div>

        {/* 2-Column Split: Form + Protocols */}
        <div className="desk-auth-grid">
          {/* Left: Operator Terminal Form */}
          <div className="stack" style={{ gap: 'var(--sp-4)' }}>
            <Card style={{ padding: 'var(--sp-5)' }}>
              <div className="auth-station-tag" style={{ marginBottom: 'var(--sp-3)' }}>
                <span className="mono tiny bold" style={{ color: 'var(--signal)' }}>OPERATOR SIGN-IN</span>
                <span className="mono tiny muted">STAFF ACCESS ONLY</span>
              </div>
              {form}
            </Card>

            {/* Quick Operator Fast-Pass */}
            <Card>
              <div className="row-between" style={{ marginBottom: 8 }}>
                <span className="bold small">Operator Fast-Pass</span>
                <span className="mono tiny muted">Pre-Seeded Roles</span>
              </div>
              <div className="stack" style={{ gap: 8 }}>
                {filtered.map((account) => (
                  <div key={account.email} className="row-between" style={{ background: 'var(--surface-alt)', padding: '8px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--line)' }}>
                    <div>
                      <div className="bold small">{account.role.replaceAll('_', ' ')}</div>
                      <div className="tiny muted">{account.label}</div>
                    </div>
                    <Button
                      size="sm"
                      variant="primary"
                      busy={busy}
                      onClick={() => void submit(account.email, account.password, 'desk')}
                    >
                      ⚡ Open Desk
                    </Button>
                  </div>
                ))}
              </div>
              <div className="mono tiny muted" style={{ marginTop: 8 }}>
                Universal password: <code className="bold">Campus@2026</code>
              </div>
            </Card>
          </div>

          {/* Right: Operational Protocols & Governance */}
          <div className="desk-protocol-list">
            <div className="desk-protocol-card">
              <span className="desk-protocol-step">PROTOCOL 01 · IDENTITY LOOKUP</span>
              <h3 className="desk-protocol-title">Student Verification</h3>
              <p className="desk-protocol-desc">
                Search students by roll number or name. The desk checks active enrollment, branch, hostel block, and dues balance before filing.
              </p>
            </div>

            <div className="desk-protocol-card">
              <span className="desk-protocol-step">PROTOCOL 02 · VERBATIM CAPTURE</span>
              <h3 className="desk-protocol-title">Exact Words Preservation</h3>
              <p className="desk-protocol-desc">
                Record the student's exact spoken words rather than bureaucratic phrasing. The AI triage agent automatically categorizes urgency and priority.
              </p>
            </div>

            <div className="desk-protocol-card">
              <span className="desk-protocol-step">PROTOCOL 03 · DUAL IDENTITY LOGGING</span>
              <h3 className="desk-protocol-title">Auditable Accountability</h3>
              <p className="desk-protocol-desc">
                Cases store both the student identity and your authenticated operator signature under the <code>ASSISTED_DESK</code> channel for full compliance.
              </p>
            </div>

            <div className="desk-protocol-card">
              <span className="desk-protocol-step">PROTOCOL 04 · RECEIPT ISSUANCE</span>
              <h3 className="desk-protocol-title">Receipt Tracking Key</h3>
              <p className="desk-protocol-desc">
                Hand over the generated Case Reference Number or print the formal receipt for the student to monitor progress via SMS or corridor kiosk.
              </p>
            </div>

            <p className="tiny muted" style={{ margin: '4px 0 0' }}>
              <Link to="/">← Back to Campus Portal</Link>
            </p>
          </div>
        </div>
      </div>
    )
  }

  // ---------------------------------------------------------------- STANDARD VARIANT
  return (
    <div className="auth animate-entrance">
      {/* Left Column: Brand & Architecture Feature Plates */}
      <section className="auth-brand">
        <Link to="/" className="sidebar-brand" style={{ marginBottom: 0, width: 'fit-content' }}>
          <span className="brand-mark" aria-hidden="true" data-monogram={institution.monogram} />
          <span className="brand-name">{institution.shortName}</span>
        </Link>

        <div className="auth-brand-inner">
          <div className="row wrap" style={{ gap: 8, alignItems: 'center' }}>
            <Badge tone="warn">BPUT Hackathon 2026</Badge>
            <Badge tone="open">PS07 · Fretbox</Badge>
          </div>

          <h1 className="auth-title">
            Station Access Layer.
            <span className="auth-accent">Zero Compromise Operations.</span>
          </h1>

          <p className="auth-lede">
            One auditable operating mesh behind hostel repairs, cryptographic passes, leave verifications, and urgent administrative alerts.
          </p>

          <ul className="auth-points">
            {AUTH_POINTS.map((point) => (
              <li className="auth-point" key={point.title}>
                <span className="auth-point-icon" aria-hidden="true">
                  {point.icon}
                </span>
                <span>
                  <b>{point.title}</b>
                  <span>{point.body}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="row-between wrap" style={{ borderTop: '1px solid var(--line)', paddingTop: 12 }}>
          <span className="mono tiny muted">BUILD: 2026.09 · PS07 · ZERO-KNOWLEDGE LEDGER</span>
          <span className="mono tiny bold" style={{ color: 'var(--mint)' }}>SYS.ONLINE</span>
        </div>
      </section>

      {/* Right Column: Station Switcher & Authentication Form */}
      <section className="auth-side">
        <div className="auth-side-top">
          <VariantPicker active="standard" />
          <ThemeToggle />
        </div>

        <div className="auth-card">
          <div className="auth-station-tag">
            <span className="mono tiny bold" style={{ color: 'var(--signal)' }}>STATION 01 · PERSONAL ACCESS GATEWAY</span>
            <Badge tone="done">8 ROLES ACTIVE</Badge>
          </div>

          <div>
            <h2 className="section-title" style={{ margin: '0 0 4px', fontSize: 'var(--fs-xl)' }}>
              Sign In to Station
            </h2>
            <p className="page-sub" style={{ margin: 0, fontSize: 'var(--fs-sm)' }}>
              Enter your campus email to decrypt your tailored role workspace.
            </p>
          </div>

          {form}

          <div className="auth-or">or choose a fast-pass role</div>

          {/* Categorized Personas Fast-Pass Grid */}
          <div className="auth-fastpass-section">
            <div className="auth-fastpass-header">
              <span className="bold small">Seeded Demo Personas</span>
              <span className="mono tiny muted">One-Tap Sign In</span>
            </div>

            <div className="auth-fastpass-grid">
              {(accounts ?? []).map((account) => {
                const conf = PERSONAS_CONFIG[account.role] ?? {
                  label: account.role.replaceAll('_', ' '),
                  tone: 'open' as const,
                  desc: account.label,
                }
                return (
                  <div key={account.email} className="auth-fastpass-card">
                    <div className="auth-fastpass-top">
                      <span className="auth-fastpass-role">{conf.label}</span>
                      <Badge tone={conf.tone} className="tiny mono">
                        {account.role.split('_')[0]}
                      </Badge>
                    </div>
                    <div className="auth-fastpass-sub">{conf.desc}</div>
                    <code className="tiny muted">{account.email}</code>
                    <Button
                      size="sm"
                      variant="primary"
                      className="auth-fastpass-btn"
                      busy={busy}
                      onClick={() => void submit(account.email, account.password, 'personal')}
                    >
                      ⚡ Launch Role →
                    </Button>
                  </div>
                )
              })}
            </div>

            <div
              style={{
                marginTop: 6,
                padding: '6px 10px',
                background: 'var(--surface-alt)',
                border: '1px solid var(--line)',
                borderRadius: 'var(--radius-sm)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span className="tiny muted">Universal demo password:</span>
              <code className="bold tiny mono">Campus@2026</code>
            </div>
          </div>

          <p className="small muted" style={{ margin: 'var(--sp-2) 0 0', textAlign: 'center' }}>
            <Link to="/">← Back to Campus Portal</Link>
          </p>
        </div>
      </section>
    </div>
  )
}

/** Mechanical Sign-In Station Switcher */
function VariantPicker({ active }: { active: 'standard' | 'kiosk' | 'desk' }) {
  return (
    <div className="station-switcher" role="group" aria-label="Select Station Mode">
      <Link
        className={`station-switch-btn ${active === 'standard' ? 'is-active' : ''}`}
        to="/login"
        aria-current={active === 'standard' ? 'page' : undefined}
      >
        <span className="station-switch-indicator" />
        <span className="station-switch-text">01 · Personal</span>
      </Link>
      <Link
        className={`station-switch-btn ${active === 'desk' ? 'is-active' : ''}`}
        to="/login?mode=desk"
        aria-current={active === 'desk' ? 'page' : undefined}
      >
        <span className="station-switch-indicator" />
        <span className="station-switch-text">02 · Helpdesk</span>
      </Link>
      <Link
        className={`station-switch-btn ${active === 'kiosk' ? 'is-active' : ''}`}
        to="/login?mode=kiosk"
        aria-current={active === 'kiosk' ? 'page' : undefined}
      >
        <span className="station-switch-indicator" />
        <span className="station-switch-text">06 · Kiosk</span>
      </Link>
    </div>
  )
}

function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  return (
    <div className="switcher" role="group" aria-label="Theme">
      {THEME_OPTIONS.map((option) => (
        <button
          key={option.id}
          type="button"
          className="symbol"
          aria-pressed={theme === option.id}
          aria-label={option.hint}
          title={option.hint}
          onClick={() => setTheme(option.id)}
        >
          <span aria-hidden="true">{option.symbol}</span>
        </button>
      ))}
    </div>
  )
}
