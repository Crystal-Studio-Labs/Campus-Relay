/** The application's information architecture, in one place.
 *
 *  Navigation used to be assembled inside the shell, which meant the shell and
 *  any future consumer (breadcrumbs, a command palette, the mobile drawer) each
 *  had their own idea of where a screen lives. Here the architecture is data:
 *  a fixed list of module groups, each item declaring the permission or role it
 *  needs. The shell renders it, breadcrumbs resolve against it, and the quick
 *  switcher searches it.
 *
 *  Groups are the offices of a college, named the way a college names them -
 *  Academics, Examinations, Accounts & Fees, Central Library, No-Dues &
 *  Clearance, Leave & Passes, Facility Requests, Service Desk, Notices &
 *  Circulars, Clubs & Activities, Training & Placements, Feedback & Grievances,
 *  Security & Gate Pass, Reports & Analytics, People & Administration, Staff &
 *  Payroll, Workstations, Settings - so a student finds "my attendance" under
 *  Academics and a teacher finds "mark attendance" in the same office, rather
 *  than in two differently-named buckets.
 *
 *  The order is the order a person meets the campus: what is happening (Home),
 *  what is being taught (Academics, Examinations), what is owed (Accounts &
 *  Fees), what is issued (Library, Clearance, Leave), what has been asked for
 *  (Facility Requests, Service Desk), what is broadcast (Notices), campus life,
 *  then the administration, the desks and finally settings. Items remain
 *  permission-gated, so a student still sees only their own world: the shape of
 *  the navigation does not change identity between roles, only its contents.
 *
 *  LABELS ARE KEYS, NOT TEXT
 *  -------------------------
 *  `labelKey` is a translation key resolved at render time, never a literal.
 *  This used to be `t('...')` evaluated once at module load, which meant the
 *  navigation kept whatever language was active when the bundle first ran and
 *  did not change when the person switched language. Resolving at render is what
 *  makes the switcher actually work.
 *
 *  Nothing here is a security boundary. Every route and endpoint re-checks on the
 *  server; this decides what is *offered*, not what is *allowed*.
 */

/** The institution's module switches (config/institution.json). */
export type FeatureKey = 'kiosk' | 'gate' | 'notices' | 'agents' | 'device_lab' | 'offline_sync'
export type FeatureState = Partial<Record<FeatureKey, boolean>>

/** Roles that run the institution as a whole and are offered the command centre.
 *  There is one such role: management runs the campus day to day and the
 *  deployment. A hostel warden is narrowed by the scope the server resolves for
 *  them, not by a second role. */
export const COMMAND_CENTRE_ROLES = new Set(['MANAGEMENT'])

export interface NavItem {
  to: string
  /** Translation key, resolved with `t()` when the item is rendered. */
  labelKey: string
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
  /** Translation key for the group heading. */
  labelKey: string
  items: NavItem[]
}

export type CanFn = (...permissions: string[]) => boolean

/** The whole architecture, before any filtering. Exported so breadcrumbs and
 *  the command palette can resolve a path a role may not currently be offered. */
/** The offices of the campus, in the order a person meets them. Each group is
 *  an office (a module), and the items inside it are the two sides of that
 *  office: what a person files, and where the staff work it. */
