/** Admin dashboard (command centre).
 *
 *  Rebuilt to a deliberate five-level hierarchy rather than a flat field of
 *  cards, so the page answers one question at each scroll depth:
 *
 *    Level 1  Header + critical alerts   - is anything on fire right now?
 *    Level 2  Key metrics                - what are the headline numbers?
 *    Level 3  Needs action               - what is waiting on a person?
 *    Level 4  Analysis                   - SLA, ageing, status, where work
 *                                          comes from (only useful charts).
 *    Level 5  Capacity & patterns        - department/staff load, recurring
 *                                          faults, the advisory briefing.
 *
 *  Every value is read from the database; nothing here is simulated. The agent
 *  briefing is advisory and is labelled as such, lower down the page because it
 *  is commentary, not fact.
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import { dateTime, duration, percent, relative } from '../../lib/format'
import { usePolling, useRemote, useSyncState } from '../../state/hooks'
import type { AgentBriefing, DashboardPayload } from '../../lib/types'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Metric,
  PageHeader,
  ProgressBar,
  SectionTitle,
  Tabs,
} from '../../components/ui'

type Payload = DashboardPayload & { agent_briefing?: AgentBriefing }

export function CommandCentre() {
  const navigate = useNavigate()
  const sync = useSyncState()
  const [tab, setTab] = useState<'overview' | 'teams' | 'recurring'>('overview')
  const { data, loading, refresh } = useRemote<Payload>(
    'admin-dashboard',
    () => api.get<Payload>('/admin/dashboard?with_agent=true'),
    { cacheKey: 'dashboard' },
  )
  usePolling(() => void refresh(), 60_000, sync.online)

  if (loading && !data) {
    return (
      <div className="stack">
        <div className="skeleton" style={{ height: 120 }} />
        <div className="skeleton" style={{ height: 240 }} />
      </div>
    )
  }

  const dashboard = data
  const sla = dashboard?.sla_compliance
  const breached = dashboard?.sla_breaches ?? 0
  const atRisk = dashboard?.sla_at_risk ?? 0
  const unassigned = dashboard?.unassigned_cases ?? 0
  const awaitingApproval = dashboard?.awaiting_approval ?? 0
  const awaitingVerification = dashboard?.awaiting_verification ?? 0

  // The few things a shift lead has to act on, in priority order. Each opens the
  // filtered queue, so the number is a door, not a decoration.
  const needsAction = [
    breached
      ? { key: 'breached', label: 'Past the service target', count: breached, tone: 'urgent' as const, to: '/queue?sla_state=BREACHED' }
      : null,
    unassigned
      ? { key: 'unassigned', label: 'Nobody owns these yet', count: unassigned, tone: 'warn' as const, to: '/queue?unassigned=1' }
      : null,
    awaitingApproval
      ? { key: 'approval', label: 'Blocking someone\u2019s request', count: awaitingApproval, tone: 'progress' as const, to: '/approvals' }
      : null,
    awaitingVerification
      ? { key: 'verification', label: 'Waiting on the requester to confirm', count: awaitingVerification, tone: 'open' as const, to: '/cases?filter=verify' }
      : null,
  ].filter(Boolean) as { key: string; label: string; count: number; tone: 'urgent' | 'warn' | 'progress' | 'open'; to: string }[]

  return (
    <div className="stack-lg">
      {/* ---- Level 1: header + critical state ---------------------------- */}
      <PageHeader
        kicker="Operations"
        title="Dashboard"
        subtitle={`Live as of ${dateTime(dashboard?.generated_at)} · every value comes from the database, none is simulated`}
        actions={
          <>
            <Button variant="ghost" onClick={() => void refresh()}>
              Refresh
            </Button>
            <Button variant="primary" onClick={() => navigate('/queue')}>
              Open the queue
            </Button>
          </>
        }
      />

      {breached || atRisk ? (
        <Card accent="urgent" data-guide="admin-alerts">
          <div className="row-between wrap" style={{ gap: 12 }}>
            <div>
              <div className="bold">
                {breached ? `${breached} case${breached === 1 ? '' : 's'} past the service target` : 'No breaches'}
                {atRisk ? ` · ${atRisk} about to breach` : ''}
              </div>
              <div className="small muted">
                These are the ones to touch first. The queue is sorted by what will breach next.
              </div>
            </div>
            <div className="row wrap">
              {breached ? (
                <Button variant="danger" onClick={() => navigate('/queue?sla_state=BREACHED')}>
                  Review breached
                </Button>
              ) : null}
              {atRisk ? (
                <Button variant="attention" onClick={() => navigate('/queue?sla_state=AT_RISK')}>
                  Review at risk
                </Button>
              ) : null}
            </div>
          </div>
        </Card>
      ) : (
        <Card accent="mint">
          <div className="bold">Nothing is breaching</div>
          <div className="small muted">Every open case is inside its service target.</div>
        </Card>
      )}

      {/* ---- Level 2: key metrics --------------------------------------- */}
      <section className="page-section">
        <SectionTitle>Today at a glance</SectionTitle>
        <div className="grid-metrics" data-guide="admin-metrics">
          <Metric label="Open cases" value={dashboard?.open_cases ?? 0} hint={`${dashboard?.new_today ?? 0} new today`} onClick={() => navigate('/queue')} />
          <Metric label="Breached" value={breached} hint="Past the target" tone="urgent" onClick={() => navigate('/queue?sla_state=BREACHED')} />
          <Metric label="At risk" value={atRisk} hint="Last quarter of the target" tone="warn" onClick={() => navigate('/queue?sla_state=AT_RISK')} />
          <Metric label="Unassigned" value={unassigned} hint="Nobody owns these yet" onClick={() => navigate('/queue?unassigned=1')} />
          <Metric label="Resolved today" value={dashboard?.resolved_today ?? 0} tone="done" />
          <Metric
            label="Median resolution"
            value={dashboard?.average_resolution_minutes ? duration(dashboard.average_resolution_minutes) : '—'}
            hint="Across every service"
          />
        </div>
      </section>

      {/* ---- Level 3: what needs a person now --------------------------- */}
      <section className="page-section">
        <SectionTitle
          right={
            needsAction.length ? <Badge tone="warn">{needsAction.reduce((sum, item) => sum + item.count, 0)} items</Badge> : null
          }
        >
          Needs action
        </SectionTitle>
        {needsAction.length === 0 ? (
          <EmptyState
            title="Nothing is waiting on a person"
            detail="Every open case is assigned, inside target, and not sitting in an approval or verification step."
          />
        ) : (
          <div className="grid-2">
            {needsAction.map((item) => (
              <Card key={item.key} className="card-clickable" onClick={() => navigate(item.to)}>
                <div className="row-between">
                  <div>
                    <div className="bold">{item.label}</div>
                    <div className="small muted">Open the list and work it down.</div>
                  </div>
                  <Badge tone={item.tone}>{item.count}</Badge>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* ---- Level 4/5: analysis, capacity and patterns (tabbed) -------- */}
      <Tabs
        tabs={[
          { id: 'overview', label: 'Overview' },
          { id: 'teams', label: 'Teams & load' },
          { id: 'recurring', label: 'Recurring problems', count: dashboard?.recurring_issue_count },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'overview' ? (
        <>
          <div className="grid-2">
            <Card>
              <SectionTitle>SLA compliance</SectionTitle>
              {sla ? (
                <>
                  <div className="metric-value">{percent(sla.compliance_rate)}</div>
                  <div className="tiny muted">resolved within target, last {sla.window_days} days</div>
                  <div style={{ marginTop: 12 }}>
                    <ProgressBar value={sla.resolved_within_target} max={sla.cases || 1} tone="mint" />
                  </div>
                  <ul className="list-reset small" style={{ marginTop: 10 }}>
                    <li>Resolved in time: {sla.resolved_within_target}</li>
                    <li>Resolved late: {sla.resolved_after_target}</li>
                    <li>Still open past target: {sla.open_past_target}</li>
                  </ul>
                </>
              ) : (
                <EmptyState title="Not enough data yet" detail="Compliance needs resolved cases inside the window." />
              )}
            </Card>

            <Card>
              <SectionTitle>Where cases come from</SectionTitle>
              <ul className="list-reset stack" style={{ gap: 6 }}>
                {(dashboard?.by_category ?? []).slice(0, 8).map((row) => (
                  <li key={row.service_key} className="row-between">
                    <span>{row.category.replaceAll('_', ' ').toLowerCase()}</span>
                    <span className="bold">{row.count}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          <div className="grid-2">
            <Card>
              <SectionTitle>Ageing</SectionTitle>
              <ul className="list-reset stack" style={{ gap: 6 }}>
                {(dashboard?.ageing ?? []).map((bucket) => (
                  <li key={bucket.label}>
                    <div className="row-between small">
                      <span>{bucket.label}</span>
                      <span className="bold">{bucket.count}</span>
                    </div>
                    <ProgressBar
                      value={bucket.count}
                      max={Math.max(1, ...(dashboard?.ageing ?? []).map((item) => item.count))}
                      tone="status-warn"
                    />
                  </li>
                ))}
              </ul>
            </Card>

            <Card>
              <SectionTitle>Status mix</SectionTitle>
              <ul className="list-reset stack" style={{ gap: 6 }}>
                {(dashboard?.by_status ?? []).map((row) => (
                  <li key={row.key} className="row-between">
                    <span>{row.key.replaceAll('_', ' ').toLowerCase()}</span>
                    <span className="bold">{row.count}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </>
      ) : null}

      {tab === 'teams' ? (
        <>
          <Card>
            <SectionTitle right={<Badge tone="ghost">capacity in cases</Badge>}>Department load</SectionTitle>
            <div className="table-wrap become-cards">
              <table className="data">
                <thead>
                  <tr>
                    <th>Department</th>
                    <th>Open</th>
                    <th>Total</th>
                    <th>Load</th>
                  </tr>
                </thead>
                <tbody>
                  {(dashboard?.by_department ?? []).map((row) => (
                    <tr key={row.department_id}>
                      <td data-label="Department">{row.name}</td>
                      <td data-label="Open">{row.open_cases}</td>
                      <td data-label="Total">{row.total_cases}</td>
                      <td data-label="Load">
                        <ProgressBar value={row.open_cases} max={Math.max(1, row.total_cases)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card>
            <SectionTitle>Staff workload</SectionTitle>
            <div className="table-wrap become-cards">
              <table className="data">
                <thead>
                  <tr>
                    <th>Staff</th>
                    <th>Department</th>
                    <th>Open</th>
                    <th>Capacity</th>
                    <th>Load</th>
                    <th>Available</th>
                  </tr>
                </thead>
                <tbody>
                  {(dashboard?.staff_workload ?? []).map((row) => (
                    <tr key={row.staff_id}>
                      <td data-label="Staff">{row.name}</td>
                      <td data-label="Department">{row.department ?? '—'}</td>
                      <td data-label="Open">{row.open_cases}</td>
                      <td data-label="Capacity">{row.capacity}</td>
                      <td data-label="Load">
                        <ProgressBar
                          value={row.open_cases}
                          max={Math.max(1, row.capacity)}
                          tone={row.utilisation > 1 ? 'status-urgent' : row.utilisation > 0.8 ? 'status-warn' : 'mint'}
                        />
                      </td>
                      <td data-label="Available">
                        {row.is_available ? <Badge tone="done">yes</Badge> : <Badge tone="ghost">no</Badge>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="small muted" style={{ marginTop: 8 }}>
              Routing uses this same table: a case goes to the least-loaded person who has the skill, and the
              reasoning is recorded on the case.
            </p>
          </Card>
        </>
      ) : null}

      {tab === 'recurring' ? (
        <>
          {dashboard?.recurring_issues?.length ? (
            dashboard.recurring_issues.map((issue) => (
              <Card key={issue.scope} accent="sun">
                <div className="row-between">
                  <div>
                    <div className="bold">{issue.label}</div>
                    <div className="small muted">
                      {issue.case_count} cases in {issue.window_days} days · last {relative(issue.last_incident)}
                      {issue.average_resolution_minutes
                        ? ` · averages ${duration(issue.average_resolution_minutes)}`
                        : ''}
                    </div>
                  </div>
                  <Badge tone="warn">{issue.case_count} repeats</Badge>
                </div>
                <div className="pill-row" style={{ marginTop: 8 }}>
                  {issue.case_numbers.map((number) => (
                    <Badge key={number} tone="ghost">
                      {number}
                    </Badge>
                  ))}
                </div>
                <p className="small" style={{ marginTop: 8 }}>
                  Same asset or same room and category, three or more times. Fixing the root cause is cheaper than
                  the fourth visit — this is the cluster, not a guess.
                </p>
              </Card>
            ))
          ) : (
            <EmptyState title="No repeated problems detected" detail="Nothing has recurred three times in the window." />
          )}
        </>
      ) : null}

      {/* ---- Level 5: advisory, last because it is commentary ----------- */}
      {dashboard?.agent_briefing ? (
        <Card data-guide="admin-briefing" className="card-accent-agent">
          <SectionTitle right={<Badge tone="agent">{dashboard.agent_briefing.engine}</Badge>}>
            Operations briefing (advisory)
          </SectionTitle>
          <p className="small">{dashboard.agent_briefing.summary}</p>

          {dashboard.agent_briefing.findings?.length ? (
            <>
              <div className="section-title" style={{ marginTop: 8 }}>
                Findings
              </div>
              <ul className="list-reset stack" style={{ gap: 8 }}>
                {dashboard.agent_briefing.findings.map((finding, index) => (
                  <li key={index} className="row-between">
                    <div>
                      <div className="bold small">{finding.headline}</div>
                      <div className="tiny muted">{finding.detail}</div>
                    </div>
                    <Badge tone={finding.severity === 'HIGH' ? 'urgent' : finding.severity === 'MEDIUM' ? 'warn' : 'ghost'}>
                      {finding.severity}
                    </Badge>
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          {dashboard.agent_briefing.recommendations?.length ? (
            <>
              <div className="section-title" style={{ marginTop: 12 }}>
                Suggested next actions
              </div>
              <ul className="list-reset stack" style={{ gap: 8 }}>
                {dashboard.agent_briefing.recommendations.map((item, index) => (
                  <li key={index}>
                    <Card className="card-flat">
                      <div className="bold small">{item.title}</div>
                      <div className="tiny muted">{item.reason}</div>
                      <div className="pill-row" style={{ marginTop: 6 }}>
                        {item.case_numbers?.slice(0, 6).map((number) => (
                          <Badge key={number} tone="ghost">
                            {number}
                          </Badge>
                        ))}
                      </div>
                    </Card>
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          <p className="tiny muted" style={{ marginTop: 10 }}>
            {dashboard.agent_briefing.disclaimer}
          </p>
        </Card>
      ) : null}

      <div className="row wrap">
        <Button variant="primary" onClick={() => navigate('/queue')}>
          Open the case queue
        </Button>
        <Button variant="info" onClick={() => navigate('/analytics')}>
          Analytics
        </Button>
        <Button variant="ghost" onClick={() => navigate('/audit')}>
          Audit trail
        </Button>
      </div>
    </div>
  )
}
