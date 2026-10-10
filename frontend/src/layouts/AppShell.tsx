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
import { LANGUAGES, currentLanguage, setLanguage, useLanguage, type LanguageCode } from '../lib/i18n'
import { currentChannel, currentDeviceMode, setChannel } from '../lib/api'
import { relative } from '../lib/format'
import { buildNav, dedupeNav, flattenNav, resolveBreadcrumb, COMMAND_CENTRE_ROLES } from '../lib/navigation'
import { useSession, useViewport } from '../state/session'
import { useSyncState } from '../state/hooks'
import { useInstitution } from '../state/institution'
import { THEME_OPTIONS, useTheme } from '../state/theme'
import { type ThemeId } from '../theme/registry'
import { Badge, Button, Modal, Select } from '../components/ui'
import { Icon } from '../components/Icon'
import { InstallApp } from '../components/InstallApp'
import { GuideControls } from '../components/Guide'
import { ConnectivityBar, SyncCentreSheet } from '../components/OfflineBar'
import { CommandPalette } from '../components/CommandPalette'

/** Re-exported so a route guard and the navigation agree on who runs the
 *  campus as a whole. The list itself lives with the architecture. */
export { COMMAND_CENTRE_ROLES }

export function AppShell() {
  const { profile, logout, can } = useSession()
  // Reactive translator: the navigation, breadcrumb and phone bar all resolve
  // their label keys through this, so switching language redraws the whole shell
  // rather than only the screens that happen to re-mount.
  const { t } = useLanguage()
  const { viewport } = useViewport()
  const sync = useSyncState()
  const navigate = useNavigate()
  const location = useLocation()
  const institution = useInstitution()
  const [menuOpen, setMenuOpen] = useState(false)
  const [syncOpen, setSyncOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  /** The phone's rail is a drawer, so it needs to know whether it is open. */
  const [navOpen, setNavOpen] = useState(false)
  /** Desktop rail: collapse to icons. Remembered per device, because it is a
   *  preference about the screen, not about the person. */
  const [railCollapsed, setRailCollapsed] = useState(
    () => localStorage.getItem('campusrelay.rail') === 'collapsed',
  )

  useEffect(() => {
    setChannel('PWA')
  }, [])

  useEffect(() => {
    localStorage.setItem('campusrelay.rail', railCollapsed ? 'collapsed' : 'expanded')
  }, [railCollapsed])

  // The architecture lives in one module; the shell renders it. Institution
  // module switches and the person's permissions both filter it here.
  const groups = useMemo(
    () => dedupeNav(buildNav(can, profile?.role ?? null, institution.config.features)),
    [can, profile?.role, institution.config.features],
  )
  const breadcrumb = resolveBreadcrumb(location.pathname, groups)
  const isMobile = viewport === 'mobile'

  const totalQueued = sync.pending + sync.retrying

  // Ctrl/Cmd-K opens a quick switcher over the pages this person can actually
  // reach. It navigates; it does not pretend to search data it has no index for.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setPaletteOpen(true)
      }
      // Escape is the other half of "open": a drawer you cannot dismiss from the
      // keyboard is a trap for anyone not reaching for the screen.
      if (event.key === 'Escape') setNavOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // The drawer must not outlive the navigation it opened for: changing screen
  // closes it, so tapping a link never strands you behind the scrim.
  useEffect(() => {
    setNavOpen(false)
  }, [location.pathname])

  // One rail body, two mounts. The phone used to get a five-item bottom bar
  // instead of this list, which meant most of the application - desks, settings,
  // profile - was simply unreachable on a handset. Sharing one body is what
  // stops the two layouts from drifting into different products.
  const railBody = (
    <>
      <BrandPlate />
      {groups.map((group) => (
        <Fragment key={group.id}>
          <div className="nav-group-label">{t(group.labelKey)}</div>
          {group.items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className="nav-link"
              title={t(item.labelKey)}
            >
              <span className="nav-link-icon" aria-hidden="true">
                <Icon name={item.icon} size={18} />
              </span>
              <span className="nav-link-label truncate">{t(item.labelKey)}</span>
            </NavLink>
          ))}
        </Fragment>
      ))}
      <div className="nav-foot">
        <div className="rail-user">
          <span className="rail-avatar" aria-hidden="true">
            {initials(profile?.full_name)}
          </span>
          <span className="rail-user-text">
            <span className="rail-user-name truncate">{profile?.full_name}</span>
            <span className="rail-user-role truncate">
              {profile?.role.replaceAll('_', ' ').toLowerCase()}
            </span>
          </span>
        </div>
        <div className="rail-actions">
          <button type="button" className="icon-btn" onClick={() => setSyncOpen(true)} title={t('shell.sync')}>
            <Icon name={sync.online ? 'wifi' : 'wifiOff'} size={18} label={t('shell.sync')} />
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={() => navigate('/notifications')}
            title={t('shell.alerts')}
          >
            <Icon name="bell" size={18} label={t('shell.alerts')} />
          </button>
          <div className="rail-install">
            <InstallApp size="sm" />
          </div>
          <button type="button" className="icon-btn rail-logout" onClick={logout} title={t('nav.logout')}>
            <Icon name="logout" size={18} label={t('nav.logout')} />
          </button>
        </div>
      </div>
    </>
  )

  return (
    <div className="shell">
      <a className="skip-link" href="#main">
        {t('shell.skipToContent')}
      </a>

      {!isMobile ? (
        <nav
          className={`sidebar no-print${railCollapsed ? ' is-collapsed' : ''}`}
          aria-label={t('shell.mainNav')}
          data-guide="shell-nav"
        >
          {railBody}
        </nav>
      ) : null}

      {/* Phone: the same rail, as a drawer. Rendered only while open so no link
          inside it can be tabbed to while the drawer is off-screen. */}
      {isMobile && navOpen ? (
        <div className="nav-drawer-root">
          <div className="nav-scrim" onClick={() => setNavOpen(false)} />
          <nav id="mobile-nav-drawer" className="sidebar nav-drawer no-print" aria-label={t('shell.mainNav')}>
            <div className="nav-drawer-head">
              <span className="nav-drawer-title">{t('shell.mainNav')}</span>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setNavOpen(false)}
                aria-label={t('shell.closeMenu')}
                title={t('shell.closeMenu')}
              >
                <Icon name="close" size={18} />
              </button>
            </div>
            {railBody}
          </nav>
        </div>
      ) : null}

      <div className="app-main">
        <header className="topbar no-print">
          {isMobile ? (
            <>
              <button
                type="button"
                className="jump jump-compact nav-toggle"
                data-guide="shell-nav-toggle"
                onClick={() => setNavOpen(true)}
                aria-label={t('shell.openMenu')}
                aria-expanded={navOpen}
                // The drawer only exists while it is open, so the id must not be
                // referenced before it exists in the accessibility tree.
                aria-controls={navOpen ? 'mobile-nav-drawer' : undefined}
                title={t('shell.openMenu')}
              >
                <Icon name="menu" size={18} />
              </button>
              <div className="grow">
                <BrandPlate />
              </div>
            </>
          ) : (
            <div className="grow row" style={{ gap: 'var(--sp-2)' }}>
              <button
                type="button"
                className="icon-btn rail-toggle"
                onClick={() => setRailCollapsed((value) => !value)}
                aria-pressed={railCollapsed}
                aria-label={t('shell.mainNav')}
                title={t('shell.mainNav')}
              >
                <Icon name="menu" size={18} />
              </button>
              <Badge tone={sync.online ? 'done' : 'warn'} className={sync.online ? 'pulse-beacon' : ''}>
                {sync.online ? t('shell.online') : t('shell.offline')}
              </Badge>
              {totalQueued > 0 ? <Badge tone="open">{totalQueued} {t('shell.queued')}</Badge> : null}
              {sync.conflicts + sync.requiresAction > 0 ? (
                <Badge tone="urgent">{sync.conflicts + sync.requiresAction} {t('shell.needAttention')}</Badge>
              ) : null}
              <span className="small muted nowrap">
                {t('shell.lastSync')} {sync.lastFlushAt ? relative(sync.lastFlushAt) : sync.online ? t('shell.justNow') : '—'}
              </span>
            </div>
          )}
          {/* The quick switcher is the fastest way around the app with one
              hand, so a phone gets it too - as a glyph, since there is no
              keyboard to press there. */}
          {isMobile ? (
            <button
              type="button"
              className="icon-btn"
              data-guide="shell-search"
              onClick={() => setPaletteOpen(true)}
              aria-label={t('shell.jumpToScreen')}
              title={t('shell.jumpToScreen')}
            >
              <Icon name="search" size={18} />
            </button>
          ) : (
            <button type="button" className="jump" data-guide="shell-search" onClick={() => setPaletteOpen(true)}>
              <Icon name="search" size={16} />
              <span className="jump-label">{t('shell.jumpTo')}</span>
              <kbd className="jump-kbd">Ctrl K</kbd>
            </button>
          )}
          {!isMobile ? <GuideControls compact /> : null}
          <ThemeSwitcher />
          <LanguagePicker />
          <button
            type="button"
            className="account-btn"
            onClick={() => setMenuOpen(true)}
            aria-label={t('shell.accountMenu')}
            title={t('shell.accountMenu')}
            data-guide="shell-account"
          >
            <span className="account-avatar" aria-hidden="true">
              {initials(profile?.full_name)}
            </span>
            <span className="account-text">
              <span className="account-name truncate">{profile?.full_name?.split(' ')[0] ?? 'Account'}</span>
              <span className="account-role truncate">
                {profile?.role.replaceAll('_', ' ').toLowerCase()}
              </span>
            </span>
            <Icon name="expand" size={15} />
          </button>
        </header>

        {/* The station strip: which institution, which campus, which station and
            which channel this screen belongs to. Stated once, for every screen. */}
        <div className="station-strip no-print" data-guide="shell-context">
          <span>
            <strong>{institution.config.identity.name}</strong>
          </span>
          <span>{profile?.campus?.name ?? '—'}</span>
          <span>{institution.config.academics.term_label}</span>
          <span>{profile?.role.replaceAll('_', ' ').toLowerCase()}</span>
          <span>{t('shell.channel')} {currentChannel()}</span>
          <span>{currentDeviceMode() === 'personal' ? t('shell.personalDevice') : `${currentDeviceMode()} ${t('shell.station')}`}</span>
        </div>

        <ConnectivityBar />

        {/* Breadcrumb: which module and screen this is, on every page, so the
            answer to "where am I?" never depends on the sidebar being visible. */}
        {breadcrumb ? (
          <nav className="breadcrumb no-print" aria-label={t('shell.breadcrumb')}>
            <span className="breadcrumb-group">{t(breadcrumb.groupKey)}</span>
            <span className="breadcrumb-sep" aria-hidden="true">
              /
            </span>
            <span className="breadcrumb-current" aria-current="page">
              {t(breadcrumb.labelKey)}
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

      <Modal open={menuOpen} onClose={() => setMenuOpen(false)} title={t('shell.yourAccount')}>
        <div className="stack">
          {/* Identity leads. This is the only place in the product that shows the
              address behind the session, so it belongs at the top rather than
              four settings blocks in. */}
          <div>
            <div className="bold">{profile?.full_name}</div>
            <div className="small muted">{profile?.email}</div>
            <div className="small muted">
              {profile?.role.replaceAll('_', ' ').toLowerCase()} · {profile?.campus?.name}
            </div>
          </div>

          <hr className="divider" />

          {/* Reading controls only. The theme switch is deliberately not here:
              it sits in the top bar at every width, and a second copy was the
              duplicate that made this menu read as a junk drawer. The same is
              true of the design-language preview, which now lives only on the
              Institution setup screen it links to. */}
          <div>
            <div className="label">{t('shell.reading')}</div>
            <DisplayControls />
            {/* Desktop keeps a compact copy of the guide switch in its top bar;
                on a phone there is nowhere else to reach it. */}
            {isMobile ? (
              <div style={{ marginTop: 'var(--sp-2)' }}>
                {/* Starting a tour closes this panel, so the spotlight is not
                    hidden behind the sheet that launched it. */}
                <GuideControls onStart={() => setMenuOpen(false)} />
              </div>
            ) : null}
          </div>

          <hr className="divider" />

          <div>
            <div className="label">{t('shell.thisDevice')}</div>
            <InstallApp size="sm" installedLabel={t('shell.installedOnDevice')} />
            {/* The desktop top bar already states connection and queue, so
                repeating them here would be the same duplication in another
                costume. A phone's top bar carries neither, so it gets them. */}
            {isMobile ? (
              <div className="stack" style={{ gap: 'var(--sp-1)', marginTop: 'var(--sp-2)' }}>
                <div className="row-between">
                  <span>{t('shell.connected')}</span>
                  <Badge tone={sync.online ? 'done' : 'warn'}>
                    {sync.online ? t('shell.online') : t('shell.offline')}
                  </Badge>
                </div>
                <div className="row-between">
                  <span>{t('shell.queuedChanges')}</span>
                  <span className="bold">{totalQueued}</span>
                </div>
              </div>
            ) : null}
          </div>

          <button type="button" className="btn btn-danger" onClick={logout}>
            {t('nav.logout')}
          </button>
        </div>
      </Modal>
    </div>
  )
}

