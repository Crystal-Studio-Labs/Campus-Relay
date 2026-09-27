/** The application's information architecture, in one place.
 *
 *  Navigation used to be assembled inside the shell, which meant the shell and
 *  any future consumer (breadcrumbs, a command palette, the mobile drawer) each
 *  had their own idea of where a screen lives. Here the architecture is data:
 *  a fixed list of module groups, each item declaring the permission or role it
 *  needs. The shell renders it, breadcrumbs resolve against it, and the quick
 *  switcher searches it.
 *
 *  Groups are *modules* - Overview, Requests, Communication, Security, Insights,
 *  People, Stations, System - so the product reads like one administration
 *  platform rather than four separate tools. Items remain permission-gated, so a
 *  student still sees only their own world: the difference is that the shape of
 *  the navigation no longer changes identity between roles, only its contents.
 *
 *  Nothing here is a security boundary. Every route and endpoint re-checks on the
 *  server; this decides what is *offered*, not what is *allowed*.
 */

import { t } from './i18n'

/** The institution's module switches (config/institution.json). */
export type FeatureKey = 'kiosk' | 'gate' | 'notices' | 'agents' | 'device_lab' | 'offline_sync'
export type FeatureState = Partial<Record<FeatureKey, boolean>>

/** Roles that run the campus as a whole and are offered the command centre. */
export const COMMAND_CENTRE_ROLES = new Set(['SUPER_ADMIN', 'ADMIN', 'WARDEN', 'DEPARTMENT_HEAD'])

export interface NavItem {
  to: string
  label: string
  icon: string
  /** Any one of these permissions shows the item. */
  anyOf?: string[]
  /** Optional role restriction, on top of any permission. */
  roles?: string[]
  /** The institution module this item belongs to; off removes it. */
  feature?: FeatureKey
  /** Only shown to students - the personal home and the personal request form. */
  studentsOnly?: boolean
}

export interface NavGroup {
  id: string
  label: string
  items: NavItem[]
}

export type CanFn = (...permissions: string[]) => boolean

/** The whole architecture, before any filtering. Exported so breadcrumbs and
 *  the command palette can resolve a path a role may not currently be offered. */
export const MODULES: NavGroup[] = [
  {
    id: 'overview',
    label: 'Overview',
    items: [
      { to: '/', label: t('nav.home'), icon: '◆', studentsOnly: true },
      { to: '/operations', label: t('nav.dashboard'), icon: '▦', anyOf: ['dashboard:view'], roles: [...COMMAND_CENTRE_ROLES] },
      { to: '/notifications', label: t('nav.notifications'), icon: '◔', anyOf: ['notification:read'] },
    ],
  },
  {
    id: 'requests',
    label: 'Requests',
    items: [
      { to: '/report', label: t('nav.report'), icon: '＋', anyOf: ['case:create'], studentsOnly: true },
      { to: '/cases', label: t('nav.cases'), icon: '▤', anyOf: ['case:read_own', 'case:read_scope', 'case:read_all'] },
      { to: '/queue', label: t('nav.queue'), icon: '≡', anyOf: ['case:assign'] },
      { to: '/tasks', label: t('nav.tasks'), icon: '✓', anyOf: ['case:update_status', 'case:resolve'] },
      { to: '/approvals', label: t('nav.approvals'), icon: '⌛', anyOf: ['approval:decide'] },
    ],
  },
  {
    id: 'communication',
    label: 'Communication',
    items: [
      { to: '/notices', label: t('nav.notices'), icon: '✦', anyOf: ['notice:read'], feature: 'notices' },
      { to: '/notices/studio', label: 'Notice studio', icon: '✎', anyOf: ['notice:publish', 'notice:create'], feature: 'notices' },
    ],
  },
  {
    id: 'security',
    label: 'Security',
    items: [
      { to: '/gate', label: t('nav.gate'), icon: '⛿', anyOf: ['gate:verify', 'gate:log_read'], feature: 'gate' },
    ],
  },
  {
    id: 'insights',
    label: 'Insights',
    items: [
      { to: '/analytics', label: t('nav.analytics'), icon: '▲', anyOf: ['analytics:read'] },
      { to: '/audit', label: t('nav.audit'), icon: '⌸', anyOf: ['audit:read'] },
    ],
  },
  {
    id: 'people',
    label: 'People',
    items: [
      { to: '/directory', label: 'Directory', icon: '☰', anyOf: ['user:manage', 'config:manage'] },
    ],
  },
  {
    id: 'stations',
    label: 'Stations',
    items: [
      { to: '/helpdesk', label: 'Helpdesk desk', icon: '⚑', anyOf: ['case:create_on_behalf'] },
      { to: '/kiosk', label: 'Kiosk mode', icon: '▢', roles: ['SUPER_ADMIN', 'ADMIN'], feature: 'kiosk' },
    ],
  },
  {
    id: 'system',
    label: 'System',
    items: [
      { to: '/assistant', label: 'Assistant', icon: '✳', anyOf: ['agent:operate'], feature: 'agents' },
      { to: '/sync', label: 'Offline & sync', icon: '⇅', feature: 'offline_sync' },
      { to: '/guide', label: 'Guide & devices', icon: 'ⓘ', feature: 'device_lab' },
      { to: '/setup', label: 'Institution setup', icon: '⚙', anyOf: ['config:manage'] },
      { to: '/profile', label: t('nav.profile'), icon: '☻' },
    ],
  },
]

function isOff(feature: NavItem['feature'], features: FeatureState): boolean {
  return feature ? features[feature] === false : false
}

/** The navigation this person gets: the fixed modules with the items their
 *  permissions and role actually open, and any module left empty removed. */
export function buildNav(can: CanFn, role: string | null, features: FeatureState = {}): NavGroup[] {
  const isStudent = role === 'STUDENT'
  return MODULES.map((group) => ({
    ...group,
    items: group.items.filter((item) => {
      if (item.studentsOnly && !isStudent) return false
      if (item.roles && !item.roles.includes(role ?? '')) return false
      if (item.anyOf && !item.anyOf.some((permission) => can(permission))) return false
      if (isOff(item.feature, features)) return false
      // One route appears at most once across the whole navigation.
      return true
    }),
  })).filter((group) => group.items.length > 0)
}

/** Deduplicates routes across groups, first occurrence winning. Applied to the
 *  built navigation so a route moved between modules cannot appear twice. */
export function dedupeNav(groups: NavGroup[]): NavGroup[] {
  const seen = new Set<string>()
  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => (seen.has(item.to) ? false : (seen.add(item.to), true))),
    }))
    .filter((group) => group.items.length > 0)
}

/** Where a path sits in the architecture, for a breadcrumb. Matches the longest
 *  item prefix so `/cases/42` resolves to Cases rather than nothing. */
export function resolveBreadcrumb(
  pathname: string,
  groups: NavGroup[] = MODULES,
): { group: string; label: string } | null {
  let best: { group: string; label: string; length: number } | null = null
  for (const group of groups) {
    for (const item of group.items) {
      const isMatch = item.to === '/' ? pathname === '/' : pathname === item.to || pathname.startsWith(`${item.to}/`)
      if (isMatch && (!best || item.to.length > best.length)) {
        best = { group: group.label, label: item.label, length: item.to.length }
      }
    }
  }
  return best ? { group: best.group, label: best.label } : null
}

/** Flat list for the quick switcher, in navigation order. */
export function flattenNav(groups: NavGroup[]): { item: NavItem; group: string }[] {
  return groups.flatMap((group) => group.items.map((item) => ({ item, group: group.label })))
}
