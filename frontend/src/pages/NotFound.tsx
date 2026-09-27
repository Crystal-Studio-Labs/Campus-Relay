/** 404 Not Found Page — Campus Relay
 *
 *  Industrial Brutalist error station with real-time diagnostic readout,
 *  network recovery telemetry, and quick-routing failover actions.
 */

import { useState, useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useSession } from '../state/session'
import { useInstitution } from '../state/institution'
import { useTheme, THEME_OPTIONS } from '../state/theme'
import { Badge, Button } from '../components/ui'
import { usePageMeta } from '../lib/seo'

export function NotFound() {
  usePageMeta({
    title: '404 Route Unmapped',
    description: 'Target station unreachable or decommissioned. Return to operational station or open self-service kiosk.',
  })
  const location = useLocation()
  const navigate = useNavigate()
  const { status, profile } = useSession()
  const institution = useInstitution()
  const { theme, setTheme } = useTheme()
  const [timestamp, setTimestamp] = useState('')

  useEffect(() => {
    setTimestamp(new Date().toISOString())
  }, [])

  const defaultDestination =
    status === 'authenticated'
      ? profile?.role === 'STUDENT'
        ? '/'
        : ['ADMIN', 'SUPER_ADMIN'].includes(profile?.role ?? '')
        ? '/operations'
        : ['STAFF', 'TECHNICIAN'].includes(profile?.role ?? '')
        ? '/tasks'
        : ['WARDEN'].includes(profile?.role ?? '')
        ? '/approvals'
        : '/cases'
      : '/'

  return (
    <div className="not-found-page">
      {/* ------------------------------------------------------------ TOPBAR */}
      <header className="landing-top no-print">
        <Link to="/" className="sidebar-brand" style={{ marginBottom: 0 }}>
          <span className="brand-mark" aria-hidden="true" data-monogram={institution.monogram} />
          <span className="brand-name">{institution.shortName}</span>
        </Link>
        <span className="grow" />
        <div className="landing-top-actions">
          <Badge tone="urgent" className="pulse-beacon">
            SIGNAL_LOSS // 404
          </Badge>
          <div className="switcher" role="group" aria-label="Theme switcher">
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
          <Link className="btn btn-primary btn-sm" to={defaultDestination}>
            {status === 'authenticated' ? 'Command Station' : 'Sign In'}
          </Link>
        </div>
      </header>

      {/* ------------------------------------------------------------ MAIN CONTENT */}
      <main className="landing-wrap" style={{ maxWidth: 880 }}>
        <div className="not-found-card animate-entrance">
          {/* Stencil Top Bar */}
          <div className="not-found-card-bar">
            <span className="hero-dot" style={{ background: 'var(--danger)' }} />
            <span className="hero-dot" style={{ background: 'var(--sun)' }} />
            <span className="hero-dot" style={{ background: 'var(--mint)' }} />
            <span className="not-found-card-title mono tiny">
              FAULT_DIAGNOSTIC // UNMAPPED_ROUTE_TARGET
            </span>
          </div>

          <div className="not-found-body">
            {/* Giant Brutalist 404 Stencil */}
            <div className="not-found-code-plate">
              <span className="not-found-glitch">404</span>
              <div className="not-found-kicker">
                <Badge tone="urgent">ROUTE_NOT_RESOLVED</Badge>
                <span className="tiny mono muted">ERROR_CODE: CR-404-UNLINKED</span>
              </div>
            </div>

            <h1 className="not-found-title">
              Target station unreachable or decommissioned.
            </h1>

            <p className="not-found-desc">
              The address <code className="mono bold not-found-url">{location.pathname}</code> does not map to an active
              campus operating workstation, case ledger, or notice node. The record may have expired, been purged under
              retention rules, or requires elevated institutional credentials.
            </p>

            {/* Diagnostic Terminal Plate */}
            <div className="not-found-terminal">
              <div className="terminal-header">
                <span className="terminal-dot" />
                <span className="tiny mono bold">DIAGNOSTIC_TRACE_LOG</span>
              </div>
              <pre className="terminal-code">
{`> [NET] Resolving route path: "${location.pathname}"
> [RBAC] Querying institutional permission map... [UNRESOLVED]
> [CACHE] Service worker outbox index verified... [ONLINE_SAFE]
> [STATUS] HTTP 404 Not Found · Timestamp: ${timestamp || 'RECORDING...'}
> [FAILOVER] Standby: Ready to safely re-route to authenticated station.`}
              </pre>
            </div>

            {/* Recovery Action Deck */}
            <div className="not-found-actions">
              <Button
                variant="primary"
                size="lg"
                onClick={() => navigate(defaultDestination)}
              >
                ← Return to Operational Station
              </Button>
              <Button
                variant="default"
                size="lg"
                onClick={() => window.history.length > 1 ? navigate(-1) : navigate('/')}
              >
                ↶ Step Back
              </Button>
              <Link className="btn btn-ghost btn-lg" to="/kiosk">
                Open Kiosk Mode
              </Link>
            </div>

            {/* Alternative Station Grid */}
            <div className="not-found-links-grid">
              <Link to="/report" className="not-found-link-item">
                <span className="small bold">File Case Request →</span>
                <span className="tiny muted">Submit maintenance or leave pass</span>
              </Link>
              <Link to="/cases" className="not-found-link-item">
                <span className="small bold">Case Ledger →</span>
                <span className="tiny muted">Track active repair tickets</span>
              </Link>
              <Link to="/notices" className="not-found-link-item">
                <span className="small bold">Campus Notices →</span>
                <span className="tiny muted">View verified administrative alerts</span>
              </Link>
              <Link to="/sync" className="not-found-link-item">
                <span className="small bold">Sync Centre →</span>
                <span className="tiny muted">Inspect local IndexedDB cache</span>
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