/** Up to two initials from a name, for an avatar. Falls back to a neutral mark
 *  so an unloaded profile never renders an empty circle. */
function initials(name?: string): string {
  if (!name) return '··'
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '··'
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
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
  const { t } = useLanguage()
  const { theme, setTheme, canChooseTheme } = useTheme()
  return (
    <div
      className="switcher"
      role="group"
      data-guide="shell-theme"
      aria-label={t('shell.theme')}
      style={block ? { width: '100%' } : undefined}
      title={canChooseTheme ? undefined : t('shell.themeLocked')}
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
          <Icon name={option.symbol} size={17} />
        </button>
      ))}
    </div>
  )
}

/** Text size, density and an explicit high-contrast switch. These are the
 *  accessibility choices that belong to the person reading the screen, kept
 *  next to the theme rather than buried in a browser setting. */
function DisplayControls() {
  const { t } = useLanguage()
  const { text, setText, density, setDensity, contrast, setContrast } = useTheme()
  return (
    <div className="stack" style={{ gap: 'var(--sp-2)', marginTop: 'var(--sp-3)' }}>
      <div className="row wrap" style={{ gap: 'var(--sp-2)' }}>
        <Badge tone="ghost">{t('shell.textSize')}</Badge>
        <Button size="sm" variant={text === 'normal' ? 'primary' : 'ghost'} onClick={() => setText('normal')}>
          {t('shell.normal')}
        </Button>
        <Button size="sm" variant={text === 'large' ? 'primary' : 'ghost'} onClick={() => setText('large')}>
          {t('shell.large')}
        </Button>
      </div>
      <div className="row wrap" style={{ gap: 'var(--sp-2)' }}>
        <Badge tone="ghost">{t('shell.spacing')}</Badge>
        <Button
          size="sm"
          variant={density === 'comfortable' ? 'primary' : 'ghost'}
          onClick={() => setDensity('comfortable')}
        >          {t('shell.comfortable')}
        </Button>
        <Button size="sm" variant={density === 'compact' ? 'primary' : 'ghost'} onClick={() => setDensity('compact')}>          {t('shell.compact')}
        </Button>
      </div>
      <div className="row wrap" style={{ gap: 'var(--sp-2)' }}>
        <Badge tone="ghost">{t('shell.contrast')}</Badge>
        <Button
          size="sm"
          variant={contrast === 'normal' ? 'primary' : 'ghost'}
          onClick={() => setContrast('normal')}>          {t('shell.standard')}
        </Button>
        <Button size="sm" variant={contrast === 'high' ? 'primary' : 'ghost'} onClick={() => setContrast('high')}>          {t('shell.high')}
        </Button>
      </div>
    </div>
  )
}

/** Design-language preview. Retired from the account menu: it duplicated the
 *  Institution setup screen, which is where the full list - including the skins
 *  still only planned - lives. A switch that previews one token block on one
 *  device did not earn a place in a menu people open to sign out. */

function LanguagePicker() {
  const institution = useInstitution()
  const { t } = useLanguage()
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
    <div className="no-print" style={{ minWidth: 132 }} data-guide="shell-language">
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
