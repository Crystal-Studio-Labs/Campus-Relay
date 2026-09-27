/** Public landing page - Campus Relay.
 *
 *  Engineered by Crystal Studio Labs for BPUT Hackathon 2026
 *  Problem Statement 07 (Fretbox): Resilient Campus Operations & Management
 */

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import { useRemote } from '../state/hooks'
import { useTheme, THEME_OPTIONS } from '../state/theme'
import { useInstitution } from '../state/institution'
import { Badge, Button } from '../components/ui'

// --- High-fidelity SVG Icons for Industrial Brutalism ---
function IconAlert() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  )
}

function IconOffline() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square">
      <path d="M1 1l22 22" />
      <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
      <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
      <path d="M10.71 5.05A16 16 0 0 1 22.58 9" />
      <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
      <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
      <line x1="12" y1="20" x2="12.01" y2="20" />
    </svg>
  )
}

function IconShield() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  )
}

function IconClock() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  )
}

function IconCpu() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square">
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <rect x="9" y="9" width="6" height="6" />
      <line x1="9" y1="1" x2="9" y2="4" />
      <line x1="15" y1="1" x2="15" y2="4" />
      <line x1="9" y1="20" x2="9" y2="23" />
      <line x1="15" y1="20" x2="15" y2="23" />
      <line x1="20" y1="9" x2="23" y2="9" />
      <line x1="20" y1="14" x2="23" y2="14" />
      <line x1="1" y1="9" x2="4" y2="9" />
      <line x1="1" y1="14" x2="4" y2="14" />
    </svg>
  )
}

function IconQr() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square">
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
    </svg>
  )
}

function IconLayers() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square">
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </svg>
  )
}

const PROBLEMS = [
  {
    icon: <IconAlert />,
    badge: 'Operational Silos',
    title: 'Fragmented Channels & Lost Tickets',
    body: 'Maintenance complaints scatter across WhatsApp groups, paper logbooks, and untracked phone calls. Requests disappear between wardens, facility managers, and electricians with zero auditability.',
  },
  {
    icon: <IconOffline />,
    badge: 'Zero Connectivity',
    title: 'Dead-Zone Network Blindspots',
    body: 'Hostel basements, labs, and perimeter security gates suffer continuous signal drops. Traditional web portals drop state on network errors, stranding students with incomplete requests.',
  },
  {
    icon: <IconShield />,
    badge: 'Security Risk',
    title: 'Unverifiable Paper Passes & Fraud',
    body: 'Hand-written gate passes and bonafide requests lack cryptographic verification. Gate security has no real-time headcount of students outside campus or validity proof of warden signatures.',
  },
  {
    icon: <IconClock />,
    badge: 'Unenforced SLAs',
    title: 'Accountability Disputes & Stale Tickets',
    body: 'Without immutable timestamps and automatic SLA escalation rules, delayed repairs trigger blame loops between students, staff, and administration without resolution proof.',
  },
]

const SOLUTIONS = [
  {
    icon: <IconLayers />,
    badge: 'Universal Case Engine',
    title: 'One Core Engine for Every Request',
    body: 'Hostel repairs, bonafide certificates, gate leave passes, and IT complaints are all instances of a single, auditable Case state machine with automated transitions and policy guards.',
  },
  {
    icon: <IconOffline />,
    badge: 'IndexedDB Outbox',
    title: 'Store-and-Forward Offline Protocol',
    body: 'Requests write to the device outbox first with cryptographic idempotency keys. Upon reconnection, transactions replay idempotently with conflict detection and preserved local timestamps.',
  },
  {
    icon: <IconQr />,
    badge: 'Verifiable Security',
    title: 'Cryptographic QR & Gate Desk',
    body: 'Gate passes generate tamper-proof QR tokens verified by gate guards with a single scan. Bonafide certificates generate cryptographically verifiable PDFs with public validation endpoints.',
  },
  {
    icon: <IconCpu />,
    badge: 'Autonomous Agents',
    title: 'Controlled AI Operations Intelligence',
    body: 'Four specialized agents classify incoming requests, evaluate urgency, route tickets to least-loaded staff, and brief administrators daily with human-in-the-loop governance.',
  },
]

