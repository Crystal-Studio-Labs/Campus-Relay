/** Guide & devices.
 *
 *  Three tabs, three jobs:
 *    Tours            - start any walkthrough, and switch the guide on or off
 *    Feature support  - what works on which device, and what deliberately does not
 *    Device preview   - the running app inside real device viewports (iframes,
 *                       not screenshots), so layout decisions can be checked
 *
 *  The preview is honest about one thing: the iframes share this browser's
 *  session and theme, because they are the same app on the same origin. What
 *  changes between them is the viewport, which is exactly what the layout logic
 *  reacts to.
 */

import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { DEVICE_PRESETS, FEATURE_MATRIX, TOURS } from '../lib/tours'
import { THEME_OPTIONS, useTheme, type TextChoice } from '../state/theme'
import { useGuide } from '../state/guide'
import { useInstitution } from '../state/institution'
import { DESIGN_ROADMAP, SKINS, roadmapCount } from '../theme/registry'
import { Badge, Button, Card, Field, PageHeader, SectionTitle, Select, Tabs } from '../components/ui'

type Tab = 'tours' | 'support' | 'devices' | 'themes'

const PREVIEW_ROUTES = [
  { value: '/', label: 'Student home' },
  { value: '/report', label: 'Raise a request' },
  { value: '/cases', label: 'Case list' },
  { value: '/notices', label: 'Notices' },
  { value: '/operations', label: 'Admin command centre' },
  { value: '/queue', label: 'Case queue' },
  { value: '/tasks', label: 'Staff tasks' },
  { value: '/gate', label: 'Gate desk' },
  { value: '/kiosk', label: 'Kiosk (no session needed)' },
  { value: '/sync', label: 'Offline & sync' },
]