export const MODULES: NavGroup[] = [
  {
    id: 'overview',
    labelKey: 'navgroup.home',
    items: [
      { to: '/', labelKey: 'nav.home', icon: 'home', studentsOnly: true },
      { to: '/operations', labelKey: 'nav.dashboard', icon: 'dashboard', anyOf: ['dashboard:view'], roles: [...COMMAND_CENTRE_ROLES] },
      { to: '/notifications', labelKey: 'nav.notifications', icon: 'bell', anyOf: ['notification:read'] },
    ],
  },
  {
    id: 'academics',
    labelKey: 'navgroup.academics',
    items: [
      { to: '/timetable', labelKey: 'navitem.timetable', icon: 'timetable', anyOf: ['timetable:read'], roles: ['STUDENT'] },
      { to: '/timetable/teaching', labelKey: 'navitem.teachingTimetable', icon: 'timetable', anyOf: ['timetable:read'], roles: ['TEACHER', 'MANAGEMENT'] },
      { to: '/attendance', labelKey: 'navitem.attendance', icon: 'attendance', anyOf: ['attendance:read'], roles: ['STUDENT'] },
      { to: '/attendance/mark', labelKey: 'navitem.markAttendance', icon: 'markAttendance', anyOf: ['attendance:mark'] },
    ],
  },
  {
    id: 'examinations',
    labelKey: 'navgroup.examinations',
    items: [
      { to: '/marks', labelKey: 'navitem.marks', icon: 'marks', anyOf: ['marks:read'], roles: ['STUDENT'] },
      { to: '/marks/entry', labelKey: 'navitem.enterMarks', icon: 'enterMarks', anyOf: ['marks:entry'] },
      // Oversight: management reads any subject's marks; the screen is view-only.
      { to: '/marks/view', labelKey: 'navitem.viewMarks', icon: 'marks', anyOf: ['marks:manage'] },
    ],
  },
  {
    id: 'fees',
    labelKey: 'navgroup.fees',
    items: [
      { to: '/fees', labelKey: 'navitem.fees', icon: 'fees', anyOf: ['fees:read'], roles: ['STUDENT'] },
      { to: '/fees/collection', labelKey: 'navitem.feeCollection', icon: 'feeCollection', anyOf: ['fees:manage'] },
    ],
  },
  {
    id: 'library',
    labelKey: 'navgroup.library',
    items: [
      { to: '/library', labelKey: 'navitem.library', icon: 'library', anyOf: ['library:read'], roles: ['STUDENT'] },
      { to: '/library/desk', labelKey: 'navitem.libraryDesk', icon: 'library', anyOf: ['library:manage'] },
    ],
  },
  {
    id: 'clearance',
    labelKey: 'navgroup.clearance',
    items: [
      { to: '/clearance', labelKey: 'navitem.clearance', icon: 'clearance', anyOf: ['clearance:read'], roles: ['STUDENT'] },
      { to: '/clearance/desk', labelKey: 'navitem.clearanceDesk', icon: 'clearance', anyOf: ['clearance:decide'] },
    ],
  },
  {
    id: 'leave',
    labelKey: 'navgroup.leave',
    items: [
      { to: '/leave', labelKey: 'navitem.leave', icon: 'leave', anyOf: ['leave:read'], roles: ['STUDENT'] },
      { to: '/leave/desk', labelKey: 'navitem.leaveDesk', icon: 'leave', anyOf: ['leave:decide'] },
    ],
  },
  {
    id: 'requests',
    labelKey: 'navgroup.requests',
    items: [
      { to: '/report', labelKey: 'nav.report', icon: 'report', anyOf: ['case:create'], studentsOnly: true },
      { to: '/cases', labelKey: 'nav.cases', icon: 'cases', anyOf: ['case:read_own', 'case:read_scope', 'case:read_all'] },
    ],
  },
  {
    id: 'service-desk',
    labelKey: 'navgroup.servicedesk',
    items: [
      { to: '/queue', labelKey: 'nav.queue', icon: 'queue', anyOf: ['case:assign'] },
      { to: '/tasks', labelKey: 'nav.tasks', icon: 'tasks', anyOf: ['case:update_status', 'case:resolve'] },
      { to: '/approvals', labelKey: 'nav.approvals', icon: 'approvals', anyOf: ['approval:decide'] },
    ],
  },
  {
    id: 'communication',
    labelKey: 'navgroup.announcements',
    items: [
      { to: '/notices', labelKey: 'nav.notices', icon: 'notices', anyOf: ['notice:read'], feature: 'notices' },
      { to: '/notices/studio', labelKey: 'navitem.noticeStudio', icon: 'noticeStudio', anyOf: ['notice:create', 'notice:publish'], feature: 'notices' },
    ],
  },
  {
    id: 'activities',
    labelKey: 'navgroup.activities',
    items: [
      { to: '/activities', labelKey: 'navitem.activities', icon: 'activities', anyOf: ['activity:read'] },
      { to: '/activities/manage', labelKey: 'navitem.activitiesDesk', icon: 'activities', anyOf: ['activity:manage'] },
    ],
  },
  {
    id: 'placements',
    labelKey: 'navgroup.placements',
    items: [
      { to: '/career', labelKey: 'navitem.careers', icon: 'career', anyOf: ['career:read'] },
      { to: '/career/manage', labelKey: 'navitem.placementsDesk', icon: 'career', anyOf: ['career:manage'] },
    ],
  },
  {
    id: 'feedback',
    labelKey: 'navgroup.feedback',
    items: [
      { to: '/feedback', labelKey: 'navitem.feedback', icon: 'feedback', anyOf: ['feedback:submit'] },
      { to: '/feedback/inbox', labelKey: 'navitem.feedbackInbox', icon: 'feedback', anyOf: ['feedback:manage'] },
    ],
  },
  {
    id: 'security',
    labelKey: 'navgroup.gate',
    items: [
      { to: '/gate', labelKey: 'nav.gate', icon: 'gate', anyOf: ['gate:verify', 'gate:operate', 'gate:log_read'], feature: 'gate' },
    ],
  },
  {
    id: 'insights',
    labelKey: 'navgroup.reports',
    items: [
      { to: '/analytics', labelKey: 'nav.analytics', icon: 'analytics', anyOf: ['analytics:read'] },
      { to: '/audit', labelKey: 'nav.audit', icon: 'audit', anyOf: ['audit:read'] },
    ],
  },
  {
    id: 'people',
    labelKey: 'navgroup.people',
    items: [
      { to: '/directory', labelKey: 'navitem.people', icon: 'people', anyOf: ['user:manage', 'config:manage'] },
    ],
  },
  {
    id: 'staffing',
    labelKey: 'navgroup.staffing',
    items: [
      { to: '/employment', labelKey: 'navitem.myEmployment', icon: 'employment', anyOf: ['hrms:read'] },
      { to: '/hrms', labelKey: 'navitem.hrPayroll', icon: 'payroll', anyOf: ['hrms:manage'] },
    ],
  },
  {
    id: 'stations',
    labelKey: 'navgroup.stations',
    items: [
      { to: '/helpdesk', labelKey: 'navitem.helpdesk', icon: 'helpdesk', anyOf: ['case:create_on_behalf'] },
      { to: '/kiosk', labelKey: 'navitem.kiosk', icon: 'kiosk', roles: ['MANAGEMENT'], feature: 'kiosk' },
    ],
  },
  {
    id: 'system',
    labelKey: 'navgroup.settings',
    items: [
      { to: '/assistant', labelKey: 'navitem.assistant', icon: 'assistant', anyOf: ['agent:operate'], feature: 'agents' },
      { to: '/sync', labelKey: 'navitem.offlineSync', icon: 'sync', feature: 'offline_sync' },
      { to: '/guide', labelKey: 'navitem.helpDevices', icon: 'guide', feature: 'device_lab' },
      { to: '/setup', labelKey: 'navitem.institutionSetup', icon: 'setup', anyOf: ['config:manage'] },
      { to: '/profile', labelKey: 'nav.profile', icon: 'profile' },
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
 *  item prefix so `/cases/42` resolves to Cases rather than nothing. Returned as
 *  translation keys so the breadcrumb follows the active language. */
export function resolveBreadcrumb(
  pathname: string,
  groups: NavGroup[] = MODULES,
): { groupKey: string; labelKey: string } | null {
  let best: { groupKey: string; labelKey: string; length: number } | null = null
  for (const group of groups) {
    for (const item of group.items) {
      const isMatch = item.to === '/' ? pathname === '/' : pathname === item.to || pathname.startsWith(`${item.to}/`)
      if (isMatch && (!best || item.to.length > best.length)) {
        best = { groupKey: group.labelKey, labelKey: item.labelKey, length: item.to.length }
      }
    }
  }
  return best ? { groupKey: best.groupKey, labelKey: best.labelKey } : null
}

/** Flat list for the quick switcher, in navigation order. */
export function flattenNav(groups: NavGroup[]): { item: NavItem; groupKey: string }[] {
  return groups.flatMap((group) => group.items.map((item) => ({ item, groupKey: group.labelKey })))
}
