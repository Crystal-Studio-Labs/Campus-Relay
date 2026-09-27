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
import { Badge, Button, Card, Field, KV, TextInput } from '../components/ui'
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

/** Three claims the product can actually keep, stated on the front door. */
const AUTH_POINTS = [
  {
    icon: '☁',
    title: 'Works with no signal',
    body: 'A request is written to the device first and syncs itself - it is never lost to a dead zone.',
  },
  {
    icon: '✓',
    title: 'Every step is proven',
    body: 'Who acted, when and from which channel, in an append-only trail rather than a claim.',
  },
  {
    icon: '◫',
    title: 'A station for everyone',
    body: 'Phone, helpdesk desk or a shared kiosk for students without a working device.',
  },
]

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
  const [showDemo, setShowDemo] = useState(variant !== 'standard')
  const [showPassword, setShowPassword] = useState(false)

  useEffect(() => {
    if (variant !== 'standard') setShowDemo(true)
  }, [variant])

  useEffect(() => {
    if (!showDemo || accounts) return
    void api
      .get<{ accounts: DemoAccount[] }>('/auth/demo-accounts')
      .then((response) => setAccounts(response.accounts))
      .catch(() => setAccounts([]))
  }, [showDemo, accounts])

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
    >
      <Field label={variant === 'kiosk' ? 'Operator email' : 'Campus email'} htmlFor="email">
        <TextInput
          id="email"
          value={email}
          onChange={setEmail}
          type="email"
          autoComplete="username"
          inputMode="email"
          placeholder="you@campus.example"
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
        <div className="banner banner-error" role="alert" style={{ marginBottom: 12 }}>
          {error}
        </div>
      ) : null}
      <Button
        type="submit"
        variant="primary"
        size={variant === 'standard' ? 'lg' : 'xl'}
        block
        busy={busy || status === 'loading'}
      >
        {variant === 'kiosk' ? 'Start kiosk session' : variant === 'desk' ? 'Open the desk' : 'Sign in'}
      </Button>
    </form>
  )

  // ---------------------------------------------------------------- kiosk
  if (variant === 'kiosk') {
    return (
      <KioskShell>
        <div className="kiosk-title">Kiosk sign-in</div>
        <div className="kiosk-hint">
          For the operator who looks after this tablet. Students never see this screen.
        </div>
        <Card style={{ width: '100%', maxWidth: 640, textAlign: 'start' }}>
          {form}
        </Card>
        <div style={{ width: '100%', maxWidth: 900 }}>
          <div className="section-title" style={{ textAlign: 'start' }}>
            Demo operator accounts — tap to start
          </div>
          <div className="kiosk-actions">
            {filtered.map((account) => (
              <Button
                key={account.email}
                variant="info"
                className="kiosk-tile"
                busy={busy}
                onClick={() => void submit(account.email, account.password, 'kiosk')}
              >
                <span style={{ fontSize: 34 }} aria-hidden="true">
                  ▢
                </span>
                <span>{account.role.replaceAll('_', ' ')}</span>
                <span className="tiny" style={{ fontWeight: 600 }}>
                  {account.label}
                </span>
              </Button>
            ))}
          </div>
        </div>
        <p className="tiny muted" style={{ maxWidth: 720 }}>
          This station is remembered on the device: after a reboot it comes back as a kiosk, not as the operator's
          personal session. The idle reset clears the screen after 90 seconds.
        </p>
        <Link className="btn btn-ghost" to="/">
          ← Back to the campus portal
        </Link>
      </KioskShell>
    )
  }

  // ---------------------------------------------------------------- desk
  if (variant === 'desk') {
    return (
      <div className="page" style={{ maxWidth: 1040, paddingTop: 28 }}>
        <div className="stack-lg">
          <div className="page-head">
            <div>
              <h1>Helpdesk sign-in</h1>
              <p className="page-sub">
                This station files requests <strong>on behalf of students</strong>. Every case records both names and
                the channel (ASSISTED_DESK), so assisted access is visible in the analytics.
              </p>
            </div>
            <div className="page-head-actions">
              <VariantPicker active="desk" />
            </div>
          </div>

          <div className="split">
            <Card>{form}</Card>
            <div className="stack">
              <Card>
                <div className="section-title">Tap a demo desk account</div>
                <div className="stack" style={{ gap: 8 }}>
                  {filtered.map((account) => (
                    <Button
                      key={account.email}
                      variant="info"
                      block
                      busy={busy}
                      onClick={() => void submit(account.email, account.password, 'desk')}
                    >
                      {account.role.replaceAll('_', ' ')} — {account.label}
                    </Button>
                  ))}
                </div>
              </Card>
              <Card className="card-flat">
                <div className="section-title">Before you file</div>
                <ul className="small">
                  <li>Search by roll number, name or registration number.</li>
                  <li>Write what the student tells you, in their words — not in form language.</li>
                  <li>Hand over the case number on the receipt, or print it.</li>
                  <li>Dues blocks on certificates are checked automatically; the case will say which rule stopped it.</li>
                </ul>
              </Card>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ------------------------------------------------------------ standard
  // A composed front door: what the product is on one side, the one action the
  // person came to take on the other.
  return (
    <div className="auth">
      <section className="auth-brand">
        <Link to="/" className="sidebar-brand" style={{ marginBottom: 0, width: 'fit-content' }}>
          <span className="brand-mark" aria-hidden="true" data-monogram={institution.monogram} />
          <span className="brand-name">{institution.shortName}</span>
        </Link>

        <div className="auth-brand-inner">
          <span className="auth-eyebrow">
            <span aria-hidden="true">●</span> {institution.config.identity.name}
          </span>
          <h1 className="auth-title">{institution.config.identity.tagline}</h1>
          <p className="auth-lede">
            One case engine behind hostel repairs, certificates, leave passes and notices - built to keep
            working when the network does not.
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

        <p className="tiny muted">Demo campus · seeded data, labelled as such.</p>
      </section>

      <section className="auth-side">
        <div className="auth-side-top">
          <VariantPicker active="standard" />
          <ThemeToggle />
        </div>

        <div className="auth-card">
          <div>
            <h2 className="section-title" style={{ marginBottom: 4 }}>
              Sign in
            </h2>
            <p className="page-sub" style={{ marginTop: 0 }}>
              Use your campus email. Students, staff and administrators all sign in here.
            </p>
          </div>

          {form}

          <div className="auth-or">or explore the demo</div>

          <Card>
            <div className="row-between" style={{ gap: 8, marginBottom: 8 }}>
              <div className="section-title" style={{ marginBottom: 0 }}>
                Demo accounts
              </div>
              {showDemo ? <Badge tone="warn">Not real user records</Badge> : null}
            </div>
            <p className="small muted">
              Seeded accounts with a fixed password - every role gets a different product.
            </p>
            {showDemo ? null : (
              <Button variant="ghost" block onClick={() => setShowDemo(true)}>
                Show demo accounts
              </Button>
            )}
            {showDemo ? (
              <>
                <div className="stack" style={{ gap: 8, marginTop: 10 }}>
                  {accounts === null ? (
                    <p className="small muted">Loading…</p>
                  ) : accounts.length === 0 ? (
                    <p className="small muted">Demo accounts are not published on this deployment.</p>
                  ) : (
                    accounts.map((account) => (
                      <div key={account.email} className="demo-account">
                        <div>
                          <div className="bold">{account.role.replaceAll('_', ' ')}</div>
                          <div className="tiny muted">{account.label}</div>
                        </div>
                        <Button
                          size="sm"
                          variant="info"
                          busy={busy}
                          onClick={() => void submit(account.email, account.password, 'personal')}
                        >
                          Sign in
                        </Button>
                      </div>
                    ))
                  )}
                </div>
                {accounts?.length ? (
                  <KV
                    items={[
                      { label: 'Password', value: <span className="mono">Campus@2026 (all accounts)</span> },
                    ]}
                  />
                ) : null}
              </>
            ) : null}
          </Card>

          <p className="small muted">
            <Link to="/">← Back to the campus portal</Link>
          </p>
        </div>
      </section>
    </div>
  )
}

/** Sign-in stations this device can be. */
function VariantPicker({ active }: { active: 'standard' | 'kiosk' | 'desk' }) {
  return (
    <div className="switcher" role="group" aria-label="Sign-in station">
      <Link
        className="btn btn-ghost btn-sm"
        to="/login"
        aria-current={active === 'standard' ? 'page' : undefined}
        style={active === 'standard' ? { background: 'var(--ink)', color: 'var(--paper)' } : undefined}
      >
        Personal
      </Link>
      <Link
        className="btn btn-ghost btn-sm"
        to="/login?mode=desk"
        style={active === 'desk' ? { background: 'var(--ink)', color: 'var(--paper)' } : undefined}
      >
        Helpdesk
      </Link>
      <Link
        className="btn btn-ghost btn-sm"
        to="/login?mode=kiosk"
        style={active === 'kiosk' ? { background: 'var(--ink)', color: 'var(--paper)' } : undefined}
      >
        Kiosk
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
