/** The institution's front page: the first thing anybody sees.
 *
 *  A college's front door is not a marketing brochure, and it is not an empty
 *  card either. It is the notice board by the gate: whose campus this is, what
 *  the place can be asked for, what is being announced today, and how a request
 *  travels once it is made. Every number and every service on this page comes
 *  from the running deployment - `GET /api/v1/public/summary`, which is public
 *  on purpose - so the page is never a static claim about a product.
 *
 *  What it deliberately is not: no pricing, no feature table, no sign-up funnel.
 *  The only actions are signing in and putting the app on the device, because
 *  those are the only two things a visitor to a campus portal actually does.
 *
 *  Degradation is part of the design. Read offline, or against an API that is
 *  not up yet, the page still renders the institution's identity, its crest and
 *  its term from the cached configuration, and says plainly which parts it
 *  could not reach rather than showing an empty frame.
 */

import { Link, useNavigate } from 'react-router-dom'
import { useInstitution } from '../state/institution'
import { useRemote, useSyncState } from '../state/hooks'
import { THEME_OPTIONS, useTheme } from '../state/theme'
import { Badge, Button, KV, Metric, Panel } from '../components/ui'
import { Icon } from '../components/Icon'
import { InstallApp } from '../components/InstallApp'
import { api } from '../lib/api'
import { duration, noticeTone, relative } from '../lib/format'
import { featureOn } from '../lib/institution'
import { usePageMeta } from '../lib/seo'
import type { Tone } from '../components/ui'

/* =========================== THE PUBLIC FEED =========================== */

interface PublicService {
  key: string
  name: string
  category: string
  icon: string
  description: string
  sla_minutes: number
}

interface PublicNotice {
  title: string
  summary: string | null
  notice_type: string
  publish_at: string | null
}

interface PublicSummary {
  demo_mode: boolean
  services: PublicService[]
  service_count: number
  department_count: number
  workflow_count: number
  campus_count: number
  notices: PublicNotice[]
}

/** The one unauthenticated read on this screen. Cached, so the notice board and
 *  the catalogue survive a reload in a dead zone - they are public facts about a
 *  campus, and a visitor should not need a connection to read the notice board. */
function usePublicSummary() {
  return useRemote<PublicSummary>(
    'public-summary',
    (signal) => api.get<PublicSummary>('/public/summary', signal),
    { cacheKey: 'public-summary' },
  )
}

/* ============================ STATIC STORY ============================= */

/** How a request travels. The same six moves in every workflow the engine
 *  ships, expressed once so the front page and the docs cannot drift apart. */
const FLOW: { title: string; detail: string }[] = [
  { title: 'Asked for', detail: 'A form, the QR code on the wall, the lobby kiosk, the helpdesk desk. The channel is recorded, never guessed.' },
  { title: 'Validated', detail: 'Eligibility and policy are checked against the institution\u2019s own rules before a person is asked to act on it.' },
  { title: 'Routed', detail: 'The routing rules pick the department, the approver and the response time this service carries.' },
  { title: 'Worked', detail: 'The desk that owns it works the case. Every status change, note and attachment is written to the trail as it happens.' },
  { title: 'Verified', detail: 'The requester confirms the outcome. A case cannot be closed by the person who did the work.' },
  { title: 'Closed, and still readable', detail: 'Who acted, when, under which policy, and how long each step took - readable months later.' },
]

/** Who the campus runs for. These are the three real roles in the deployment,
 *  not a marketing segmentation: every screen a person sees is decided by the
 *  permissions their role holds. */
const ROLES: { name: string; icon: string; detail: string }[] = [
  {
    name: 'Student',
    icon: '\u25c8',
    detail: 'Attendance, marks and timetable; requests and complaints; leave, clearance, library, fees and notices.',
  },
  {
    name: 'Teacher',
    icon: '\u25a4',
    detail: 'Own subjects and classes, attendance and marks entry, the departmental queue and the approvals that belong to it.',
  },
  {
    name: 'Management',
    icon: '\u25b0',
    detail: 'Runs the campus day to day - hostel and mess, fees, certificates, clearance, leave, the gate, announcements - and the deployment itself.',
  },
]

/** The words a visitor should be able to check. Each one is a property of this
 *  build, not a promise: the offline queue, the append-only trail and the
 *  permission checks are all in the source that produced the page. */
const PROOF: string[] = [
  'Offline-first',
  'Permanent activity log',
  'Permission-scoped screens',
  'Installable as an app',
]

/** The quick strip a campus portal is judged by: the handful of screens a
 *  student looks for first. Each link opens its own route; a visitor who is
 *  not signed in is carried to the sign-in door the same way every other
 *  deep link is. */
