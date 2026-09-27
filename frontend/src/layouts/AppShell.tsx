/** The application shell.
 *
 *  One shell, three shapes. The navigation a person gets is a function of their
 *  role and permissions; the *form* of that navigation is a function of the
 *  device: bottom tabs on a phone, a rail on a desktop. A student on Android and
 *  an administrator on a desktop are not given the same layout at different
 *  widths - they get different navigation entirely.
 *
 *  Structure, top to bottom, and the same on every screen:
 *
 *    brand plate | station strip | page header | sections
 *
 *  The station strip is the part that was missing before: it states which
 *  institution, campus, role and channel the screen belongs to, once, under the
 *  top bar, so no screen has to repeat its own context.
 */

import { Fragment, useEffect, useMemo, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { LANGUAGES, currentLanguage, setLanguage, t, type LanguageCode } from '../lib/i18n'
import { currentChannel, currentDeviceMode, setChannel } from '../lib/api'
import { relative } from '../lib/format'
import { buildNav, dedupeNav, flattenNav, resolveBreadcrumb, COMMAND_CENTRE_ROLES } from '../lib/navigation'
import { useSession, useViewport } from '../state/session'
import { useSyncState } from '../state/hooks'
import { useInstitution } from '../state/institution'
import { THEME_OPTIONS, useTheme } from '../state/theme'
import { shippedSkins, skinMeta, type ThemeId } from '../theme/registry'
import { Badge, Button, Modal, Select } from '../components/ui'
import { GuideControls } from '../components/Guide'
import { ConnectivityBar, SyncCentreSheet } from '../components/OfflineBar'
import { CommandPalette } from '../components/CommandPalette'

/** Re-exported so a route guard and the navigation agree on who runs the
 *  campus as a whole. The list itself lives with the architecture. */
export { COMMAND_CENTRE_ROLES }

export function AppShell() {
  const { profile, logout, can } = useSession()
  const { viewport } = useViewport()
  const sync = useSyncState()
  const navigate = useNavigate()
  const location = useLocation()
  const institution = useInstitution()
  const [menuOpen, setMenuOpen] = useState(false)
  const [syncOpen, setSyncOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)

  useEffect(() => {
    setChannel('PWA')
  }, [])

  // The architecture lives in one module; the shell renders it. Institution
  // module switches and the person's permissions both filter it here.
  const groups = useMemo(
    () => dedupeNav(buildNav(can, profile?.role ?? null, institution.config.features)),
    [can, profile?.role, institution.config.features],
  )
  const items = groups.flatMap((group) => group.items)
  const breadcrumb = resolveBreadcrumb(location.pathname, groups)
  const isMobile = viewport === 'mobile'
  // The most-used items are pinned to the phone's bottom bar, so the guide and
  // sync pages do not steal a slot from Home, Cases or Notices.
  const bottomBar = items
    .filter((item) => ['/', '/report', '/cases', '/notices', '/notifications', '/tasks', '/gate'].includes(item.to))
    .slice(0, 5)

  const totalQueued = sync.pending + sync.retrying

  // Ctrl/Cmd-K opens a quick switcher over the pages this person can actually
  // reach. It navigates; it does not pretend to search data it has no index for.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setPaletteOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>

      {!isMobile ? (
        <nav className="sidebar no-print" aria-label="Main">
          <BrandPlate />
          {groups.map((group) => (
            <Fragment key={group.label}>
              <div className="nav-group-label">{group.label}</div>
              {group.items.map((item) => (
                <NavLink key={item.to} to={item.to} end={item.to === '/'} className="nav-link">
                  <span aria-hidden="true">{item.icon}</span>
                  <span className="truncate">{item.label}</span>
                </NavLink>
              ))}
            </Fragment>
          ))}
          <hr className="divider" />
          <div className="small muted" style={{ padding: `0 var(--sp-2)` }}>
            {profile?.full_name}
            <br />
            {profile?.role.replaceAll('_', ' ').toLowerCase()}
          </div>
          <div className="stack" style={{ marginTop: 'var(--sp-3)', gap: 'var(--sp-2)', padding: '0 var(--sp-2)' }}>
            <Button size="sm" variant="ghost" onClick={() => setSyncOpen(true)}>
              Sync: {sync.online ? 'online' : 'offline'} ({totalQueued})
            </Button>
            <Button size="sm" variant="default" onClick={() => navigate('/notifications')}>
              Alerts
            </Button>
            <Button size="sm" variant="danger" onClick={logout}>
              {t('nav.logout')}
            </Button>
          </div>
        </nav>
      ) : null}

      <div className="app-main">
        <header className="topbar no-print">
          {isMobile ? (
            <div className="grow">
              <BrandPlate />
            </div>
          ) : (
            <div className="grow row" style={{ gap: 'var(--sp-2)' }}>
              <Badge tone={sync.online ? 'done' : 'warn'} className={sync.online ? 'pulse-beacon' : ''}>
                {sync.online ? 'Online' : 'Offline'}
              </Badge>
              {totalQueued > 0 ? <Badge tone="open">{totalQueued} queued</Badge> : null}
              {sync.conflicts + sync.requiresAction > 0 ? (
                <Badge tone="urgent">{sync.conflicts + sync.requiresAction} need attention</Badge>
              ) : null}
              <span className="small muted nowrap">
                Last sync {sync.lastFlushAt ? relative(sync.lastFlushAt) : '—'}
              </span>
            </div>
          )}
          {!isMobile ? (
            <button type="button" className="jump" onClick={() => setPaletteOpen(true)}>
              <span aria-hidden="true">⌕</span>
              <span className="jump-label">Jump to…</span>
              <kbd className="jump-kbd">Ctrl K</kbd>
            </button>
          ) : null}
          {!isMobile ? <GuideControls compact /> : null}
          <ThemeSwitcher />
          <LanguagePicker />
          <Button variant="ghost" size="sm" onClick={() => setMenuOpen(true)} ariaLabel="Account menu">
            {profile?.full_name?.split(' ')[0] ?? 'Account'}
          </Button>
        </header>

        {/* The station strip: which institution, which campus, which station and
            which channel this screen belongs to. Stated once, for every screen. */}
        <div className="station-strip no-print">
          <span>
            <strong>{institution.config.identity.name}</strong>
          </span>
          <span>{profile?.campus?.name ?? '—'}</span>
          <span>{institution.config.academics.term_label}</span>
          <span>{profile?.role.replaceAll('_', ' ').toLowerCase()}</span>
          <span>Channel {currentChannel()}</span>
          <span>{currentDeviceMode() === 'personal' ? 'Personal device' : `${currentDeviceMode()} station`}</span>
        </div>

        <ConnectivityBar />

        {/* Breadcrumb: which module and screen this is, on every page, so the
            answer to "where am I?" never depends on the sidebar being visible. */}
        {breadcrumb ? (
          <nav className="breadcrumb no-print" aria-label="Breadcrumb">
            <span className="breadcrumb-group">{breadcrumb.group}</span>
            <span className="breadcrumb-sep" aria-hidden="true">
              /
            </span>
            <span className="breadcrumb-current" aria-current="page">
              {breadcrumb.label}
            </span>
          </nav>
        ) : null}

        <main id="main" className="page">
          {/* Keyed on the path so each navigation plays a short enter motion.
              It is a settle, not a flourish - and it is skipped entirely for
              anyone who has asked for reduced motion. */}
          <div className="page-transition" key={location.pathname}>
            <Outlet />
          </div>
        </main>

        {isMobile ? (
          <nav className="bottom-nav no-print" aria-label="Main">
            {bottomBar.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.to === '/'}>
                <span aria-hidden="true" className="dot">
                  {item.icon}
                </span>
                <span>{item.label.split(' ')[0]}</span>
              </NavLink>
            ))}
          </nav>
        ) : null}
      </div>

      <SyncCentreSheet open={syncOpen} onClose={() => setSyncOpen(false)} />

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        entries={flattenNav(groups)}
        onSelect={(to) => {
          setPaletteOpen(false)
          navigate(to)
        }}
      />

      <Modal open={menuOpen} onClose={() => setMenuOpen(false)} title="Your account">
        <div className="stack">
          <div>
            <div className="label">Reading</div>
            <ThemeSwitcher block />
            <DisplayControls />
            <div style={{ marginTop: 'var(--sp-2)' }}>
              <GuideControls />
            </div>
          </div>
          {can('config:manage') ? (
            <>
              <hr className="divider" />
              <div>
                <div className="label">Design language</div>
                <SkinPicker />
                <p className="hint" style={{ marginTop: 'var(--sp-2)' }}>
                  A preview on this device only. The institution default is set in the institution
                  configuration; the full list, including the skins planned for other colleges, is on
                  the Institution setup screen.
                </p>
              </div>
            </>
          ) : null}
          <hr className="divider" />
          <div>
            <div className="bold">{profile?.full_name}</div>
            <div className="small muted">{profile?.email}</div>
            <div className="small muted">
              {profile?.role.replaceAll('_', ' ').toLowerCase()} · {profile?.campus?.name}
            </div>
          </div>
          <hr className="divider" />
          <div className="row-between">
            <span>Connected</span>
            <Badge tone={sync.online ? 'done' : 'warn'}>{sync.online ? 'Online' : 'Offline'}</Badge>
          </div>
          <div className="row-between">
            <span>Queued changes</span>
            <span className="bold">{totalQueued}</span>
          </div>
          <button type="button" className="btn btn-danger" onClick={logout}>
            {t('nav.logout')}
          </button>
        </div>
      </Modal>
    </div>
  )
}

