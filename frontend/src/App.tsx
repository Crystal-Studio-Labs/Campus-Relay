/** Application routes.
 *
 *  Route access is decided from the permissions the server returned, not from a
 *  role name. A role change on the server therefore changes the UI with no code
 *  change here — and the server still re-checks every request, so this is a
 *  rendering decision, never a security boundary.
 */

import { Navigate, Route, Routes, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { currentDeviceMode } from './lib/api'
import { useSession } from './state/session'
import { AppShell, COMMAND_CENTRE_ROLES } from './layouts/AppShell'
import { LoginPage, landingFor } from './pages/Login'
import { LandingPage } from './pages/Landing'
import { NotFound } from './pages/NotFound'
import { StudentHome } from './pages/student/Home'
import { ReportPage } from './pages/student/Report'
import { StudentAttendancePage } from './pages/student/Attendance'
import { StudentMarksPage } from './pages/student/Marks'
import { StudentTimetablePage } from './pages/student/Timetable'
import { StudentFeesPage } from './pages/student/Fees'
import { MarkAttendancePage } from './pages/staff/Attendance'
import { MarkEntryPage } from './pages/staff/Marks'
import { MarksViewPage } from './pages/admin/MarksView'
import { TeachingTimetablePage } from './pages/staff/Timetable'
import { FeeCollectionPage } from './pages/admin/Fees'
import { ClearanceDeskPage, ClearancePage } from './pages/campus/Clearance'
import { LibraryDeskPage, LibraryPage } from './pages/campus/Library'
import { LeaveDeskPage, StudentLeavePage } from './pages/campus/Leave'
import {
  ActivitiesPage,
  ActivityManagePage,
  FeedbackInboxPage,
  FeedbackPage,
} from './pages/campus/Engagement'
import { CareerManagePage, CareerPage } from './pages/campus/Career'
import { EmploymentPage, HrmsPage } from './pages/campus/Employment'
import { CasesListPage } from './pages/CasesList'
import { CaseDetailPage } from './pages/CaseDetail'
import { NoticesPage } from './pages/Notices'
import { NoticeDetailPage } from './pages/NoticeDetail'
import { NotificationsPage } from './pages/Notifications'
import { ProfilePage } from './pages/Profile'
import { AssistantPage } from './pages/AssistantPage'
import { SyncCentrePage } from './pages/SyncCentre'
import { GuidePage } from './pages/GuidePage'
import { CommandCentre } from './pages/admin/CommandCentre'
import { QueuePage } from './pages/admin/Queue'
import { ApprovalsPage } from './pages/admin/Approvals'
import { AnalyticsPage } from './pages/admin/Analytics'
import { NoticeStudio } from './pages/admin/NoticeStudio'
import { AuditTrailPage } from './pages/admin/AuditTrail'
import { DirectoryPage } from './pages/admin/Directory'
import { InstitutionSetup } from './pages/admin/InstitutionSetup'
import { StaffTasks } from './pages/staff/Tasks'
import { GateDesk } from './pages/security/GateDesk'
import { KioskPage } from './pages/kiosk/Kiosk'
import { HelpDesk } from './pages/helpdesk/HelpDesk'
import { Button, EmptyState, PageHeader } from './components/ui'
import { Icon } from './components/Icon'
import { SplashScreen } from './components/SplashScreen'
import type { RoleKey } from './lib/types'

const AUTHORIZED_KIOSK_ROLES: RoleKey[] = ['MANAGEMENT']

export function App() {
  const { status, profile } = useSession()
  const location = useLocation()

  if (status === 'loading') {
    return <SplashScreen />
  }

  // The kiosk is deliberately reachable without a personal session, because the
  // person using it is not the person who signed the tablet in. An unsigned
  // tablet gets the kiosk *sign-in*, in kiosk clothing, so the station is set up
  // where it stands instead of being configured on someone's laptop first.
  if (location.pathname.startsWith('/kiosk')) {
    const isAuthorizedOperator =
      status === 'authenticated' &&
      profile &&
      AUTHORIZED_KIOSK_ROLES.includes(profile.role as RoleKey)

    return (
      <div className="page-transition" key={location.pathname}>
        {isAuthorizedOperator ? <KioskPage /> : <LoginPage variant="kiosk" />}
      </div>
    )
  }

  if (status === 'anonymous') {
    // A tablet that was set up as a kiosk or helpdesk opens that station rather
    // than the marketing page, so the next person to touch it meets the station
    // sign-in instead of a brochure, and a personal sign-in here cannot quietly
    // convert a shared terminal back into somebody's private device.
    const stationMode = currentDeviceMode()
    if (stationMode !== 'personal' && location.pathname === '/') {
      return <Navigate to={stationMode === 'kiosk' ? '/kiosk' : '/login?mode=desk'} replace />
    }

    // Signing out from a deep screen (or having a session expire there) must not
    // land on a 404: the deep screen belongs to a session that no longer exists,
    // so send the person to sign in and carry on. A signed-out visitor opening
    // an unknown URL gets the same treatment, which is also what they want.
    return (
      <div className="page-transition" key={location.pathname}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginVariant />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </div>
    )
  }

  // A station set up as a kiosk or a helpdesk stays that station, even if
  // somebody opens the root URL. Re-configuring it requires signing out.
  const mode = currentDeviceMode()
  if (mode !== 'personal' && location.pathname === '/') {
    return <Navigate to={mode === 'kiosk' ? '/kiosk' : '/helpdesk'} replace />
  }

  // The index route is the student home. Staff have their own landing pages
  // (`landingFor` is the same mapping the sign-in uses), and the sidebar brand
  // links to `/` for everybody - so without this a teacher clicking the logo
  // landed on a page headed "Student home" with student-only numbers on it.
  const indexLanding = profile ? landingFor(profile, mode) : '/'

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={indexLanding === '/' ? <StudentHome /> : <Navigate to={indexLanding} replace />} />
        <Route
          path="report"
          element={
            <GuardedRole roles={STUDENT_ROLES} permission="case:create" detail="Filing a personal request is the student experience. Staff file through the queue, the helpdesk desk or an existing case.">
              <ReportPage />
            </GuardedRole>
          }
        />
        <Route
          path="attendance"
          element={
            <GuardedRole roles={STUDENT_ROLES} permission="attendance:read" detail="Attendance is recorded by the teacher for the class; students read their own record here.">
              <StudentAttendancePage />
            </GuardedRole>
          }
        />
        <Route
          path="attendance/mark"
          element={
            <Guarded permission="attendance:mark">
              <MarkAttendancePage />
            </Guarded>
          }
        />
        <Route
          path="marks"
          element={
            <GuardedRole roles={STUDENT_ROLES} permission="marks:read" detail="Marks are entered by the teacher for the subject; students read their own record here.">
              <StudentMarksPage />
            </GuardedRole>
          }
        />
        <Route
          path="marks/entry"
          element={
            <Guarded permission="marks:entry">
              <MarkEntryPage />
            </Guarded>
          }
        />
        {/* Management reads any subject's marks as oversight. The screen is
            view-only and the server refuses a save without marks:entry, so the
            office that audits the register cannot hold the pen. */}
        <Route
          path="marks/view"
          element={
            <Guarded permission="marks:manage">
              <MarksViewPage />
            </Guarded>
          }
        />
        <Route
          path="timetable"
          element={
            <GuardedRole roles={STUDENT_ROLES} permission="timetable:read" detail="This is the student's own timetable. Teaching staff open Teaching timetable instead.">
              <StudentTimetablePage />
            </GuardedRole>
          }
        />
        <Route
          path="timetable/teaching"
          element={
            <GuardedRole roles={TEACHING_ROLES} permission="timetable:read" detail="The teaching timetable is staff-facing; students read their own timetable.">
              <TeachingTimetablePage />
            </GuardedRole>
          }
        />
        <Route
          path="fees"
          element={
            <GuardedRole roles={STUDENT_ROLES} permission="fees:read" detail="This is your own fee record. The collection desk is where payments are recorded.">
              <StudentFeesPage />
            </GuardedRole>
          }
        />
        <Route
          path="fees/collection"
          element={
            <Guarded permission="fees:manage">
              <FeeCollectionPage />
            </Guarded>
          }
        />
        <Route path="clearance" element={<GuardedRole roles={STUDENT_ROLES} permission="clearance:read"><ClearancePage /></GuardedRole>} />
        <Route path="clearance/desk" element={<Guarded permission="clearance:decide"><ClearanceDeskPage /></Guarded>} />
        <Route path="library" element={<GuardedRole roles={STUDENT_ROLES} permission="library:read"><LibraryPage /></GuardedRole>} />
        <Route path="library/desk" element={<Guarded permission="library:manage"><LibraryDeskPage /></Guarded>} />
        <Route path="leave" element={<GuardedRole roles={STUDENT_ROLES} permission="leave:read"><StudentLeavePage /></GuardedRole>} />
        <Route path="leave/desk" element={<Guarded permission="leave:decide"><LeaveDeskPage /></Guarded>} />
        {/* Giving feedback is the campus's half of the conversation; the office
            reads and asks instead, on the inbox route below. */}
        <Route path="feedback" element={<Guarded permission="feedback:submit"><FeedbackPage /></Guarded>} />
        <Route path="feedback/inbox" element={<Guarded permission="feedback:manage"><FeedbackInboxPage /></Guarded>} />
        <Route path="activities" element={<Guarded permission="activity:read"><ActivitiesPage /></Guarded>} />
        <Route path="activities/manage" element={<Guarded permission="activity:manage"><ActivityManagePage /></Guarded>} />
        <Route path="career" element={<Guarded permission="career:read"><CareerPage /></Guarded>} />
        <Route path="career/manage" element={<Guarded permission="career:manage"><CareerManagePage /></Guarded>} />
        <Route path="employment" element={<Guarded permission="hrms:read"><EmploymentPage /></Guarded>} />
        <Route path="hrms" element={<Guarded permission="hrms:manage"><HrmsPage /></Guarded>} />
        <Route path="cases" element={<CasesListPage />} />
        <Route path="cases/:caseId" element={<CaseDetailPage />} />
        <Route path="notices" element={<NoticesPage />} />
        <Route path="notices/studio" element={<Guarded anyOf={['notice:create', 'notice:publish']}><NoticeStudio /></Guarded>} />
        <Route path="notices/:noticeId" element={<NoticeDetailPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="assistant" element={<Guarded permission="agent:operate"><AssistantPage /></Guarded>} />
        <Route path="sync" element={<SyncCentrePage />} />
        <Route path="guide" element={<GuidePage />} />
        <Route path="queue" element={<Guarded permission="case:assign"><QueuePage /></Guarded>} />
        <Route path="approvals" element={<Guarded permission="approval:decide"><ApprovalsPage /></Guarded>} />
        <Route path="operations" element={<GuardedRole roles={COMMAND_CENTRE_ROLES} permission="dashboard:view"><CommandCentre /></GuardedRole>} />
        <Route path="analytics" element={<Guarded permission="analytics:read"><AnalyticsPage /></Guarded>} />
        <Route path="audit" element={<Guarded permission="audit:read"><AuditTrailPage /></Guarded>} />
        <Route path="directory" element={<Guarded anyOf={['user:manage', 'config:manage']}><DirectoryPage /></Guarded>} />
        {/* Configuring the deployment is a screen, not a config file someone has
            to find: the template is only a template if it can be inspected. */}
        <Route path="setup" element={<Guarded permission="config:manage"><InstitutionSetup /></Guarded>} />
        <Route
          path="tasks"
          element={
            <Guarded anyOf={['case:update_status', 'case:resolve']}>
              <StaffTasks />
            </Guarded>
          }
        />
        <Route path="gate" element={<Guarded anyOf={['gate:verify', 'gate:operate', 'gate:log_read']}><GateDesk /></Guarded>} />
        <Route path="helpdesk" element={<Guarded permission="case:create_on_behalf"><HelpDesk /></Guarded>} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}

/** The sign-in screen in the shape the URL asks for. */
function LoginVariant() {
  const [params] = useSearchParams()
  const mode = params.get('mode')
  const variant = mode === 'kiosk' ? 'kiosk' : mode === 'desk' ? 'desk' : 'standard'
  return <LoginPage variant={variant} />
}

/** Hides a screen the person cannot use, and says why rather than 403-ing. */
function Guarded({
  permission,
  anyOf,
  children,
}: {
  permission?: string
  anyOf?: string[]
  children: React.ReactNode
}) {
  const { can, profile } = useSession()
  const allowed = permission ? can(permission) : (anyOf ?? []).some((key) => can(key))
  if (allowed) return <>{children}</>
  const needed = permission ?? (anyOf ?? []).join(' or ')
  return (
    <AccessDenied
      detail={`Your role (${profile?.role.replaceAll('_', ' ').toLowerCase()}) does not include the ${needed} permission. Ask an administrator if you need it.`}
    />
  )
}

/** The refusal screen.
 *
 *  A route a role may not open is still a *page*, so it keeps the same header
 *  and breadcrumb as every other one: a screen with no heading leaves somebody
 *  who followed a stale link with no idea where they landed or what to do. */
function AccessDenied({ detail }: { detail?: string }) {
  const navigate = useNavigate()
  return (
    <div className="stack-lg">
      <PageHeader
        kicker="Restricted"
        title="Not available for your role"
        subtitle={detail}
      />
      <EmptyState
        title="You do not have access to this screen"
        detail="Nothing here has changed and nothing is broken - this part of the campus system belongs to another desk."
        action={
          <Button variant="primary" onClick={() => navigate('/')}>
            <Icon name="home" size={17} /> Go to your home
          </Button>
        }
      />
    </div>
  )
}

/** The student experience: a personal home and a personal request form. Named
 *  here so a route guard and the navigation agree on who they are for. */
export const STUDENT_ROLES = new Set(['STUDENT'])

/** Who runs a class: the staff-facing timetable and attendance views. */
export const TEACHING_ROLES = new Set(['TEACHER', 'MANAGEMENT'])

/** A screen reserved for a set of roles, on top of the permission it needs.
 *  Used where a permission is held broadly but the screen is only meaningful to
 *  the people who run the campus as a whole. */
function GuardedRole({
  roles,
  permission,
  detail,
  children,
}: {
  roles: Set<string>
  permission: string
  /** Why this screen is not for the current role. */
  detail?: string
  children: React.ReactNode
}) {
  const { can, profile } = useSession()
  if (can(permission) && roles.has(profile?.role ?? '')) return <>{children}</>
  return (
    <AccessDenied
      detail={
        detail ??
        "The command centre is for the management role. Your own work is on Tasks and the case queue."
      }
    />
  )
}