const QUICK_LINKS: { to: string; icon: string; label: string }[] = [
  { to: '/attendance', icon: 'attendance', label: 'Attendance' },
  { to: '/timetable', icon: 'timetable', label: 'Timetable' },
  { to: '/fees', icon: 'fees', label: 'Fees' },
  { to: '/notices', icon: 'notices', label: 'Notices' },
  { to: '/library', icon: 'library', label: 'Library' },
  { to: '/report', icon: 'report', label: 'Raise a request' },
]

/* ================================ PAGE ================================= */

export function LandingPage() {
  usePageMeta({
    title: 'Home',
    description:
      'The campus front door: what this institution takes requests for, the notice board, and how a request travels once it is made.',
  })

  const institution = useInstitution()
  const navigate = useNavigate()
  const sync = useSyncState()
  const { theme, setTheme, canChooseTheme } = useTheme()
  const summary = usePublicSummary()

  const identity = institution.config.identity
  const term = institution.config.academics.term_label
  const crest = institution.config.appearance.crest_url
  const noticesOn = featureOn(institution.config, 'notices')

  const place = [identity.kind, [identity.city, identity.region].filter(Boolean).join(', ')]
    .filter(Boolean)
    .join(' \u00b7 ')

  const data = summary.data
  const services = data?.services ?? []
  const notices = noticesOn ? data?.notices ?? [] : []

  return (
    <div className="landing-page">
      {/* ------------------------------------------------------------ BAR */}
      <header className="landing-top no-print">
        <Link to="/" className="sidebar-brand" style={{ marginBottom: 0 }}>
          {crest ? (
            <img className="brand-crest" src={crest} alt="" aria-hidden="true" />
          ) : (
            <span className="brand-mark" aria-hidden="true" data-monogram={institution.monogram} />
          )}
          <span className="brand-name">{institution.shortName}</span>
        </Link>

        <div className="landing-top-actions">
          <Badge tone={sync.online ? 'done' : 'warn'} className={sync.online ? 'pulse-beacon' : ''}>
            {sync.online ? 'Online' : 'Offline'}
          </Badge>
          {canChooseTheme ? (
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
                  <Icon name={option.symbol} size={16} />
                </button>
              ))}
            </div>
          ) : null}
          <Button variant="primary" size="sm" onClick={() => navigate('/login')}>
            Sign in
          </Button>
        </div>
      </header>

      <main id="main">
        {/* ---------------------------------------------------------- HERO */}
        <section className="landing-hero" aria-labelledby="landing-title">
          <div className="landing-wrap landing-hero-grid">
            <div className="landing-hero-copy">
              <div className="landing-kicker">
                <span className="hero-kicker-beacon" aria-hidden="true" />
                <span>{place}</span>
                {term ? <span className="landing-kicker-sep">/</span> : null}
                {term ? <span>{term}</span> : null}
              </div>

              <h1 id="landing-title" className="landing-title">
                {identity.name}
              </h1>

              <p className="landing-lede">{identity.tagline}</p>

              <p className="landing-sub">
                One place for the everyday work of a campus: who asked for what, who owns it, what
                it is waiting on, and how long it took. Built to keep working when the network
                does not.
              </p>

              <div className="landing-cta">
                <Button variant="primary" size="lg" onClick={() => navigate('/login')}>
                  Sign in
                </Button>
                <InstallApp size="lg" installedLabel="Installed on this device" />
              </div>

              <ul className="landing-proof list-reset">
                {PROOF.map((item) => (
                  <li key={item} className="stamp">
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* The identity plate: the crest, the code, the term and the live
                state of this device. It is the one block on the page that is
                about *this* deployment rather than about the product. */}
            <aside className="landing-id" aria-label="Institution and connection">
              <div className="landing-id-plate">
                {crest ? (
                  <img src={crest} alt={`${institution.shortName} crest`} className="landing-id-crest" />
                ) : (
                  <span className="landing-id-mark" aria-hidden="true">
                    {institution.monogram}
                  </span>
                )}
                <div className="landing-id-meta">
                  <span className="stencil muted">Institution code</span>
                  <span className="landing-id-code ident">{identity.code || institution.monogram}</span>
                </div>
              </div>

              <KV
                items={[
                  { label: 'Term', value: term || '—' },
                  { label: 'Type', value: identity.kind || '—' },
                  {
                    label: 'Location',
                    value: [identity.city, identity.region].filter(Boolean).join(', ') || '—',
                  },
                  {
                    label: 'Connection',
                    value: sync.online ? 'Online' : 'Offline — queued work is held on this device',
                  },
                ]}
              />

              <div className="landing-id-foot">
                <Badge tone={sync.pending + sync.retrying > 0 ? 'warn' : 'ghost'}>
                  {sync.pending + sync.retrying} queued
                </Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate(sync.online ? '/login?setup=1' : '/sync')}
                >
                  {sync.online ? 'Set up a station' : 'Open sync centre'}
                </Button>
              </div>
            </aside>
          </div>
        </section>

        {/* ------------------------------------------------------ QUICK LINKS */}
        <section className="landing-band" aria-labelledby="landing-quick">
          <div className="landing-wrap">
            <h2 id="landing-quick" className="sr-only">
              Quick links
            </h2>
            <nav className="landing-quick" aria-label="Quick links">
              {QUICK_LINKS.map((link) => (
                <Link key={link.to} to={link.to} className="landing-quick-link">
                  <span className="landing-quick-icon" aria-hidden="true">
                    <Icon name={link.icon} size={18} />
                  </span>
                  <span>{link.label}</span>
                </Link>
              ))}
            </nav>
          </div>
        </section>

        {/* --------------------------------------------------------- SCALE */}
        {data ? (
          <section className="landing-band" aria-labelledby="landing-scale">
            <div className="landing-wrap">
              <h2 id="landing-scale" className="sr-only">
                This deployment at a glance
              </h2>
              <div className="grid-metrics">
                <Metric
                  label={`${institution.word('department', { plural: true, fallback: 'Departments' })}`}
                  value={data.department_count}
                  hint="Own a queue and its deadlines"
                />
                <Metric
                  label="Services"
                  value={data.service_count}
                  hint="In the published catalogue"
                />
                <Metric label="Approval steps" value={data.workflow_count} hint="Routed step by step" />
                <Metric
                  label={institution.word('campus', { plural: true, fallback: 'Campuses' })}
                  value={data.campus_count}
                  hint="Resolved by scope, per person"
                />
              </div>
            </div>
          </section>
        ) : null}

        {/* ------------------------------------------------------ CATALOGUE */}
        <section className="landing-section" aria-labelledby="landing-services">
          <div className="landing-wrap">
            <div className="landing-section-head">
              <div>
                <div className="page-kicker">Service catalogue</div>
                <h2 id="landing-services">What this campus takes requests for</h2>
              </div>
              <p className="landing-section-note">
                Read live from the deployment. Each service carries its own approval steps, its own
                approver and its own deadline.
              </p>
            </div>

            {services.length ? (
              <div className="landing-services">
                {services.map((service) => (
                  <article className="landing-service" key={service.key}>
                    <div className="landing-service-head">
                      <span className="landing-service-icon" aria-hidden="true">
                        {service.icon}
                      </span>
                      <Badge tone="ghost">{titleCase(service.category)}</Badge>
                    </div>
                    <h3 className="landing-service-name">{service.name}</h3>
                    <p className="landing-service-detail">{service.description}</p>
                    <div className="landing-service-foot">
                      <span className="stencil muted">Answer due within</span>
                      <strong className="ident">{duration(service.sla_minutes)}</strong>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="landing-offline-note">
                {summary.loading
                  ? 'Reading the service catalogue…'
                  : 'The service catalogue could not be reached from this device. It appears here as soon as this device is online; signing in works offline either way.'}
              </p>
            )}
          </div>
        </section>

        {/* -------------------------------------------------------- NOTICES */}
        {noticesOn && notices.length ? (
          <section className="landing-section landing-section-alt" aria-labelledby="landing-notices">
            <div className="landing-wrap">
              <div className="landing-section-head">
                <div>
                  <div className="page-kicker">Notice board</div>
                  <h2 id="landing-notices">Published today and this week</h2>
                </div>
                <Button variant="ghost" size="sm" onClick={() => navigate('/notices')}>
                  All notices
                </Button>
              </div>

              <ul className="landing-notices list-reset">
                {notices.map((notice) => (
                  <li className="landing-notice" key={`${notice.title}-${notice.publish_at ?? ''}`}>
                    <div className="landing-notice-head">
                      <Badge tone={noticeTone(notice.notice_type) as Tone}>
                        {titleCase(notice.notice_type)}
                      </Badge>
                      <span className="tiny muted">{relative(notice.publish_at)}</span>
                    </div>
                    <h3 className="landing-notice-title">{notice.title}</h3>
                    {notice.summary ? <p className="landing-notice-summary">{notice.summary}</p> : null}
                  </li>
                ))}
              </ul>
            </div>
          </section>
        ) : null}

        {/* ----------------------------------------------------------- FLOW */}
        <section className="landing-section" aria-labelledby="landing-flow">
          <div className="landing-wrap">
            <div className="landing-section-head">
              <div>
                <div className="page-kicker">How it works</div>
                <h2 id="landing-flow">How a request travels</h2>
              </div>
              <p className="landing-section-note">
                Six moves, the same six in every service. Nothing is decided by a person who has not
                been given the permission to decide it.
              </p>
            </div>

            <ol className="landing-flow list-reset">
              {FLOW.map((step, index) => (
                <li className="landing-flow-step" key={step.title}>
                  <span className="landing-flow-index ident">{String(index + 1).padStart(2, '0')}</span>
                  <h3 className="landing-flow-title">{step.title}</h3>
                  <p className="landing-flow-detail">{step.detail}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ---------------------------------------------------------- ROLES */}
        <section className="landing-section landing-section-alt" aria-labelledby="landing-roles">
          <div className="landing-wrap">
            <div className="landing-section-head">
              <div>
                <div className="page-kicker">Who it is for</div>
                <h2 id="landing-roles">Three roles, and what each one sees</h2>
              </div>
              <p className="landing-section-note">
                A screen appears because a permission is held, never because a role was hardcoded
                into it. A hostel warden and a registrar hold the same role and see different
                campuses of work, because the server resolves scope per person.
              </p>
            </div>

            <div className="landing-roles">
              {ROLES.map((role) => (
                <article className="landing-role" key={role.name}>
                  <span className="landing-role-icon" aria-hidden="true">
                    {role.icon}
                  </span>
                  <h3 className="landing-role-name">{role.name}</h3>
                  <p className="landing-role-detail">{role.detail}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------- HONESTY */}
        <section className="landing-section" aria-labelledby="landing-honesty">
          <div className="landing-wrap">
            <Panel
              title="What this deployment is, honestly"
              subtitle="A front page that oversells the system behind it is the first thing a campus stops trusting."
            >
              <div className="grid-2">
                <KV
                  items={[
                    {
                      label: 'Dataset',
                      value: data?.demo_mode
                        ? 'Seeded demo campus (marked as such everywhere it appears)'
                        : 'Live campus data',
                    },
                    { label: 'Activity log', value: 'A record can be added, never rewritten' },
                    { label: 'Offline', value: sync.storageAvailable ? 'Queue held on this device' : sync.storageReason || 'Unavailable in this browser' },
                  ]}
                />
                <KV
                  items={[
                    { label: 'Messaging', value: 'In-app and push are live; SMS and WhatsApp report themselves as unconfigured unless keys are set' },
                    { label: 'Intelligence', value: 'Advisory only — every automated step still passes an authorisation check' },
                    { label: 'Sign-in', value: 'Decides what this account can see. Nothing on this page is personal data' },
                  ]}
                />
              </div>

              <div className="landing-honesty-foot">
                <Button variant="primary" onClick={() => navigate('/login')}>
                  Sign in to continue
                </Button>
                <Button variant="ghost" onClick={() => navigate('/guide')}>
                  Read the guide
                </Button>
              </div>
            </Panel>
          </div>
        </section>
      </main>

      {/* ---------------------------------------------------------- FOOTER */}
      <footer className="landing-foot">
        <div className="landing-wrap landing-foot-grid">
          <div>
            <div className="landing-foot-brand">
              <span className="brand-mark" aria-hidden="true" data-monogram={institution.monogram} />
              <div>
                <div className="bold">{identity.name}</div>
                <div className="tiny muted">
                  {[identity.kind, [identity.city, identity.region].filter(Boolean).join(', ')]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
              </div>
            </div>
            <p className="tiny muted landing-foot-note">
              {identity.website ? (
                <a href={identity.website} rel="noreferrer">
                  {identity.website}
                </a>
              ) : null}
            </p>
          </div>

          <div className="landing-foot-col">
            <span className="stencil muted">Helpdesk</span>
            {identity.support_email ? <span>{identity.support_email}</span> : null}
            {identity.support_phone ? <span className="ident">{identity.support_phone}</span> : null}
            {!identity.support_email && !identity.support_phone ? <span className="muted">Not published</span> : null}
          </div>

          <div className="landing-foot-col">
            <span className="stencil muted">This device</span>
            <span>{sync.online ? 'Online' : 'Offline'}</span>
            <span>
              {sync.pending + sync.retrying} change{sync.pending + sync.retrying === 1 ? '' : 's'} queued
            </span>
            <span className="muted">Last sync {sync.lastFlushAt ? relative(sync.lastFlushAt) : 'not yet'}</span>
          </div>

          <div className="landing-foot-col">
            <span className="stencil muted">The build</span>
            <span>Campus Relay</span>
            <span>{term || 'Current term'}</span>
            <span className="muted">{identity.code || institution.monogram}</span>
          </div>
        </div>
      </footer>
    </div>
  )
}

/** `ACADEMIC` reads as shouting in a sentence; `Academic` does not. The API
 *  speaks in enum keys and the page speaks in prose. */
function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((word) => word[0]!.toUpperCase() + word.slice(1))
    .join(' ')
}