/** The brand plate. It carries the institution's monogram and short name from
 *  the configuration, never a literal, so adopting the template renames the
 *  product everywhere at once. */
function BrandPlate() {
  const institution = useInstitution()
  const crest = institution.config.appearance.crest_url
  return (
    <Link to="/" className="sidebar-brand" title={institution.config.identity.name}>
      {crest ? (
        <img className="brand-crest" src={crest} alt="" aria-hidden="true" />
      ) : (
        <span className="brand-mark" aria-hidden="true" data-monogram={institution.monogram} />
      )}
      <span className="brand-name">{institution.shortName}</span>
    </Link>
  )
}

/** Theme switch: a sun and a moon. Symbols read instantly, need no translation,
 *  and both keep an accessible label so screen readers still get the words.
 *  When an institution locks the theme the switch is shown disabled with the
 *  reason, rather than hidden - a missing control is a mystery, a locked one is
 *  an explanation. */
function ThemeSwitcher({ block }: { block?: boolean }) {
  const { theme, setTheme, canChooseTheme } = useTheme()
  return (
    <div
      className="switcher"
      role="group"
      aria-label="Theme"
      style={block ? { width: '100%' } : undefined}
      title={canChooseTheme ? undefined : 'Your institution has fixed the theme for all devices.'}
    >
      {THEME_OPTIONS.map((option) => (
        <button
          key={option.id}
          type="button"
          className="symbol"
          aria-pressed={theme === option.id}
          aria-label={option.hint}
          disabled={!canChooseTheme}
          onClick={() => setTheme(option.id as ThemeId)}
        >
          <span aria-hidden="true">{option.symbol}</span>
        </button>
      ))}
    </div>
  )
}