const ROLES = [
  {
    role: 'Student',
    device: 'Mobile PWA',
    highlight: 'Offline Filing & QR Scan',
    does: 'Scan room QR codes to report faults, track real-time repair progress, file leave requests, and verify technician resolution.',
  },
  {
    role: 'Staff & Technicians',
    device: 'Field Device',
    highlight: 'SLA-Sorted Dispatch',
    does: 'Personal queue prioritized by impending SLA breach, offline task execution in basements, and one-tap work completion proof.',
  },
  {
    role: 'Hostel Warden',
    device: 'Tablet / Laptop',
    highlight: 'Policy & Leave Approvals',
    does: 'Multi-stage leave pass reviews with curfew validations, emergency escalations, and automated security notification triggers.',
  },
  {
    role: 'Administrator',
    device: 'Desktop Command Centre',
    highlight: 'Real-Time Governance',
    does: 'Live campus operations dashboard, SLA ageing sweeps (<24h, 1-3d, 3-7d), append-only audit ledger, and targeted Notice Studio.',
  },
  {
    role: 'Security Gate',
    device: 'Dedicated Gate Desk',
    highlight: 'One-Tap Verification',
    does: 'Verify gate passes via barcode/QR scanner, record campus exits and returns, and inspect real-time outside-campus headcount.',
  },
  {
    role: 'Shared Corridor Kiosk',
    device: 'Wall Touchscreen',
    highlight: 'Zero-Phone Access',
    does: 'Assisted terminal for students without a smartphone. Auto-resets on idle timeout and preserves zero residual personal sessions.',
  },
]

const TECH_STACK = [
  { name: 'FastAPI (Python 3.12)', role: 'High-throughput async REST API with Pydantic v2 schemas' },
  { name: 'PostgreSQL 16 & SQLAlchemy 2.0', role: 'Relational data model with append-only ORM immutability triggers' },
  { name: 'Alembic Migrations', role: 'Idempotent, additive schema version control and zero-downtime deploys' },
  { name: 'React 18 & TypeScript', role: 'Strictly typed client architecture with modular feature workspaces' },
  { name: 'IndexedDB & Service Worker', role: 'Local-first outbox synchronization engine for true offline resilience' },
  { name: 'Vite PWA & Industrial CSS', role: 'Lightweight, hardware-accelerated Brutalist design system with dual themes' },
  { name: 'Supabase Database Pooler', role: 'Cloud-managed PostgreSQL with TLS session pooling and connection safeguards' },
  { name: 'Docker & Docker Compose', role: 'Dual deployment shapes: split cloud (Render+Vercel) & self-hosted on-prem' },
]

