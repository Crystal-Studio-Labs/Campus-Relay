/** Public landing page.
 *
 *  Written for the person deciding whether this is worth an hour of their time:
 *  a registrar, a warden, a review panel. It shows the product rather than
 *  describing it, states the one engine that drives every request, and - most
 *  importantly - lists what this prototype does *not* claim.
 *
 *  No analytics, no cookie banner, no invented statistics. Every number on this
 *  page is either a fact about the build or is labelled as demo data.
 */

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import { useRemote } from '../state/hooks'
import { useTheme, THEME_OPTIONS } from '../state/theme'
import { useInstitution } from '../state/institution'
import { Badge, Button } from '../components/ui'

const PIPELINE = [
  'Request',
  'Case',
  'Policy',
  'Workflow',
  'Approval',
  'Target',
  'Assignment',
  'Notification',
  'Resolution',
  'Verification',
  'Audit',
]

const FEATURES = [
  {
    icon: '◎',
    title: 'One engine, every service',
    body: 'A hostel fan, a bonafide certificate, a leave pass and a mess complaint are the same object: a case. Department, workflow, target time and form fields come from the service catalogue, so adding a service is configuration.',
  },
  {
    icon: '☁',
    title: 'Works with no signal',
    body: 'Requests are written to the device first, with a key generated on the device. Replaying that key can never create a second case, and a stale edit is reported as a conflict instead of overwriting.',
  },
  {
    icon: '✓',
    title: 'Proven, not asserted',
    body: 'Every state change writes an append-only audit row: who, when, from which channel and device. Notices track delivered, read, acknowledged and actioned per person.',
  },
  {
    icon: '◫',
    title: 'Access that is not one-size',
    body: 'A student gets bottom tabs on a phone. Staff get their own queue and can finish work in a basement. Security gets one input and one huge verdict. The kiosk gets giant targets and resets itself.',
  },
  {
    icon: '✳',
    title: 'Intelligence off the critical path',
    body: 'Four agents classify intake, explain routing, brief the operations team and answer questions with tool evidence. They propose; a human confirms. With no model configured, deterministic rules answer instead.',
  },
  {
    icon: '⇢',
    title: 'Honest instrumentation',
    body: 'SLA compliance counts only resolved cases. Channel coverage is reported per channel, including the ones with no provider configured - those are marked "not configured", not "delivered".',
  },
]

const STEPS = [
  {
    title: 'A request becomes a case',
    body: 'From a phone, a kiosk, the helpdesk or an agent - one object, one reference, one owner.',
  },
  {
    title: 'Policy and workflow decide',
    body: 'Declarative checks run before routing, so a certificate blocked by dues is stopped with a stated reason.',
  },
  {
    title: 'Work is assigned and timed',
    body: 'The least-loaded qualified person is chosen, a target time is set, and the reasoning is recorded.',
  },
  {
    title: 'Resolved, verified, audited',
    body: 'The requester confirms the fix. Every hop has already written an immutable audit row.',
  },
]

const ROLES = [
  { role: 'Student', device: 'Phone', does: 'Raises anything, follows the timeline, confirms the fix, files offline.' },
  { role: 'Staff / technician', device: 'Phone, one hand', does: 'Own queue sorted by what will breach first; starts and finishes work offline.' },
  { role: 'Warden / department head', device: 'Tablet or desktop', does: 'Approvals with waiting time, assignments with workload, escalations.' },
  { role: 'Administrator', device: 'Desktop', does: 'Command centre, dense queue, analytics, notice studio, audit trail.' },
  { role: 'Security', device: 'Phone at the gate', does: 'Verifies passes, records movements (queued offline), sees who is out now.' },
  { role: 'Kiosk / helpdesk', device: 'Shared tablet', does: 'Files on behalf of a student by roll number; channel recorded.' },
]

