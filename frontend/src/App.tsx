/** Application routes.
 *
 *  Route access is decided from the permissions the server returned, not from a
 *  role name. A role change on the server therefore changes the UI with no code
 *  change here — and the server still re-checks every request, so this is a
 *  rendering decision, never a security boundary.
 */

import { Navigate, Route, Routes, useLocation, useSearchParams } from 'react-router-dom'
import { currentDeviceMode } from './lib/api'
import { useSession } from './state/session'
import { AppShell, COMMAND_CENTRE_ROLES } from './layouts/AppShell'
import { LoginPage } from './pages/Login'
import { LandingPage } from './pages/Landing'
import { StudentHome } from './pages/student/Home'
import { ReportPage } from './pages/student/Report'
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
import { Button, EmptyState, LoadingState } from './components/ui'

export function App() {
  const { status } = useSession()
  const location = useLocation()

  if (status === 'loading') {
    return (
      <div className="page">
        <LoadingState label="Restoring your session" />
      </div>
    )
  }

  // The kiosk is deliberately reachable without a personal session, because the
  // person using it is not the person who signed the tablet in. An unsigned
  // tablet gets the kiosk *sign-in*, in kiosk clothing, so the station is set up
  // where it stands instead of being configured on someone's laptop first.
  if (location.pathname.startsWith('/kiosk')) {
    return (
      <div className="page-transition" key={location.pathname}>
        {status === 'authenticated' ? <KioskPage /> : <LoginPage variant="kiosk" />}
      </div>
    )
  }

  if (status === 'anonymous') {
    return (
      <div className="page-transition" key={location.pathname}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginVariant />} />
          <Route path="*" element={<LandingPage />} />
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

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<StudentHome />} />
        <Route
          path="report"
          element={
            <GuardedRole roles={STUDENT_ROLES} permission="case:create" detail="Filing a personal request is the student experience. Staff file through the queue, the helpdesk desk or an existing case.">
              <ReportPage />
            </GuardedRole>
          }
        />
        <Route path="cases" element={<CasesListPage />} />
        <Route path="cases/:caseId" element={<CaseDetailPage />} />
        <Route path="notices" element={<NoticesPage />} />
        <Route path="notices/studio" element={<Guarded permission="notice:create"><NoticeStudio /></Guarded>} />
        <Route path="notices/:noticeId" element={<NoticeDetailPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="assistant" element={<Guarded permission="agent:operate"><AssistantPage /></Guarded>} />
        <Route path="sync" element={<SyncCentrePage />} />
        <Route path="guide" element={<GuidePage />} />
        <Route path="queue" element={<Guarded anyOf={['case:assign', 'case:update_status']}><QueuePage /></Guarded>} />
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
        <Route path="gate" element={<Guarded permission="gate:verify"><GateDesk /></Guarded>} />
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
    <EmptyState
      title="This screen is not available for your role"
      detail={`Your role (${profile?.role.replaceAll('_', ' ').toLowerCase()}) does not include the ${needed} permission. Ask an administrator if you need it.`}
    />
  )
}

/** The student experience: a personal home and a personal request form. Named
 *  here so a route guard and the navigation agree on who they are for. */
export const STUDENT_ROLES = new Set(['STUDENT'])

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
    <EmptyState
      title="This screen is not available for your role"
      detail={
        detail ??
        "The command centre is for administrators, wardens and department heads. Your own work is on Tasks and the case queue."
      }
    />
  )
}

function NotFound() {
  return (
    <EmptyState
      title="That page does not exist"
      detail="The link may be old, or the case may have been removed from your scope."
      action={
        <Button variant="primary" onClick={() => window.location.assign('/')}>
          Back to the start
        </Button>
      }
    />
  )
}
