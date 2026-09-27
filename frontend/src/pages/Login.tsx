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
import { Badge, Button, Field, TextInput } from '../components/ui'
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

/** Three architectural guarantees verified by the system for Personal Sign-in */
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

/** Helpdesk operational protocols */
const DESK_POINTS = [
  {
    icon: <IconShieldCheck />,
    title: 'Protocol 01 · Identity Verification',
    body: 'Instant lookup of student enrollment, branch, hostel block, and room. Eliminates identity delays for walk-in students without devices.',
  },
  {
    icon: <IconWifiOff />,
    title: 'Protocol 02 · Dual-Identity Cryptographic Ledger',
    body: 'Cases record both the student identity and your operator signature under the ASSISTED_DESK channel for complete auditable compliance.',
  },
  {
    icon: <IconStations />,
    title: 'Protocol 03 · Verbatim Intake & Printed Receipts',
    body: 'Preserves the student’s exact spoken words while the AI engine triages SLA and priority. Issue immediate physical reference slips.',
  },
]

/** Kiosk corridor bootloader security directives */
const KIOSK_POINTS = [
  {
    icon: <IconShieldCheck />,
    title: 'Directive 01 · Zero Residual Storage',
    body: 'Students interact via roll number only. No personal passwords, tokens, or private credentials are ever stored on this terminal.',
  },
  {
    icon: <IconWifiOff />,
    title: 'Directive 02 · 90-Second Inactivity Scrub',
    body: 'Automatic idle countdown actively scrubs local state, resets all form entries, and returns to the home screen after 90 seconds.',
  },
  {
    icon: <IconStations />,
    title: 'Directive 03 · Mesh Outbox Buffering',
    body: 'During campus network drops, grievances buffer locally in IndexedDB with UUIDv4 idempotency keys and synchronize upon reconnection.',
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
  SUPER_ADMIN: {
    label: 'Super Admin',
    tone: 'urgent',
    desc: 'Global System Administrator',
  },
  DEPARTMENT_HEAD: {
    label: 'Department Head',
    tone: 'open',
    desc: 'Academic & Facility Oversight',
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
  const [showDemoModal, setShowDemoModal] = useState(false)
  const [autoFilledRole, setAutoFilledRole] = useState<string | null>(null)

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

  const handleFillAccount = (account: DemoAccount) => {
    setEmail(account.email)
    setPassword(account.password)
    setAutoFilledRole(account.label)
  }

  const handleModalLaunch = (account: DemoAccount) => {
    setEmail(account.email)
    setPassword(account.password)
    setAutoFilledRole(account.label)
    setShowDemoModal(false)
    void submit(account.email, account.password)
  }

  const form = (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}
    >
      <Field label={variant === 'kiosk' ? 'Operator Email' : variant === 'desk' ? 'Desk Operator Email' : 'Campus Email'} htmlFor="email">
        <TextInput
          id="email"
          value={email}
          onChange={(val) => {
            setEmail(val)
            if (autoFilledRole) setAutoFilledRole(null)
          }}
          type="email"
          autoComplete="username"
          inputMode="email"
          placeholder={variant === 'kiosk' ? 'operator@campus.example' : variant === 'desk' ? 'desk@campus.example' : 'you@campus.example'}
        />
      </Field>
      <Field label="Password" htmlFor="password">
        <div className="auth-pw">
          <TextInput
            id="password"
            value={password}
            onChange={(val) => {
              setPassword(val)
              if (autoFilledRole) setAutoFilledRole(null)
            }}
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
          ? '⚡ Initialize Public Kiosk →'
          : variant === 'desk'
          ? '⚡ Open Assisted Counter Desk →'
          : 'Authenticate & Enter Station →'}
      </Button>
    </form>
  )

  // ---------------------------------------------------------------- KIOSK VARIANT (Station 06)
  if (variant === 'kiosk') {
    return (
      <div className="auth animate-entrance">
        {/* Left Column: Brand & Security Directives */}
        <section className="auth-brand">
          <Link to="/" className="sidebar-brand" style={{ marginBottom: 0, width: 'fit-content' }}>
            <span className="brand-mark" aria-hidden="true" data-monogram={institution.monogram} />
            <span className="brand-name">{institution.shortName}</span>
          </Link>

          <div className="auth-brand-inner">
            <div className="row wrap" style={{ gap: 8, alignItems: 'center' }}>
              <Badge tone="warn">STATION 06</Badge>
              <Badge tone="open">CORRIDOR KIOSK BOOTLOADER</Badge>
              <Badge tone="done">90S IDLE PURGE</Badge>
            </div>

            <h1 className="auth-title">
              Corridor Terminal Provisioning.
              <span className="auth-accent">Zero Residual Storage.</span>
            </h1>

            <p className="auth-lede">
              Operator authorization unlocks this terminal into public student self-service mode with automatic 90-second inactivity wipe and offline mesh buffering.
            </p>

            <ul className="auth-points">
              {KIOSK_POINTS.map((point) => (
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
            <span className="mono tiny muted">BUILD: 2026.09 · CORRIDOR TERMINAL v2</span>
            <span className="mono tiny bold" style={{ color: 'var(--mint)' }}>BOOTLOADER.READY</span>
          </div>
        </section>

        {/* Right Column: Station Switcher & Compact Auth Card */}
        <section className="auth-side">
          <div className="auth-side-top">
            <VariantPicker active="kiosk" />
            <ThemeToggle />
          </div>

          <div className="auth-card">
            <div className="auth-station-tag">
              <span className="mono tiny bold" style={{ color: 'var(--signal)' }}>OPERATOR CREDENTIALS REQUIRED</span>
              <Badge tone="done">90S IDLE PURGE ACTIVE</Badge>
            </div>

            <div>
              <h2 className="section-title" style={{ margin: '0 0 4px', fontSize: 'var(--fs-xl)' }}>
                Unlock Corridor Terminal
              </h2>
              <p className="page-sub" style={{ margin: 0, fontSize: 'var(--fs-sm)' }}>
                Operator credentials required to initialize student self-service kiosk.
              </p>
            </div>

            {form}

            <div className="auth-or">or choose operator role</div>

            <RoleQuickStrip
              accounts={filtered}
              currentEmail={email}
              autoFilledRole={autoFilledRole}
              onFill={handleFillAccount}
              onOpenModal={() => setShowDemoModal(true)}
              onLaunch={() => void submit()}
              busy={busy}
              title="Operator Fast-Pass"
            />

            <p className="small muted" style={{ margin: 'var(--sp-2) 0 0', textAlign: 'center' }}>
              <Link to="/">← Back to Campus Portal</Link>
            </p>
          </div>
        </section>

        <DemoAccountsModal
          isOpen={showDemoModal}
          onClose={() => setShowDemoModal(false)}
          accounts={filtered}
          onSelect={handleModalLaunch}
          busy={busy}
          title="Kiosk Operator Personas"
        />
      </div>
    )
  }

  // ---------------------------------------------------------------- DESK VARIANT (Station 02)
  if (variant === 'desk') {
    return (
      <div className="auth animate-entrance">
        {/* Left Column: Brand & Operational Protocols */}
        <section className="auth-brand">
          <Link to="/" className="sidebar-brand" style={{ marginBottom: 0, width: 'fit-content' }}>
            <span className="brand-mark" aria-hidden="true" data-monogram={institution.monogram} />
            <span className="brand-name">{institution.shortName}</span>
          </Link>

          <div className="auth-brand-inner">
            <div className="row wrap" style={{ gap: 8, alignItems: 'center' }}>
              <Badge tone="warn">STATION 02</Badge>
              <Badge tone="open">ASSISTED WALK-UP COUNTER</Badge>
              <Badge tone="done">CHANNEL: ASSISTED_DESK</Badge>
            </div>

            <h1 className="auth-title">
              Assisted Walk-Up Intake.
              <span className="auth-accent">Dual-Identity Protocol.</span>
            </h1>

            <p className="auth-lede">
              Operated station filing complaints and verified requests on behalf of walk-up students, offline campus members, and visitors without smartphones.
            </p>

            <ul className="auth-points">
              {DESK_POINTS.map((point) => (
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
            <span className="mono tiny muted">BUILD: 2026.09 · DUAL-IDENTITY ASSISTED INTAKE</span>
            <span className="mono tiny bold" style={{ color: 'var(--mint)' }}>GATEWAY: ENCRYPTED TLS</span>
          </div>
        </section>

        {/* Right Column: Station Switcher & Compact Auth Card */}
        <section className="auth-side">
          <div className="auth-side-top">
            <VariantPicker active="desk" />
            <ThemeToggle />
          </div>

          <div className="auth-card">
            <div className="auth-station-tag">
              <span className="mono tiny bold" style={{ color: 'var(--signal)' }}>STATION 02 · OPERATOR AUTHENTICATION</span>
              <Badge tone="warn">STAFF ACCESS ONLY</Badge>
            </div>

            <div>
              <h2 className="section-title" style={{ margin: '0 0 4px', fontSize: 'var(--fs-xl)' }}>
                Helpdesk Operator Sign In
              </h2>
              <p className="page-sub" style={{ margin: 0, fontSize: 'var(--fs-sm)' }}>
                Authenticate as an authorized desk clerk or hostel warden to open the assisted counter.
              </p>
            </div>

            {form}

            <div className="auth-or">or choose operator role</div>

            <RoleQuickStrip
              accounts={filtered}
              currentEmail={email}
              autoFilledRole={autoFilledRole}
              onFill={handleFillAccount}
              onOpenModal={() => setShowDemoModal(true)}
              onLaunch={() => void submit()}
              busy={busy}
              title="Helpdesk Operator Fast-Pass"
            />

            <p className="small muted" style={{ margin: 'var(--sp-2) 0 0', textAlign: 'center' }}>
              <Link to="/">← Back to Campus Portal</Link>
            </p>
          </div>
        </section>

        <DemoAccountsModal
          isOpen={showDemoModal}
          onClose={() => setShowDemoModal(false)}
          accounts={filtered}
          onSelect={handleModalLaunch}
          busy={busy}
          title="Helpdesk Operator Personas"
        />
      </div>
    )
  }

  // ---------------------------------------------------------------- STANDARD VARIANT (Station 01)
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

      {/* Right Column: Station Switcher & Compact Authentication Card */}
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

          {/* Compact Demo Roles Quick-Fill Strip */}
          <RoleQuickStrip
            accounts={filtered}
            currentEmail={email}
            autoFilledRole={autoFilledRole}
            onFill={handleFillAccount}
            onOpenModal={() => setShowDemoModal(true)}
            onLaunch={() => void submit()}
            busy={busy}
            title="Seeded Demo Personas"
          />

          <p className="small muted" style={{ margin: 'var(--sp-2) 0 0', textAlign: 'center' }}>
            <Link to="/">← Back to Campus Portal</Link>
          </p>
        </div>
      </section>

      {/* Floating Demo Accounts Ledger Modal — Never inflates the signin card! */}
      <DemoAccountsModal
        isOpen={showDemoModal}
        onClose={() => setShowDemoModal(false)}
        accounts={filtered}
        onSelect={handleModalLaunch}
        busy={busy}
        title="Campus Relay · Demo Accounts Ledger"
      />
    </div>
  )
}

/** Compact 1-Row Role Quick Strip with autofill feedback */
function RoleQuickStrip({
  accounts,
  currentEmail,
  autoFilledRole,
  onFill,
  onOpenModal,
  onLaunch,
  busy,
  title = 'Quick Role Fill',
}: {
  accounts: DemoAccount[]
  currentEmail: string
  autoFilledRole: string | null
  onFill: (account: DemoAccount) => void
  onOpenModal: () => void
  onLaunch: () => void
  busy: boolean
  title?: string
}) {
  return (
    <div className="auth-role-strip-wrap">
      <div className="auth-role-header">
        <span className="bold tiny mono" style={{ textTransform: 'uppercase', color: 'var(--muted-ink)' }}>
          {title}
        </span>
        <button
          type="button"
          className="btn btn-ghost btn-sm tiny mono bold"
          onClick={onOpenModal}
          style={{ padding: '2px 8px', height: 'auto', textDecoration: 'underline' }}
        >
          Browse All ({accounts.length}) ↗
        </button>
      </div>

      <div className="auth-role-pills" role="toolbar" aria-label="Demo role selector">
        {accounts.slice(0, 6).map((account) => {
          const isSelected = currentEmail.toLowerCase() === account.email.toLowerCase()
          const conf = PERSONAS_CONFIG[account.role]
          const label = conf?.label.split(' ')[0] ?? account.role.split('_')[0]
          return (
            <button
              key={account.email}
              type="button"
              className={`auth-role-pill ${isSelected ? 'is-active' : ''}`}
              onClick={() => onFill(account)}
              title={`${account.label} (${account.email})`}
            >
              <span className="pill-dot" />
              <span>{label}</span>
            </button>
          )
        })}
      </div>

      {autoFilledRole && (
        <div className="auth-autofill-banner">
          <div className="row" style={{ alignItems: 'center', gap: 6, minWidth: 0, overflow: 'hidden' }}>
            <span className="mono tiny bold" style={{ color: 'var(--signal)' }}>✓ LOADED:</span>
            <span className="tiny bold text-truncate" style={{ maxWidth: 210 }}>{autoFilledRole}</span>
          </div>
          <Button
            size="sm"
            variant="primary"
            busy={busy}
            style={{ padding: '2px 8px', height: 26, minHeight: 26, fontSize: 11 }}
            onClick={onLaunch}
          >
            ⚡ Launch
          </Button>
        </div>
      )}

      <div
        style={{
          marginTop: 2,
          padding: '4px 8px',
          background: 'var(--surface-alt)',
          border: '1px solid var(--line)',
          borderRadius: 'var(--radius-sm)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span className="tiny muted">Demo password:</span>
        <code className="bold tiny mono">Campus@2026</code>
      </div>
    </div>
  )
}

/** Floating Modal Dialog for browsing all demo accounts without inflating card geometry */
function DemoAccountsModal({
  isOpen,
  onClose,
  accounts,
  onSelect,
  busy,
  title,
}: {
  isOpen: boolean
  onClose: () => void
  accounts: DemoAccount[]
  onSelect: (account: DemoAccount) => void
  busy: boolean
  title?: string
}) {
  if (!isOpen) return null
  return (
    <div
      className="modal-backdrop animate-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="demo-accounts-title"
    >
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 740, maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}
      >
        <div className="row-between" style={{ borderBottom: '1px solid var(--line)', paddingBottom: 'var(--sp-3)' }}>
          <div>
            <div className="row wrap" style={{ gap: 8, alignItems: 'center' }}>
              <Badge tone="warn">PRE-SEEDED DEMO PERSONAS</Badge>
              <span className="mono tiny muted">ONE-TAP SWITCH</span>
            </div>
            <h2 id="demo-accounts-title" className="section-title" style={{ margin: '4px 0 0', fontSize: 'var(--fs-lg)' }}>
              {title ?? 'Select a Pre-Seeded Persona'}
            </h2>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={onClose}
            aria-label="Close dialog"
            style={{ fontSize: '1.2rem', lineHeight: 1 }}
          >
            ✕
          </button>
        </div>

        <div style={{ overflowY: 'auto', padding: 'var(--sp-3) 0', flex: 1 }}>
          <p className="small muted" style={{ margin: '0 0 var(--sp-3)' }}>
            Tap any persona to immediately fill credentials and launch that station workspace. Universal password:{' '}
            <code className="bold mono">Campus@2026</code>
          </p>

          <div className="auth-demo-modal-grid">
            {accounts.map((account) => {
              const conf = PERSONAS_CONFIG[account.role] ?? {
                label: account.role.replaceAll('_', ' '),
                tone: 'open' as const,
                desc: account.label,
              }
              return (
                <div key={account.email} className="auth-demo-modal-card">
                  <div className="row-between">
                    <span className="mono tiny bold" style={{ color: 'var(--signal)' }}>
                      {conf.label}
                    </span>
                    <Badge tone={conf.tone} className="tiny mono">
                      {account.role.split('_')[0]}
                    </Badge>
                  </div>
                  <div className="bold small">{account.label}</div>
                  <div className="tiny muted">{conf.desc}</div>
                  <code className="tiny muted" style={{ wordBreak: 'break-all' }}>{account.email}</code>
                  <Button
                    size="sm"
                    variant="primary"
                    busy={busy}
                    style={{ marginTop: 6, width: '100%', justifyContent: 'center' }}
                    onClick={() => onSelect(account)}
                  >
                    ⚡ Launch {account.role.split('_')[0]} →
                  </Button>
                </div>
              )
            })}
          </div>
        </div>

        <div className="row-between wrap" style={{ borderTop: '1px solid var(--line)', paddingTop: 'var(--sp-3)', gap: 8 }}>
          <span className="mono tiny muted">PS07 · INDUSTRIAL BRUTALISM AUTHENTICATION</span>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
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