const HONESTY = [
  'Push, SMS and email are adapter slots with no provider configured: the app never claims a message was delivered.',
  'Telegram and WhatsApp are real adapters, not mockups: Telegram sends once a bot token is configured, and WhatsApp needs Meta business credentials and an approved template. With neither configured, nothing is queued and no delivery is claimed.',
  'The demo campus, its users, its 30 days of history and the "demo accounts" are seeded data, labelled as such.',
  'Agent answers come from deterministic rules unless a model is configured; either way they are advisory only.',
  'Attachments and gate verification need the server. The app says so on screen instead of failing quietly.',
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
      <header className="landing-top">
        <div className="sidebar-brand" style={{ marginBottom: 0 }}>
          <span className="brand-mark" aria-hidden="true" data-monogram={institution.monogram} />
          <span className="brand-name">{institution.shortName}</span>
        </div>
        <span className="grow" />
        <nav className="landing-nav" aria-label="Sections">
          <a href="#features">Features</a>
          <a href="#how">How it works</a>
          <a href="#roles">Roles</a>
          <a href="#limits">Limitations</a>
        </nav>
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
        <Link className="btn btn-primary btn-sm" to="/login">
          Sign in
        </Link>
      </header>

      <div className="landing-wrap">
        {/* ------------------------------------------------------------ hero */}
        <section className="landing-hero">
          <span className="landing-kicker">
            <Badge tone="ghost">{institution.config.identity.kind || 'Prototype'}</Badge>
            {[institution.config.identity.city, institution.config.identity.region].filter(Boolean).join(', ') ||
              'Campus operations'}
          </span>
          <h1 className="landing-title">
            Every campus request, on one trackable case.
          </h1>
          <p className="landing-lede">
            Complaints, certificates, leave passes and facility requests are one kind of object here: a{' '}
            <strong>case</strong> with an owner, a deadline, a workflow and a permanent record. Built for a hostel
            corridor with two bars of signal, a gate with none, and an office that has to answer for a decision six
            months later.
          </p>
          <div className="landing-cta">
            <Link className="btn btn-primary btn-lg" to="/login">
              Open the demo campus
            </Link>
            <Link className="btn btn-ghost btn-lg" to="/kiosk">
              Try the kiosk
            </Link>
            <Button variant="ghost" size="lg" onClick={() => setShowAccounts((value) => !value)}>
              {showAccounts ? 'Hide demo accounts' : 'Show demo accounts'}
            </Button>
          </div>
          <p className="landing-note">
            <strong>Adoption promise:</strong> give us your college&apos;s information and this is a configurable
            engine you can have running within an hour of setup. Departments, hostels, rooms, staff and students
            arrive by config and CSV import — it is configured, never forked.
          </p>

          {showAccounts ? (
            <div className="stack" style={{ marginTop: 24, textAlign: 'start' }}>
              <Badge tone="warn">Seeded demo accounts — password Campus@2026</Badge>
              <div className="landing-grid">
                {accounts.data?.accounts?.map((account) => (
                  <div key={account.email} className="demo-account">
                    <div>
                      <div className="bold">{account.role.replaceAll('_', ' ')}</div>
                      <div className="tiny muted">{account.email}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* A framed product preview: show it, do not just assert it. */}
          <div className="hero-visual" aria-hidden="true">
            <div className="hero-visual-bar">
              <span className="hero-dot" />
              <span className="hero-dot" />
              <span className="hero-dot" />
              <span className="hero-visual-title">
                {institution.shortName} · Command centre
              </span>
            </div>
            <div className="hero-visual-body">
              <div className="hero-rail">
                <div className="hero-rail-item is-active">Overview</div>
                <div className="hero-rail-item">Case queue</div>
                <div className="hero-rail-item">Approvals</div>
                <div className="hero-rail-item">Notices</div>
                <div className="hero-rail-item">Analytics</div>
                <div className="hero-rail-item">Audit trail</div>
              </div>
              <div className="hero-panel">
                <div className="hero-metrics">
                  <div className="hero-metric">
                    <div className="hero-metric-value">23</div>
                    <div className="hero-metric-label">Open cases</div>
                  </div>
                  <div className="hero-metric">
                    <div className="hero-metric-value">4</div>
                    <div className="hero-metric-label">Past target</div>
                  </div>
                  <div className="hero-metric">
                    <div className="hero-metric-value">91%</div>
                    <div className="hero-metric-label">Resolved in time</div>
                  </div>
                </div>
                <div className="hero-row">
                  <span className="mono tiny">CR-2026-0142</span>
                  <span className="hero-bar is-warn">
                    <span style={{ width: '78%' }} />
                  </span>
                  <Badge tone="warn">at risk</Badge>
                </div>
                <div className="hero-row">
                  <span className="mono tiny">CR-2026-0143</span>
                  <span className="hero-bar">
                    <span style={{ width: '42%' }} />
                  </span>
                  <Badge tone="open">open</Badge>
                </div>
                <div className="hero-row">
                  <span className="mono tiny">CR-2026-0144</span>
                  <span className="hero-bar is-done">
                    <span style={{ width: '100%' }} />
                  </span>
                  <Badge tone="done">verified</Badge>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* -------------------------------------------------------- features */}
        <section className="landing-section" id="features">
          <h2>Built for the way campuses actually run</h2>
          <p className="lede">
            Six things, each of which a reviewer can verify inside the demo rather than take on trust.
          </p>
          <div className="landing-grid">
            {FEATURES.map((feature) => (
              <article key={feature.title} className="feature-card">
                <span className="feature-icon" aria-hidden="true">
                  {feature.icon}
                </span>
                <h3>{feature.title}</h3>
                <p>{feature.body}</p>
              </article>
            ))}
          </div>
        </section>

        {/* ------------------------------------------------------------ how */}
        <section className="landing-section" id="how">
          <h2>Every request takes the same path</h2>
          <p className="lede">
            One pipeline serves every service. Differences come from configuration - the service catalogue, the
            workflow definition and the target-time rules - not from a separate module per department.
          </p>
          <div className="pipeline" style={{ marginBottom: 24 }}>
            {PIPELINE.map((step, index) => (
              <span key={step} style={{ display: 'contents' }}>
                <span className="pipeline-step">
                  <span className="pipeline-index" aria-hidden="true">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  {step}
                </span>
                {index < PIPELINE.length - 1 ? (
                  <span className="pipeline-arrow" aria-hidden="true">
                    →
                  </span>
                ) : null}
              </span>
            ))}
          </div>
          <div className="step-row">
            {STEPS.map((step, index) => (
              <div key={step.title} className="step">
                <span className="step-index">{index + 1}</span>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ---------------------------------------------------------- roles */}
        <section className="landing-section" id="roles">
          <h2>Six experiences, one product</h2>
          <p className="lede">
            The same case looks different depending on who is holding the device and how big it is. This is a layout
            decision, not a theme.
          </p>
          <div className="landing-grid">
            {ROLES.map((item) => (
              <div key={item.role} className="role-card">
                <div className="card-head">
                  <Badge tone="ghost">{item.device}</Badge>
                </div>
                <h3>{item.role}</h3>
                <p className="small muted" style={{ marginBottom: 0 }}>
                  {item.does}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* --------------------------------------------------------- limits */}
        <section className="landing-section" id="limits">
          <h2>What this prototype does not claim</h2>
          <p className="lede">
            Stated up front, because a demo that oversells itself is worth less than one that tells you where its
            edges are.
          </p>
          <div className="feature-card" style={{ padding: 24 }}>
            <div className="row wrap" style={{ gap: 8, marginBottom: 14 }}>
              <span className="stamp">Not claimed</span>
              <span className="stamp">Demo data</span>
              <span className="stamp">Advisory only</span>
            </div>
            <ul style={{ margin: 0 }}>
              {HONESTY.map((item) => (
                <li key={item} style={{ marginBottom: 8 }}>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ------------------------------------------------------------- cta */}
        <section className="landing-section">
          <div className="feature-card" style={{ padding: 32, alignItems: 'flex-start' }}>
            <h2 style={{ marginBottom: 8 }}>Try it the way a student would</h2>
            <p style={{ maxWidth: '70ch', color: 'var(--muted-ink)' }}>
              Sign in as the demo student, turn off your network, and file a complaint. You will get a reference
              immediately, the request will enter the queue as &ldquo;filed offline&rdquo;, and it will reach the
              server once, exactly once, when the connection returns.
            </p>
            <div className="landing-cta" style={{ justifyContent: 'flex-start', marginTop: 16 }}>
              <Link className="btn btn-primary btn-lg" to="/login">
                Sign in and file something offline
              </Link>
              <Link className="btn btn-ghost" to="/login?mode=kiosk">
                Set this device up as a kiosk
              </Link>
            </div>
          </div>
        </section>
      </div>

      <footer className="landing-foot">
        <div className="landing-foot-inner">
          <span>
            {institution.config.identity.name} — running Campus Relay. FastAPI · PostgreSQL · React PWA. Data shown in
            the demo is seeded.
            <br />
            Name, design language, vocabulary and station behaviour all come from{' '}
            <span className="mono tiny">config/institution.json</span>: this deployment is configured, not forked.
          </span>
          <span className="row wrap" style={{ gap: 12 }}>
            <Link to="/login">Sign in</Link>
            <Link to="/kiosk">Kiosk</Link>
            <Link to="/login?mode=desk">Helpdesk</Link>
          </span>
        </div>
      </footer>
    </div>
  )
}
