/** Student home.
 *
 *  Ordering is deliberate: things waiting on *you* first (verify a repair,
 *  acknowledge an urgent notice), then your open requests, then shortcuts. A
 *  student opens this app in a corridor for fifteen seconds; the answer to "what
 *  do I need to do" has to be the first thing on the screen.
 */

import { useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import { useSession } from '../../state/session'
import { useRemote, useSyncState } from '../../state/hooks'
import { noticeTone, relative } from '../../lib/format'
import type { CaseBrief } from '../../lib/types'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  Metric,
  PageHeader,
  SectionTitle,
} from '../../components/ui'
import { CaseList } from '../../components/CaseCard'

interface Overview {
  profile: { name: string; role: string; language: string }
  counts: {
    open_cases: number
    my_cases_total: number
    unread_notifications: number
    pending_acknowledgements: number
    urgent_notices: number
    assigned_to_me: number | null
  }
  cases: CaseBrief[]
  pending_acknowledgements: { notice_id: number; title: string; notice_type: string; publish_at: string }[]
  needs_attention: { kind: string; case_id: number; case_number: string; label: string }[]
}

export function StudentHome() {
  const navigate = useNavigate()
  const { profile } = useSession()
  const sync = useSyncState()
  const { data, error, loading, stale, cachedAt, refresh } = useRemote<Overview>(
    'my-overview',
    () => api.get<Overview>('/my/overview'),
    { cacheKey: 'overview' },
  )

  if (loading && !data) return <LoadingState label="Loading your overview" />
  if (error && !data)
    return <ErrorState message={error} onRetry={() => void refresh()} offline={!sync.online} />

  const overview = data
  const counts = overview?.counts
  const student = profile?.student

  return (
    <div className="stack-lg">
      {stale ? (
        <div className="banner banner-info">
          Showing what your phone remembered from {relative(cachedAt)}. It will refresh when the network returns.
        </div>
      ) : null}

      <PageHeader
        guide="home-greeting"
        title={`Hello, ${overview?.profile.name?.split(' ')[0] ?? 'there'}`}
        subtitle={`${student?.roll_number ? `${student.roll_number} · ` : ''}${student?.hostel ? `${student.hostel}${student.room ? ` · Room ${student.room}` : ''}` : 'Day scholar'}`}
        actions={
          <Badge tone={sync.online ? 'done' : 'warn'}>{sync.online ? 'Online' : 'Offline'}</Badge>
        }
      />

      <div data-guide="home-new-request">
        <Button variant="primary" size="xl" block onClick={() => navigate('/report')}>
          ＋ Raise a new request
        </Button>
      </div>

      {/* Level 1 of the student dashboard: what needs *you*, before anything
          else on the screen. A student opens this in a corridor for fifteen
          seconds, so the answer is at the top. */}
      {overview?.needs_attention?.length || overview?.pending_acknowledgements?.length ? (
        <SectionTitle right={<Badge tone="urgent">action needed</Badge>}>Needs you now</SectionTitle>
      ) : null}

      {overview?.needs_attention?.length ? (
        <Card accent="signal" data-guide="home-waiting">
          <SectionTitle>Waiting for you</SectionTitle>
          <ul className="list-reset stack" style={{ gap: 8 }}>
            {overview.needs_attention.map((item) => (
              <li key={`${item.kind}-${item.case_id}`}>
                <button
                  className="btn btn-attention btn-block"
                  onClick={() => navigate(`/cases/${item.case_id}`)}
                >
                  {item.label} · {item.case_number}
                </button>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {overview?.pending_acknowledgements?.length ? (
        <Card accent="urgent">
          <SectionTitle right={<Badge tone="urgent">Action needed</Badge>}>Notices to acknowledge</SectionTitle>
          <ul className="list-reset stack" style={{ gap: 8 }}>
            {overview.pending_acknowledgements.map((notice) => (
              <li key={notice.notice_id}>
                <Card
                  className="card-flat card-clickable"
                  onClick={() => navigate(`/notices/${notice.notice_id}`)}
                >
                  <Badge tone={noticeTone(notice.notice_type)}>{notice.notice_type}</Badge>
                  <div className="bold" style={{ marginTop: 4 }}>
                    {notice.title}
                  </div>
                  <div className="tiny muted">{relative(notice.publish_at)}</div>
                </Card>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <SectionTitle>Your numbers</SectionTitle>
      <div className="grid-metrics" data-guide="home-metrics">
        <Metric
          label="My open requests"
          value={counts?.open_cases ?? 0}
          hint="Still being worked on"
          onClick={() => navigate('/cases?filter=open')}
        />
        <Metric
          label="All my requests"
          value={counts?.my_cases_total ?? 0}
          onClick={() => navigate('/cases')}
        />
        <Metric
          label="Unread alerts"
          value={counts?.unread_notifications ?? 0}
          onClick={() => navigate('/notifications')}
        />
        <Metric
          label="Notices"
          value={counts?.urgent_notices ?? 0}
          hint="Urgent or emergency"
          onClick={() => navigate('/notices')}
        />
      </div>

      <div>
        <SectionTitle
          right={
            <Button size="sm" variant="ghost" onClick={() => navigate('/cases')}>
              See all
            </Button>
          }
        >
          Your open requests
        </SectionTitle>
        {!overview?.cases?.length ? (
          <EmptyState
            title="Nothing open right now"
            detail="If something breaks in your hostel or you need a certificate, raise a request and it will appear here."
            action={
              <Button variant="primary" onClick={() => navigate('/report')}>
                Raise a request
              </Button>
            }
          />
        ) : (
          <CaseList cases={overview.cases} onOpen={(item) => navigate(`/cases/${item.id}`)} />
        )}
      </div>

      <Card className="card-flat" data-guide="home-shortcuts">
        <SectionTitle>Shortcuts</SectionTitle>
        <div className="stack" style={{ gap: 8 }}>
          <Button variant="info" block onClick={() => navigate('/report?service=CERTIFICATE_BONAFIDE')}>
            Bonafide / certificate
          </Button>
          <Button variant="info" block onClick={() => navigate('/report?service=HOSTEL_COMPLAINT')}>
            Hostel maintenance
          </Button>
          <Button variant="info" block onClick={() => navigate('/report?service=LEAVE_REQUEST')}>
            Leave / gate pass
          </Button>
          <Button variant="agent" block onClick={() => navigate('/assistant')}>
            Ask the assistant instead
          </Button>
        </div>
      </Card>

      <p className="tiny muted">
        Your requests are visible to you and to the staff who handle them. Nothing here is shared outside the
        campus.
      </p>
    </div>
  )
}