/** Text size, density and an explicit high-contrast switch. These are the
 *  accessibility choices that belong to the person reading the screen, kept
 *  next to the theme rather than buried in a browser setting. */
function DisplayControls() {
  const { text, setText, density, setDensity, contrast, setContrast } = useTheme()
  return (
    <div className="stack" style={{ gap: 'var(--sp-2)', marginTop: 'var(--sp-3)' }}>
      <div className="row wrap" style={{ gap: 'var(--sp-2)' }}>
        <Badge tone="ghost">Text</Badge>
        <Button size="sm" variant={text === 'normal' ? 'primary' : 'ghost'} onClick={() => setText('normal')}>
          Normal
        </Button>
        <Button size="sm" variant={text === 'large' ? 'primary' : 'ghost'} onClick={() => setText('large')}>
          Large
        </Button>
      </div>
      <div className="row wrap" style={{ gap: 'var(--sp-2)' }}>
        <Badge tone="ghost">Spacing</Badge>
        <Button
          size="sm"
          variant={density === 'comfortable' ? 'primary' : 'ghost'}
          onClick={() => setDensity('comfortable')}
        >          Comfortable
        </Button>
        <Button size="sm" variant={density === 'compact' ? 'primary' : 'ghost'} onClick={() => setDensity('compact')}>
          Compact
        </Button>
      </div>
      <div className="row wrap" style={{ gap: 'var(--sp-2)' }}>
        <Badge tone="ghost">Contrast</Badge>
        <Button
          size="sm"
          variant={contrast === 'normal' ? 'primary' : 'ghost'}
          onClick={() => setContrast('normal')}
        >
          Standard
        </Button>
        <Button size="sm" variant={contrast === 'high' ? 'primary' : 'ghost'} onClick={() => setContrast('high')}>
          High
        </Button>
      </div>
    </div>
  )
}

/** Design-language preview. Only the skins that are actually implemented are
 *  offered; the planned ones are listed on the setup screen instead, because a
 *  switch that does nothing is worse than no switch. */
function SkinPicker() {
  const { skin, setSkin } = useTheme()
  const institution = useInstitution()
  return (
    <div className="stack" style={{ gap: 'var(--sp-1)' }}>
      <Select
        value={skin}
        options={shippedSkins().map((entry) => ({ value: entry.id, label: entry.name }))}
        onChange={setSkin}
        id="skin-picker"
      />
      <p className="hint">{skinMeta(skin)?.summary ?? institution.config.appearance.skin}</p>
    </div>
  )
}

function LanguagePicker() {
  const institution = useInstitution()
  const [language, setLocal] = useState<LanguageCode>(currentLanguage())
  // Only the languages the institution offers are selectable, in the order the
  // configuration lists them.
  const offered = institution.config.localisation.languages
  const options = LANGUAGES.filter((entry) => offered.includes(entry.code)).map((entry) => ({
    value: entry.code,
    label: entry.native,
  }))
  if (options.length <= 1) return null
  return (
    <div className="no-print" style={{ minWidth: 132 }}>
      <label className="sr-only" htmlFor="language-picker">
        {t('language.label')}
      </label>
      <Select
        id="language-picker"
        value={language}
        options={options}
        onChange={(value) => {
          setLanguage(value as LanguageCode)
          setLocal(value as LanguageCode)
        }}
      />
    </div>
  )
}