export function LandingPage() {
  const { theme, setTheme } = useTheme()
  const institution = useInstitution()
  const [showAccounts, setShowAccounts] = useState(false)
  const accounts = useRemote<{ accounts: { role: string; email: string; label: string }[] }>(
    showAccounts ? 'landing-demo-accounts' : null,
    () => api.get('/auth/demo-accounts'),
    { cacheKey: null },
  )

  return (
    <div className="landing">
      {/* ------------------------------------------------------------ TOPBAR */}
      <header className="landing-top no-print">
        <div className="sidebar-brand" style={{ marginBottom: 0 }}>
          <span className="brand-mark" aria-hidden="true" data-monogram={institution.monogram} />
          <span className="brand-name">{institution.shortName}</span>
        </div>
        <span className="grow" />
        <nav className="landing-nav" aria-label="Navigation">
          <a href="#problem">Problem</a>
          <a href="#solution">Solution</a>
          <a href="#roles">Roles</a>
          <a href="#tech">Tech Stack</a>
          <a href="#credits">Credits</a>
        </nav>
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
        <Link className="btn btn-primary btn-sm" to="/login">
          Sign In
        </Link>
      </header>

      <div className="landing-wrap">
        {/* ------------------------------------------------------------ HERO */}
        <section className="landing-hero animate-entrance">
          <div className="landing-kicker">
            <Badge tone="warn" className="pulse-beacon">
              BPUT Hackathon 2026
            </Badge>
            <Badge tone="open">Problem Statement 07 · Fretbox</Badge>
            <span className="small muted">Crystal Studio Labs</span>
          </div>

          <h1 className="landing-title">
            A resilient operating layer for everyday campus operations.
          </h1>

          <p className="landing-lede">
            Maintenance tickets, bonafide certificates, leave gate passes, and emergency notices united into{' '}
            <strong>one universal, auditable case engine</strong>. Built to operate flawlessly in hostel basements
            with zero cellular signal, high-speed security gates, and central administrative command centres.
          </p>

          <div className="landing-cta">
            <Link className="btn btn-primary btn-lg" to="/login">
              Launch Live Demo
            </Link>
            <Link className="btn btn-ghost btn-lg" to="/kiosk">
              Open Kiosk Station
            </Link>
            <Button
              variant="default"
              size="lg"
              onClick={() => setShowAccounts((prev) => !prev)}
            >
              {showAccounts ? 'Hide Demo Accounts' : 'Inspect Demo Accounts'}
            </Button>
          </div>

          {/* Interactive Demo Accounts Dropdown */}
          {showAccounts ? (
            <div className="card animate-entrance" style={{ marginTop: 20, textAlign: 'start' }}>
              <div className="row-between" style={{ marginBottom: 12 }}>
                <div>
                  <h3 style={{ margin: 0 }}>Seeded Demo Accounts</h3>
                  <span className="small muted">All roles use universal password: </span>
                  <code className="bold">Campus@2026</code>
                </div>
                <Badge tone="done">8 Roles Active</Badge>
              </div>
              <div className="landing-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
                {accounts.data?.accounts ? (
                  accounts.data.accounts.map((acc) => (
                    <div key={acc.email} className="metric" style={{ padding: '8px 12px' }}>
                      <div className="bold small">{acc.role.replaceAll('_', ' ')}</div>
                      <code className="tiny muted">{acc.email}</code>
                      <Link
                        to={`/login?email=${encodeURIComponent(acc.email)}`}
                        className="small bold"
                        style={{ marginTop: 4, color: 'var(--signal)' }}
                      >
                        Auto-fill Login →
                      </Link>
                    </div>
                  ))
                ) : (
                  <div className="muted small">Loading accounts from active backend…</div>
                )}
              </div>
            </div>
          ) : null}

          {/* Live Preview Plate */}
          <div className="hero-visual" aria-hidden="true" style={{ marginTop: 32 }}>
            <div className="hero-visual-bar">
              <span className="hero-dot" />
              <span className="hero-dot" />
              <span className="hero-dot" />
              <span className="hero-visual-title">
                {institution.shortName} · Operations Command Centre
              </span>
            </div>
            <div className="hero-visual-body">
              <div className="hero-rail">
                <div className="hero-rail-item is-active">Overview</div>
                <div className="hero-rail-item">Queue (24)</div>
                <div className="hero-rail-item">Approvals (6)</div>
                <div className="hero-rail-item">Gate Logs (18)</div>
                <div className="hero-rail-item">Notice Studio</div>
                <div className="hero-rail-item">Audit Trail</div>
              </div>
              <div className="hero-panel">
                <div className="hero-metrics">
                  <div className="hero-metric">
                    <div className="hero-metric-value">24</div>
                    <div className="hero-metric-label">Active Cases</div>
                  </div>
                  <div className="hero-metric">
                    <div className="hero-metric-value" style={{ color: 'var(--status-warn)' }}>3</div>
                    <div className="hero-metric-label">SLA At Risk</div>
                  </div>
                  <div className="hero-metric">
                    <div className="hero-metric-value" style={{ color: 'var(--status-done)' }}>96.4%</div>
                    <div className="hero-metric-label">Resolution Rate</div>
                  </div>
                  <div className="hero-metric">
                    <div className="hero-metric-value" style={{ color: 'var(--signal)' }}>100%</div>
                    <div className="hero-metric-label">Audit Verifiable</div>
                  </div>
                </div>
                <div className="hero-row">
                  <span className="mono tiny bold">CR-2026-0142</span>
                  <span className="truncate small grow">Hostel 3 · Water Cooler Compressor Tripped</span>
                  <Badge tone="warn">SLA &lt; 2h</Badge>
                </div>
                <div className="hero-row">
                  <span className="mono tiny bold">CR-2026-0143</span>
                  <span className="truncate small grow">Lab B-12 · Network Switch Port 14 Down</span>
                  <Badge tone="open">Assigned</Badge>
                </div>
                <div className="hero-row">
                  <span className="mono tiny bold">CR-2026-0144</span>
                  <span className="truncate small grow">Leave Gate Pass · Overnight Medical Verification</span>
                  <Badge tone="done">Warden Approved</Badge>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------------ PROBLEM STATEMENT */}
        <section className="landing-section" id="problem">
          <div className="row wrap" style={{ gap: 8, alignItems: 'center', marginBottom: 8 }}>
            <Badge tone="urgent">The Problem</Badge>
            <span className="mono small muted">BPUT Hackathon 2026 · PS07 (Fretbox)</span>
          </div>
          <h2>The Campus Operations Breakdown</h2>
          <p className="lede">
            Why traditional campus ERPs, WhatsApp groups, and paper registers fail students and administration:
          </p>

          <div className="landing-grid">
            {PROBLEMS.map((prob) => (
              <article key={prob.title} className="feature-card animate-entrance">
                <div className="row-between" style={{ width: '100%', marginBottom: 12 }}>
                  <span className="feature-icon" aria-hidden="true" style={{ color: 'var(--danger)' }}>
                    {prob.icon}
                  </span>
                  <Badge tone="urgent">{prob.badge}</Badge>
                </div>
                <h3>{prob.title}</h3>
                <p>{prob.body}</p>
              </article>
            ))}
          </div>
        </section>

        {/* ------------------------------------------------------------ SOLUTION */}
        <section className="landing-section" id="solution">
          <div className="row wrap" style={{ gap: 8, alignItems: 'center', marginBottom: 8 }}>
            <Badge tone="done">The Solution</Badge>
            <span className="mono small muted">Architected by Crystal Studio Labs</span>
          </div>
          <h2>The Campus Relay Operating Engine</h2>
          <p className="lede">
            An engineered operating layer designed to enforce accountability, maintain zero-loss offline continuity,
            and automate campus workflows:
          </p>

          <div className="landing-grid">
            {SOLUTIONS.map((sol) => (
              <article key={sol.title} className="feature-card animate-entrance">
                <div className="row-between" style={{ width: '100%', marginBottom: 12 }}>
                  <span className="feature-icon" aria-hidden="true" style={{ color: 'var(--signal)' }}>
                    {sol.icon}
                  </span>
                  <Badge tone="done">{sol.badge}</Badge>
                </div>
                <h3>{sol.title}</h3>
                <p>{sol.body}</p>
              </article>
            ))}
          </div>
        </section>

        {/* ------------------------------------------------------------ ROLES */}
        <section className="landing-section" id="roles">
          <div className="row wrap" style={{ gap: 8, alignItems: 'center', marginBottom: 8 }}>
            <Badge tone="open">Role-Tailored Stations</Badge>
            <span className="mono small muted">8 Distinct Workspaces</span>
          </div>
          <h2>Six Specialized Stations, One Unified Engine</h2>
          <p className="lede">
            Different screens for different realities. A student on mobile in a noisy cafeteria and an administrator
            evaluating weekly departmental SLAs get purpose-built workspaces:
          </p>

          <div className="landing-grid">
            {ROLES.map((role) => (
              <div key={role.role} className="role-card animate-entrance">
                <div className="row-between" style={{ marginBottom: 8 }}>
                  <Badge tone="ghost">{role.device}</Badge>
                  <span className="tiny mono bold" style={{ color: 'var(--signal)' }}>
                    {role.highlight}
                  </span>
                </div>
                <h3 style={{ margin: '4px 0 8px' }}>{role.role}</h3>
                <p className="small muted" style={{ margin: 0 }}>
                  {role.does}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ------------------------------------------------------------ TECH STACK */}
        <section className="landing-section" id="tech">
          <div className="row wrap" style={{ gap: 8, alignItems: 'center', marginBottom: 8 }}>
            <Badge tone="ghost">Architecture</Badge>
            <span className="mono small muted">Production-Grade Specifications</span>
          </div>
          <h2>Technology Stack &amp; Deployment Architecture</h2>
          <p className="lede">
            Engineered with zero technical debt: strict type safety, append-only persistence, local-first outbox,
            and containerized deployment options:
          </p>

          <div className="table-wrap" style={{ marginTop: 16 }}>
            <table className="data">
              <thead>
                <tr>
                  <th style={{ width: '35%' }}>Component &amp; Technology</th>
                  <th>Engineering Implementation</th>
                </tr>
              </thead>
              <tbody>
                {TECH_STACK.map((item) => (
                  <tr key={item.name}>
                    <td className="bold mono small">{item.name}</td>
                    <td className="small">{item.role}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ------------------------------------------------------------ CREDITS & GOVERNANCE */}
        <section className="landing-section" id="credits">
          <div className="card" style={{ padding: 32, border: 'var(--border-w-fat) solid var(--line)' }}>
            <div className="row wrap" style={{ gap: 10, alignItems: 'center', marginBottom: 12 }}>
              <span className="brand-mark" aria-hidden="true" data-monogram="CR" />
              <h2 style={{ margin: 0 }}>Campus Relay · Credits &amp; Attribution</h2>
            </div>

            <p style={{ maxWidth: '80ch', lineHeight: 1.6, color: 'var(--muted-ink)' }}>
              <strong>Campus Relay</strong> was designed and developed by{' '}
              <strong style={{ color: 'var(--ink)' }}>Crystal Studio Labs</strong> for the{' '}
              <strong style={{ color: 'var(--ink)' }}>BPUT Hackathon 2026</strong> addressing{' '}
              <strong>Problem Statement 07: Fretbox</strong>.
            </p>

            <div className="landing-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', marginTop: 16 }}>
              <div className="metric">
                <span className="metric-label">DEVELOPED BY</span>
                <span className="metric-value bold">Crystal Studio Labs</span>
                <span className="tiny muted">Engineering Excellence</span>
              </div>
              <div className="metric">
                <span className="metric-label">HACKATHON EVENT</span>
                <span className="metric-value bold">BPUT Hackathon 2026</span>
                <span className="tiny muted">State-Level Innovation</span>
              </div>
              <div className="metric">
                <span className="metric-label">PROBLEM STATEMENT</span>
                <span className="metric-value bold">PS07 (Fretbox)</span>
                <span className="tiny muted">Campus Operations Layer</span>
              </div>
              <div className="metric">
                <span className="metric-label">GOVERNANCE &amp; LICENSE</span>
                <span className="metric-value bold">MIT Open Source</span>
                <span className="tiny muted">Configurable, Never Forked</span>
              </div>
            </div>

            <div className="row wrap" style={{ gap: 16, marginTop: 24 }}>
              <Link className="btn btn-primary" to="/login">
                Explore Demo Environment
              </Link>
              <Link className="btn btn-ghost" to="/kiosk">
                Test Kiosk Mode
              </Link>
              <a
                className="btn btn-ghost"
                href="https://github.com/Crystal-Studio-Labs/Campus-Relay"
                target="_blank"
                rel="noreferrer"
              >
                GitHub Repository ↗
              </a>
            </div>
          </div>
        </section>
      </div>

      {/* ------------------------------------------------------------ FOOTER */}
      <footer className="landing-foot no-print">
        <div className="landing-foot-inner">
          <span>
            <strong>Campus Relay</strong> · Crystal Studio Labs · BPUT Hackathon 2026 (PS07 Fretbox).
            <br />
            Configured through <span className="mono tiny">config/institution.json</span>. MIT License.
          </span>
          <span className="row wrap" style={{ gap: 14 }}>
            <Link to="/login">Sign In</Link>
            <Link to="/kiosk">Corridor Kiosk</Link>
            <Link to="/login?mode=desk">Helpdesk</Link>
            <a href="https://github.com/Crystal-Studio-Labs/Campus-Relay" target="_blank" rel="noreferrer">
              GitHub
            </a>
          </span>
        </div>
      </footer>
    </div>
  )
}
