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
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ApiError, api, setDeviceMode, type DeviceMode } from '../lib/api'
import { useSession } from '../state/session'
import { useInstitution } from '../state/institution'
import { useTheme } from '../state/theme'
import { Badge, Button, Field, Select, TextInput } from '../components/ui'
import { Icon } from '../components/Icon'
import { THEME_OPTIONS } from '../state/theme'
import { useKioskSection } from '../lib/kioskSection'
import { usePageMeta } from '../lib/seo'
import type { Profile, RoleKey } from '../lib/types'

interface DemoAccount {
  role: string
  email: string
  password: string
  label: string
}

const KIOSK_ROLES: RoleKey[] = ['MANAGEMENT']
const DESK_ROLES: RoleKey[] = ['MANAGEMENT']

/** Shown when a personal account is offered to a shared station sign-in. */
const STATION_LOCKOUT_MESSAGE =
  'SECURITY LOCKOUT: a kiosk terminal can only be authorised by the management role. Personal student and teacher accounts cannot hijack or run a shared public kiosk.'










const PERSONAS_CONFIG: Record<string, { label: string; tone: 'open' | 'warn' | 'done' | 'urgent'; desc: string }> = {
  STUDENT: {
    label: 'Student',
    tone: 'open',
    desc: 'Attendance, marks, timetable, fees',
  },
  TEACHER: {
    label: 'Teacher',
    tone: 'warn',
    desc: 'Classes, attendance, marks, leave',
  },
  MANAGEMENT: {
    label: 'Management',
    tone: 'urgent',
    desc: 'Hostels, fees, certificates, approvals, the gate',
  },
}

/** Where each role wakes up. The login "type" decides the landing experience. */
export function landingFor(profile: Profile, mode: DeviceMode): string {
  if (mode === 'kiosk') return '/kiosk'
  if (mode === 'desk') return '/helpdesk'
  switch (profile.role) {
    case 'MANAGEMENT':
      return '/operations'
    case 'TEACHER':
      return '/tasks'
    case 'STUDENT':
    default:
      return '/'
  }
}

