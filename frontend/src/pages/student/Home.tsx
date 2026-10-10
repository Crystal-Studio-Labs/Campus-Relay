/** Student home.
 *
 *  A bento dashboard. Ordering is deliberate: things waiting on *you* first
 *  (verify a repair, acknowledge an urgent notice), then your numbers, then your
 *  open requests, then shortcuts. A student opens this in a corridor for fifteen
 *  seconds; the answer to "what do I need to do" has to be the first tile.
 */

import { useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import { useSession } from '../../state/session'
import { useRemote, useSyncState } from '../../state/hooks'
import { noticeTone, relative } from '../../lib/format'
import type { CaseBrief } from '../../lib/types'
import {
  Badge,
  Bento,
  BentoItem,
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  SectionHeading,
  StatTile,
} from '../../components/ui'
import { Icon } from '../../components/Icon'
import { CaseList } from '../../components/CaseCard'
import { useLanguage } from '../../lib/i18n'

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
  const { t } = useLanguage()
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
  const needsAction = (overview?.needs_attention?.length ?? 0) + (overview?.pending_acknowledgements?.length ?? 0)

  return (
    <div className="stack-lg">
      {stale ? (
        <div className="banner banner-info">
          Showing what your phone remembered from {relative(cachedAt)}. It will refresh when the network returns.
        </div>
      ) : null}

      <PageHeader
        guide="home-greeting"
        kicker="Student home"
        title={`Hello, ${overview?.profile.name?.split(' ')[0] ?? 'there'}`}
        subtitle={`${student?.roll_number ? `${student.roll_number} · ` : ''}${student?.hostel ? `${student.hostel}${student.room ? ` · Room ${student.room}` : ''}` : 'Day scholar'}`}
        actions={
          <Badge tone={sync.online ? 'done' : 'warn'}>{sync.online ? 'Online' : 'Offline'}</Badge>
        }
      />

      {/* The launcher: the four things this app gets opened to do, at the top of
          the screen and sized for a thumb. */}
      <nav className="quick-grid no-print" aria-label="Quick actions">
        <button
          type="button"
          className="quick-action"
          data-guide="home-new-request"
          onClick={() => navigate('/report')}
        >
          <span className="quick-action-icon" aria-hidden="true">
            <Icon name="report" size={20} />
          </span>
          <span className="quick-action-label">
            <span>New request</span>
            <span className="quick-action-hint">Repair, certificate, leave</span>
          </span>
        </button>
        <button type="button" className="quick-action" onClick={() => navigate('/cases')}>
          <span className="quick-action-icon" aria-hidden="true">
            <Icon name="cases" size={20} />
          </span>
          <span className="quick-action-label">
            <span>My requests</span>
            <span className="quick-action-hint">Track what you filed</span>
          </span>
        </button>
        <button type="button" className="quick-action" onClick={() => navigate('/notices')}>
          <span className="quick-action-icon" aria-hidden="true">
            <Icon name="notices" size={20} />
          </span>
          <span className="quick-action-label">
            <span>Notices</span>
            <span className="quick-action-hint">Campus announcements</span>
          </span>
        </button>
        <button type="button" className="quick-action" onClick={() => navigate('/notifications')}>
          <span className="quick-action-icon" aria-hidden="true">
            <Icon name="bell" size={20} />
          </span>
          <span className="quick-action-label">
            <span>Alerts</span>
            <span className="quick-action-hint">What changed for you</span>
          </span>
        </button>
      </nav>

      {/* The attention band: what needs *you*, before anything else. Stacked in
          priority order so the page reads top to bottom, not left to right. */}
      {needsAction > 0 ? (
        <div className="stack">
          {overview?.needs_attention?.length ? (
            <div>
              <Card accent="signal" className="card-flat" data-guide="home-waiting">
                <SectionHeading icon="clock" right={<Badge tone="urgent">action needed</Badge>}>
                  Waiting for you
                </SectionHeading>
                <ul className="list-reset stack" style={{ gap: 8 }}>
                  {overview.needs_attention.map((item) => (
                    <li key={`${item.kind}-${item.case_id}`}>
                      <Button
                        variant="attention"
                        block
                        onClick={() => navigate(`/cases/${item.case_id}`)}
                      >
                        {item.label} · {item.case_number}
                      </Button>
                    </li>
                  ))}
                </ul>
              </Card>
            </div>
          ) : null}

          {overview?.pending_acknowledgements?.length ? (
            <div>
              <Card accent="urgent" className="card-flat">
                <SectionHeading icon="notices" right={<Badge tone="urgent">Action needed</Badge>}>
                  Notices to acknowledge
                </SectionHeading>
                <ul className="list-reset stack" style={{ gap: 8 }}>
                  {overview.pending_acknowledgements.map((notice) => (
                    <li key={notice.notice_id}>
                      <Card
                        className="card-flat card-sunken card-clickable"
                        onClick={() => navigate(`/notices/${notice.notice_id}`)}
                      >
                        <div className="row" style={{ gap: 8 }}>
                          <Badge tone={noticeTone(notice.notice_type)}>{notice.notice_type}</Badge>
                          <span className="tiny muted">{relative(notice.publish_at)}</span>
                        </div>
                        <div className="bold" style={{ marginTop: 6 }}>
                          {notice.title}
                        </div>
                      </Card>
                    </li>
                  ))}
                </ul>
              </Card>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Your numbers: four proportioned tiles. */}
      <div data-guide="home-metrics">
        <SectionHeading icon="insights">Your numbers</SectionHeading>
        <Bento>
          <BentoItem span={3}>
            <StatTile
              label="My open requests"
              value={counts?.open_cases ?? 0}
              hint="Still being worked on"
              icon="cases"
              tone="open"
              onClick={() => navigate('/cases?filter=open')}
            />
          </BentoItem>
          <BentoItem span={3}>
            <StatTile
              label="All my requests"
              value={counts?.my_cases_total ?? 0}
              hint="Everything you have filed"
              icon="list"
              tone="ghost"
              onClick={() => navigate('/cases')}
            />
          </BentoItem>
          <BentoItem span={3}>
            <StatTile
              label="Unread alerts"
              value={counts?.unread_notifications ?? 0}
              hint="Waiting to be read"
              icon="bell"
              tone="warn"
              onClick={() => navigate('/notifications')}
            />
          </BentoItem>
          <BentoItem span={3}>
            <StatTile
              label="Urgent notices"
              value={counts?.urgent_notices ?? 0}
              hint="Urgent or emergency"
              icon="notices"
              tone="urgent"
              onClick={() => navigate('/notices')}
            />
          </BentoItem>
        </Bento>
      </div>

      {/* The working area, then the supporting shortcuts beneath it - one
          column, read downward. */}
      <div className="stack-lg">
        <div>
          <Card className="card-flat">
            <SectionHeading
              icon="inbox"
              right={
                <Button size="sm" variant="ghost" onClick={() => navigate('/cases')}>
                  See all
                </Button>
              }
            >
              Your open requests
            </SectionHeading>
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
          </Card>
        </div>

        <div>
          <Card className="card-flat" data-guide="home-shortcuts">
            <SectionHeading icon="sparkles">Shortcuts</SectionHeading>
            <div className="stack" style={{ gap: 8 }}>
              <Button block onClick={() => navigate('/report?service=BONAFIDE_CERTIFICATE')}>
                <Icon name="file" size={17} /> Bonafide / certificate
              </Button>
              <Button block onClick={() => navigate('/report?service=HOSTEL_COMPLAINT')}>
                <Icon name="warning" size={17} /> Hostel maintenance
              </Button>
              <Button block onClick={() => navigate('/report?service=LEAVE_REQUEST')}>
                <Icon name="leave" size={17} /> Leave / gate pass
              </Button>
              <Button variant="agent" block onClick={() => navigate('/assistant')}>
                <Icon name="assistant" size={17} /> Ask the assistant
              </Button>
            </div>
            <p className="tiny muted" style={{ marginTop: 'var(--sp-4)' }}>
              {`Your requests are visible to you and to the staff who handle them. Nothing here is shared outside the campus.`}
              {' '}
              {t('shell.channel')} PWA.
            </p>
          </Card>
        </div>
      </div>
    </div>
  )
}