export function GuidePage() {
  const navigate = useNavigate()
  // Deep-linkable tabs: a reviewer can link straight to the device lab, and the
  // selected tab survives a reload.
  const [params, setParams] = useSearchParams()
  const initial = (params.get('tab') as Tab) || 'tours'
  const [tab, setTab] = useState<Tab>(
    ['tours', 'support', 'devices', 'themes'].includes(initial) ? initial : 'tours',
  )
  const guide = useGuide()
  const theme = useTheme()

  return (
    <div className="stack-lg">
      <PageHeader
        title="Guide & devices"
        subtitle="Walk through any role's screens, see what works on which device, and preview the running app at real viewport sizes"
      />

      {/* --- Display settings: the fix for unreadable text ------------------ */}
      <Card accent="sun">
        <SectionTitle right={<Badge tone="ghost">applies everywhere</Badge>}>Reading & display</SectionTitle>
        <div className="grid" style={{ gap: 12 }}>
          <Field
            label="Theme"
            hint={
              theme.canChooseTheme
                ? THEME_OPTIONS.find((option) => option.id === theme.theme)?.hint
                : 'Your institution has fixed the theme for every device, so this switch is locked.'
            }
          >
            <div className="switcher" role="group" aria-label="Theme">
              {THEME_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className="symbol"
                  aria-pressed={theme.theme === option.id}
                  aria-label={option.hint}
                  title={option.hint}
                  disabled={!theme.canChooseTheme}
                  onClick={() => theme.setTheme(option.id)}
                >
                  <span aria-hidden="true">
                    {option.symbol} {option.label}
                  </span>
                </button>
              ))}
            </div>
          </Field>
          <Field
            label="Text size"
            hint="Large raises every font size by about 20% and loosens line height."
          >
            <div className="switcher" role="group" aria-label="Text size">
              {(['normal', 'large'] as TextChoice[]).map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={theme.text === option}
                  onClick={() => theme.setText(option)}
                >
                  {option === 'normal' ? 'Normal' : 'Large'}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Guided tours" hint="Off by default. The choice is remembered on this device.">
            <div className="switcher" role="group" aria-label="Guided tours">
              <button type="button" aria-pressed={!guide.enabled} onClick={() => guide.setEnabled(false)}>
                Off
              </button>
              <button type="button" aria-pressed={guide.enabled} onClick={() => guide.setEnabled(true)}>
                On
              </button>
            </div>
          </Field>
        </div>
        <p className="small" style={{ marginTop: 12, marginBottom: 0 }}>
          <strong>Both themes are held to the same contrast standard.</strong> Every status chip carries its word as
          well as its colour, so nothing depends on telling red from green, and "muted" text is a darker real colour
          rather than faded body text. Large text raises every size by about 20% and loosens line height.
        </p>
      </Card>

      <Tabs
        tabs={[
          { id: 'tours', label: 'Tours', count: TOURS.length },
          { id: 'support', label: 'Feature support' },
          { id: 'devices', label: 'Device preview' },
          { id: 'themes', label: 'Themes & roadmap', count: roadmapCount().total },
        ]}
        active={tab}
        onChange={(next) => {
          setTab(next)
          setParams(next === 'tours' ? {} : { tab: next })
        }}
      />

      {tab === 'tours' ? (
        <>
          {!guide.enabled ? (
            <div className="banner banner-info">
              <span className="grow">
                Guided tours are switched off. Turn them on to see the spotlight walkthroughs.
              </span>
              <Button size="sm" variant="primary" onClick={() => guide.setEnabled(true)}>
                Turn tours on
              </Button>
            </div>
          ) : null}
          {guide.tour ? (
            <div className="banner banner-agent">
              <span className="grow">
                Running: {guide.tour.name} — step {guide.stepIndex + 1} of {guide.stepCount}
                {guide.skipped.length ? ` (${guide.skipped.length} step(s) skipped: not on this screen)` : ''}
              </span>
              <Button size="sm" variant="ghost" onClick={guide.stop}>
                Stop
              </Button>
            </div>
          ) : null}

          <div className="card-columns">
            {TOURS.map((tour) => (
              <Card key={tour.id} as="article">
                <div className="card-head">
                  <Badge tone="agent">{tour.audience}</Badge>
                  {guide.completed.includes(tour.id) ? <Badge tone="done">completed</Badge> : null}
                </div>
                <h3 className="card-title">{tour.name}</h3>
                <p className="small muted">{tour.summary}</p>
                <div className="small muted">{tour.steps.length} steps</div>
                <div className="card-actions">
                  <Button
                    variant="agent"
                    onClick={() => {
                      guide.setEnabled(true)
                      navigate(tour.route)
                      // Let the screen mount before the first spotlight is placed.
                      window.setTimeout(() => guide.start(tour.id), 350)
                    }}
                  >
                    Start tour
                  </Button>
                  <Button variant="ghost" onClick={() => navigate(tour.route)}>
                    Open screen
                  </Button>
                </div>
              </Card>
            ))}
          </div>

          <Card className="card-flat">
            <SectionTitle>How the guide behaves</SectionTitle>
            <ul className="small">
              <li>Off until you switch it on, and remembered per device.</li>
              <li>Steps whose element is not on the current screen are skipped, never stalled on.</li>
              <li>Arrow keys move between steps, Escape exits at any point.</li>
              <li>The dimmed area stays inert — only the tip card takes clicks, so you can never be trapped.</li>
              <li>Nothing is sent to the server: the guide is local, and it writes no case data.</li>
            </ul>
          </Card>
        </>
      ) : null}

      {tab === 'support' ? (
        <>
          <Card>
            <SectionTitle right={<Badge tone="ghost">honest, including the gaps</Badge>}>
              What works where
            </SectionTitle>
            <div className="table-wrap become-cards">
              <table className="data">
                <thead>
                  <tr>
                    <th>Feature</th>
                    <th>Mobile</th>
                    <th>Tablet</th>
                    <th>Desktop</th>
                    <th>Kiosk</th>
                    <th>Offline</th>
                  </tr>
                </thead>
                <tbody>
                  {FEATURE_MATRIX.map((row) => (
                    <tr key={row.feature}>
                      <td data-label="Feature">
                        <div className="bold">{row.feature}</div>
                        <div className="tiny muted">{row.note}</div>
                      </td>
                      {[row.mobile, row.tablet, row.desktop, row.kiosk, row.offline].map((value, index) => (
                        <td key={index} data-label={['Mobile', 'Tablet', 'Desktop', 'Kiosk', 'Offline'][index]}>
                          <span className={value.startsWith('no') ? 'support-no' : 'support-yes'}>{value}</span>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="card-columns">
            <Card>
              <SectionTitle>Same product, different experiences</SectionTitle>
              <ul className="small">
                <li>
                  <strong>Student (phone):</strong> bottom tabs, one primary action per screen, requests filable with no
                  signal.
                </li>
                <li>
                  <strong>Staff (phone):</strong> their own queue ordered by what will breach first; start and finish
                  work offline.
                </li>
                <li>
                  <strong>Security (phone, one hand):</strong> one input, one huge verdict, offline movements queued and
                  verification refused rather than guessed.
                </li>
                <li>
                  <strong>Admin (desktop):</strong> sidebar, dense tables, bulk escalation, analytics, audit trail.
                </li>
                <li>
                  <strong>Kiosk (shared tablet):</strong> no navigation, giant targets, idle reset so the next student
                  never sees the last one's data.
                </li>
                <li>
                  <strong>Helpdesk (counter):</strong> search a student, file on their behalf, print a receipt; the
                  channel is recorded so assisted access is visible in the analytics.
                </li>
              </ul>
            </Card>

            <Card>
              <SectionTitle>Where the layout switches</SectionTitle>
              <ul className="small">
                <li>
                  <strong>≤ 720px:</strong> mobile shell — bottom navigation, single column, filter grids stack, dense
                  tables become cards rather than sideways scrolls.
                </li>
                <li>
                  <strong>721–1024px:</strong> tablet — sidebar appears, card grids go two-up, forms get two columns.
                </li>
                <li>
                  <strong>1025–1440px:</strong> desktop — the admin queue and audit trail are designed for this width.
                </li>
                <li>
                  <strong>&gt; 1440px:</strong> workstation — three-column card grid and a wider page container.
                </li>
                <li>
                  <strong>Short landscape:</strong> the bottom bar stops being fixed so it cannot eat the content.
                </li>
              </ul>
            </Card>
          </div>
        </>
      ) : null}

      {tab === 'devices' ? <DeviceLab /> : null}

      {tab === 'themes' ? <ThemeBoard /> : null}
    </div>
  )
}

/** The design system and what comes next.
 *
 *  Kept in the product rather than in a document, because the request an
 *  adopting college makes most often is not a bug report: it is "our college
 *  wants it to look like this instead". The answer is that the look is a token
 *  set, and this tab shows what exists, what is planned and what each costs. */
function ThemeBoard() {
  const theme = useTheme()
  const institution = useInstitution()
  const counts = roadmapCount()

  return (
    <>
      <Card accent="sun">
        <SectionTitle right={<Badge tone="ghost">two axes, kept apart</Badge>}>
          How the look is decided
        </SectionTitle>
        <div className="card-columns">
          <Card className="card-flat">
            <div className="card-head">
              <h3 className="card-title">Theme = comfort</h3>
              <Badge tone="open">now: {theme.theme}</Badge>
            </div>
            <p className="small muted" style={{ marginBottom: 0 }}>
              Light and dark. Exactly two, chosen by the person using the screen and remembered on the device.
              Both are held to the same contrast standard, so nothing is legible in one and murky in the other.
            </p>
          </Card>
          <Card className="card-flat">
            <div className="card-head">
              <h3 className="card-title">Skin = identity</h3>
              <Badge tone="blocked">configured: {institution.config.appearance.skin}</Badge>
            </div>
            <p className="small muted" style={{ marginBottom: 0 }}>
              The design language of the deployment: shape, borders, density, type treatment, whether structure is
              visible. Set once per institution in <span className="ident">config/institution.json</span>.
            </p>
          </Card>
        </div>
        <p className="note" style={{ marginTop: 'var(--sp-4)' }}>
          They are independent on purpose. A college that wants a government-portal look keeps dark mode, keeps large
          text, keeps every contrast guarantee — because the palette lives in the theme layer and only the structural
          tokens change in a skin.
        </p>
      </Card>

      <Card>
        <SectionTitle right={<Badge tone="ghost">{counts.shipped} of {SKINS.length} implemented</Badge>}>
          Registered design languages
        </SectionTitle>
        <div className="card-columns">
          {SKINS.map((entry) => (
            <article key={entry.id} className="card">
              <div className="card-head">
                <h3 className="card-title">{entry.name}</h3>
                <Badge tone={entry.status === 'shipped' ? 'done' : 'blocked'}>{entry.status}</Badge>
              </div>
              <p className="small">{entry.summary}</p>
              <ul className="small muted" style={{ paddingInlineStart: 'var(--sp-5)', listStyle: 'disc' }}>
                {entry.characteristics.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              {entry.requestedBy ? <p className="hint">{entry.requestedBy}</p> : null}
            </article>
          ))}
        </div>
      </Card>

      {DESIGN_ROADMAP.map((group) => (
        <Card key={group.group}>
          <SectionTitle right={<Badge tone="ghost">{group.items.length} planned</Badge>}>
            {group.group}
          </SectionTitle>
          <div className="card-columns">
            {group.items.map((item) => (
              <article key={item.title} className="card card-flat">
                <div className="card-head">
                  <h3 className="card-title">{item.title}</h3>
                  <Badge tone="progress">{item.effort}</Badge>
                </div>
                <p className="small muted" style={{ marginBottom: 0 }}>
                  {item.detail}
                </p>
              </article>
            ))}
          </div>
        </Card>
      ))}
    </>
  )
}

function DeviceLab() {
  const [route, setRoute] = useState('/')
  const [selected, setSelected] = useState<string[]>(['phone', 'tablet', 'laptop'])
  const [nonce, setNonce] = useState(0)
  const theme = useTheme()

  const presets = DEVICE_PRESETS.filter((preset) => selected.includes(preset.id))

  return (
    <>
      <Card>
        <div className="grid" style={{ gap: 12 }}>
          <Field label="Screen to preview" hint="Kiosk needs no session; every other option uses your current account.">
            <Select value={route} onChange={setRoute} options={PREVIEW_ROUTES} />
          </Field>
          <Field label="Devices shown">
            <div className="row wrap" style={{ gap: 8 }}>
              {DEVICE_PRESETS.map((preset) => {
                const on = selected.includes(preset.id)
                return (
                  <Button
                    key={preset.id}
                    size="sm"
                    variant={on ? 'primary' : 'ghost'}
                    onClick={() =>
                      setSelected((current) =>
                        current.includes(preset.id)
                          ? current.filter((id) => id !== preset.id)
                          : [...current, preset.id],
                      )
                    }
                  >
                    {preset.label.split('—')[0].trim()}
                  </Button>
                )
              })}
            </div>
          </Field>
        </div>
        <div className="row wrap" style={{ marginTop: 12 }}>
          <Button variant="info" onClick={() => setNonce((value) => value + 1)}>
            Reload previews
          </Button>
          <Button variant="ghost" onClick={() => window.open(route, '_blank')}>
            Open {route} in a new tab
          </Button>
          <Badge tone="ghost">
            theme: {theme.theme === 'dark' ? '☾ dark' : '☀ light'} · text: {theme.text}
          </Badge>
        </div>
        <p className="small muted" style={{ marginTop: 8, marginBottom: 0 }}>
          These are the running app itself, not mockups: each frame is an iframe at a device width, so the same layout
          logic that runs on a real phone decides what you see. They share this browser's saved theme and signed-in
          account, so change the theme above and reload to compare.
        </p>
      </Card>

      <div className="device-stage">
        {presets.map((preset) => {
          const scale = Math.min(1, 760 / preset.width)
          const displayWidth = preset.width * scale
          const displayHeight = preset.height * scale
          return (
            <div key={preset.id} className="device-frame" style={{ width: displayWidth + 26 }}>
              <div style={{ width: displayWidth, height: displayHeight, overflow: 'hidden' }}>
                <iframe
                  key={`${preset.id}-${nonce}`}
                  title={`${preset.label} preview of ${route}`}
                  src={route}
                  width={preset.width}
                  height={preset.height}
                  style={{
                    transform: `scale(${scale})`,
                    transformOrigin: 'top left',
                    width: preset.width,
                    height: preset.height,
                  }}
                />
              </div>
              <div className="device-caption">{preset.label}</div>
              <p className="device-notes">{preset.note}</p>
            </div>
          )
        })}
      </div>

      <Card className="card-flat">
        <SectionTitle>Try this, in this order</SectionTitle>
        <ol className="small">
          <li>Tap the <strong>☀ / ☾</strong> switch and turn on <strong>Large</strong> text — that is the readability fix in one step, and it applies to every screen.</li>
          <li>Preview <strong>Raise a request</strong> on the phone frame, then on the laptop frame: same screen, different navigation.</li>
          <li>Preview <strong>Case queue</strong> on the phone frame: the dense table becomes cards, no sideways scrolling.</li>
          <li>Preview <strong>Kiosk</strong> — no session, giant targets, and it resets itself after 90 idle seconds.</li>
          <li>Turn the guide on, open a screen, and use "Tour this screen" to see the spotlight follow the layout across sizes.</li>
        </ol>
      </Card>
    </>
  )
}