export function LoginPage({ variant = 'standard' }: { variant?: 'standard' | 'kiosk' | 'desk' }) {
  usePageMeta({
    title: variant === 'kiosk' ? 'Kiosk Operator Sign In' : variant === 'desk' ? 'Helpdesk Staff Sign In' : 'Sign In',
    description: 'Secure sign-in for students, teachers, and administrators.',
  })
  const { login, logoutInPlace, status, profile } = useSession()
  const institution = useInstitution()
  const navigate = useNavigate()
  const { section, setSection, allSections } = useKioskSection()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [accounts, setAccounts] = useState<DemoAccount[] | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [autoFilledRole, setAutoFilledRole] = useState<string | null>(null)
  // Station setup (helpdesk / kiosk) is an administrator choice. It is shown
  // only when the URL asks for it explicitly (?setup=1), so the ordinary
  // sign-in screen carries no jargon a student has to decode.
  const [params] = useSearchParams()
  const stationSetup = params.get('setup') === '1'

  useEffect(() => {
    void api
      .get<{ accounts: DemoAccount[] }>('/auth/demo-accounts')
      .then((response) => setAccounts(response.accounts))
      .catch(() => setAccounts([]))
  }, [])

  // A shared kiosk must never carry somebody's personal session. If a
  // signed-in student or teacher reaches the kiosk sign-in, clear that session
  // in place and say why, rather than leaving them staring at a form while
  // "signed in". Clearing in place keeps this screen mounted, so the notice
  // stays visible instead of being unmounted by a redirect (the loop).
  useEffect(() => {
    if (variant !== 'kiosk') return
    if (status !== 'authenticated' || !profile) return
    if (KIOSK_ROLES.includes(profile.role as RoleKey)) return
    logoutInPlace()
    setError(STATION_LOCKOUT_MESSAGE)
  }, [variant, status, profile, logoutInPlace])

  const submit = async (nextEmail = email, nextPassword = password, mode?: DeviceMode) => {
    setBusy(true)
    setError(null)
    // The station is what the *variant* says, never the device's remembered
    // mode. A personal sign-in at /login on a tablet that was once a kiosk must
    // not be judged as a kiosk sign-in: that rejected the account, signed it
    // straight back out, and landed on this same screen with the reason erased
    // by the redirect - the sign-in loop. Only the kiosk/desk variants commit a
    // station, and only they enforce that station's allow-list. Signing in
    // personally also makes the device personal again, so a retired station is
    // not permanently trapped in kiosk mode.
    const station: DeviceMode =
      mode ?? (variant === 'kiosk' ? 'kiosk' : variant === 'desk' ? 'desk' : 'personal')
    setDeviceMode(station)
    try {
      const signedIn = await login(nextEmail, nextPassword)
      const stationRoles = station === 'kiosk' ? KIOSK_ROLES : station === 'desk' ? DESK_ROLES : null
      if (stationRoles && !stationRoles.includes(signedIn.role as RoleKey)) {
        // Keep this screen mounted so the refusal is actually readable, and let
        // the operator retry with a management account.
        logoutInPlace()
        setError(STATION_LOCKOUT_MESSAGE)
        return
      }
      navigate(landingFor(signedIn, station), { replace: true })
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
        {variant === 'kiosk' ? 'Start kiosk →' : variant === 'desk' ? 'Open helpdesk →' : 'Sign in →'}
      </Button>
    </form>
  )

  // ---------------------------------------------------------------- KIOSK VARIANT (Station 06)
  if (variant === 'kiosk') {
    return (
      <div className="auth animate-entrance">
          <header className="auth-topbar">
            <AuthBrand />
            <span className="grow" />
            <Badge tone="warn">{section.stationName}</Badge>
            <ThemeToggle />
          </header>

        <section className="auth-side">
          {stationSetup ? (
            <div className="auth-side-top">
              <VariantPicker active="kiosk" />
            </div>
          ) : null}

          <div className="auth-card">
            <div className="auth-station-tag">
              <span className="mono tiny bold" style={{ color: 'var(--signal)' }}>ADMINISTRATOR SIGN IN</span>
              <Badge tone="done">RESETS AFTER 90 IDLE SECONDS</Badge>
            </div>

            <div>
              <h2 className="section-title" style={{ margin: '0 0 4px', fontSize: 'var(--fs-xl)' }}>
                Set up this kiosk
              </h2>
              <p className="page-sub" style={{ margin: 0, fontSize: 'var(--fs-sm)' }}>
                Shared kiosk for {section.sectionName} ({section.locationCode}). Sign in as an administrator.
              </p>
            </div>

            {/* Target Station Section Selector for Admins */}
            <div
              style={{
                background: 'var(--surface-sunken)',
                border: 'var(--border-w) solid var(--line)',
                borderRadius: 'var(--radius-sm)',
                padding: 'var(--sp-2) var(--sp-3)',
              }}
            >
              <div className="row between" style={{ alignItems: 'center', marginBottom: 4 }}>
            <span className="mono tiny bold" style={{ color: 'var(--signal)' }}>
              Kiosk area:
            </span>
                <span className="mono tiny muted">{section.locationCode}</span>
              </div>
              <Select
                value={section.id}
                onChange={(value) => {
                  const target = allSections.find((s) => s.id === value)
                  if (target) setSection(target)
                }}
                options={allSections.map((sec) => ({
                  value: sec.id,
                  label: `${sec.stationName} · ${sec.sectionName} (${sec.locationCode})`,
                }))}
              />
            </div>

            {form}

            <div className="auth-or">or pick a demo operator</div>

            <RoleQuickStrip
              accounts={filtered}
              currentEmail={email}
              autoFilledRole={autoFilledRole}
              onFill={handleFillAccount}
              onLaunch={() => void submit()}
              busy={busy}
              title="Demo operator accounts"
            />
          </div>
        </section>

      </div>
    )
  }

  // ---------------------------------------------------------------- DESK VARIANT (Station 02)
  if (variant === 'desk') {
    return (
      <div className="auth animate-entrance">
          <header className="auth-topbar">
            <AuthBrand />
            <span className="grow" />
            <Badge tone="warn">Assisted desk</Badge>
            <ThemeToggle />
          </header>

        <section className="auth-side">
          {stationSetup ? (
            <div className="auth-side-top">
              <VariantPicker active="desk" />
            </div>
          ) : null}

          <div className="auth-card">
            <div className="auth-station-tag">
              <span className="mono tiny bold" style={{ color: 'var(--signal)' }}>HELPDESK SIGN IN</span>
              <Badge tone="warn">STAFF ACCESS ONLY</Badge>
            </div>

            <div>
              <h2 className="section-title" style={{ margin: '0 0 4px', fontSize: 'var(--fs-xl)' }}>
                Helpdesk sign in
              </h2>
              <p className="page-sub" style={{ margin: 0, fontSize: 'var(--fs-sm)' }}>
                Sign in as an administrator to open the assisted counter.
              </p>
            </div>

            {form}

            <div className="auth-or">or pick a demo operator</div>

            <RoleQuickStrip
              accounts={filtered}
              currentEmail={email}
              autoFilledRole={autoFilledRole}
              onFill={handleFillAccount}
              onLaunch={() => void submit()}
              busy={busy}
              title="Demo operator accounts"
            />
          </div>
        </section>

      </div>
    )
  }

  // ---------------------------------------------------------------- STANDARD VARIANT (Station 01)
  const identity = institution.config.identity
  return (
    <div className="auth animate-entrance">
      <header className="auth-topbar">
        <AuthBrand />
        <span className="grow" />
        <ThemeToggle />
      </header>

      <section className="auth-side">
        {/* Who you are signing into, stated once, above the door. The crest
            comes from the institution configuration - the same logo the
            sidebar, the kiosk and the installed app carry. */}
        <div className="auth-hero">
          <span className="auth-crest" aria-hidden="true">
            {institution.config.appearance.crest_url ? (
              <img src={institution.config.appearance.crest_url} alt="" />
            ) : (
              <span className="brand-mark" data-monogram={institution.monogram} />
            )}
          </span>
          <h1>{identity.name}</h1>
          <p className="auth-hero-sub">
            {[identity.kind, identity.city].filter(Boolean).join(' · ')}
          </p>
          {identity.tagline ? <p className="auth-hero-tagline">{identity.tagline}</p> : null}
        </div>

        {/* Station setup is an administrator screen. It appears only when the
            URL asks for it (?setup=1), so the sign-in page a student meets is
            just a sign-in page. */}
        {stationSetup ? (
          <>
            <div className="auth-side-top">
              <VariantPicker active="standard" />
            </div>
            <p className="hint" style={{ marginBottom: 'var(--sp-4)' }}>
              Station setup is for administrators. Without <span className="ident">?setup=1</span> this device opens the
              ordinary sign-in.
            </p>
          </>
        ) : null}

        <div className="auth-card">
          <div className="auth-station-tag">
            <span className="mono tiny bold" style={{ color: 'var(--signal)' }}>
              SIGN IN
            </span>
            {accounts && accounts.length ? <Badge tone="done">{filtered.length} DEMO PERSONAS</Badge> : null}
          </div>

          <div>
            <h2 className="section-title" style={{ margin: '0 0 4px', fontSize: 'var(--fs-xl)' }}>
              Sign in
            </h2>
            <p className="page-sub" style={{ margin: 0, fontSize: 'var(--fs-sm)' }}>
              One campus account for your classes, attendance, fees, notices and requests.
            </p>
          </div>

          {form}

          <div className="auth-or">or pick a demo persona</div>

          {/* Compact Demo Roles Quick-Fill Strip */}
          <RoleQuickStrip
            accounts={filtered}
            currentEmail={email}
            autoFilledRole={autoFilledRole}
            onFill={handleFillAccount}
            onLaunch={() => void submit()}
            busy={busy}
            title="Seeded Demo Personas"
          />
        </div>
      </section>

      {/* The footer is the trust line: who to contact, and whose product this
          is. Rendered only when the institution actually configured it. */}
      {institution.supportLine || identity.website ? (
        <footer className="auth-foot">
          {institution.supportLine ? <span>{institution.supportLine}</span> : null}
          {identity.website ? <span>{identity.website}</span> : null}
        </footer>
      ) : null}

    </div>
  )
}

/** The brand plate for a sign-in screen: the college's crest when one is
 *  configured, its monogram when it is not - never a hardcoded mark. Shared by
 *  all three station variants so the front door looks like one product. */
function AuthBrand() {
  const institution = useInstitution()
  const crest = institution.config.appearance.crest_url
  return (
    <Link to="/" className="sidebar-brand" style={{ marginBottom: 0 }} title={institution.config.identity.name}>
      {crest ? (
        <img className="brand-crest" src={crest} alt="" aria-hidden="true" />
      ) : (
        <span className="brand-mark" aria-hidden="true" data-monogram={institution.monogram} />
      )}
      <span className="brand-name">{institution.shortName}</span>
    </Link>
  )
}

/** Compact 1-Row Role Quick Strip with autofill feedback */
function RoleQuickStrip({
  accounts,
  currentEmail,
  autoFilledRole,
  onFill,
  onLaunch,
  busy,
  title = 'Quick Role Fill',
}: {
  accounts: DemoAccount[]
  currentEmail: string
  autoFilledRole: string | null
  onFill: (account: DemoAccount) => void
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
            <span className="mono tiny bold" style={{ color: 'var(--signal)' }}>
              <Icon name="check" size={12} style={{ verticalAlign: '-2px' }} /> Loaded:
            </span>
            <span className="tiny bold text-truncate" style={{ maxWidth: 210 }}>{autoFilledRole}</span>
          </div>
          <Button
            size="sm"
            variant="primary"
            busy={busy}
            style={{ padding: '2px 8px', height: 26, minHeight: 26, fontSize: 11 }}
            onClick={onLaunch}
          >
            <span className="row" style={{ alignItems: 'center', gap: 4 }}>
              <Icon name="arrowRight" size={13} /> Launch
            </span>
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
        <span className="station-switch-text">Personal</span>
      </Link>
      <Link
        className={`station-switch-btn ${active === 'desk' ? 'is-active' : ''}`}
        to="/login?mode=desk"
        aria-current={active === 'desk' ? 'page' : undefined}
      >
        <span className="station-switch-indicator" />
        <span className="station-switch-text">Helpdesk</span>
      </Link>
      <Link
        className={`station-switch-btn ${active === 'kiosk' ? 'is-active' : ''}`}
        to="/login?mode=kiosk"
        aria-current={active === 'kiosk' ? 'page' : undefined}
      >
        <span className="station-switch-indicator" />
        <span className="station-switch-text">Kiosk</span>
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
          <Icon name={option.symbol} size={16} />
        </button>
      ))}
    </div>
  )
}
