/** Analytics.
 *
 *  Answers the questions an administrator actually gets asked in a review: how
 *  much came in, how fast did we close it, did we hit our own targets, where does
 *  it keep happening, and did anyone read the notice we sent.
 */

import { useState } from 'react'
import { api, qs } from '../../lib/api'
import { duration, percent, shortDate } from '../../lib/format'
import { useRemote } from '../../state/hooks'
import {
  Badge,
  BarChart,
  Card,
  EmptyState,
  Metric,
  PageHeader,
  ProgressBar,
  SectionTitle,
  Select,
  Tabs,
} from '../../components/ui'

interface AnalyticsBundle {
  volume: { day: string; created: number; resolved: number }[]
  by_category: { category: string; service_key: string; count: number }[]
  by_department: { department_id: number; name: string; total_cases: number; open_cases: number }[]
  by_status: { key: string; count: number }[]
  resolution_time: {
    service_key: string
    average_minutes: number
    resolved_cases: number
  }[]
  sla_compliance: {
    window_days: number
    cases: number
    resolved_within_target: number
    resolved_after_target: number
    open_past_target: number
    compliance_rate: number | null
  }
  location_hotspots: { location_id: number; code: string; name: string; case_count: number }[]
  staff_workload: any[]
  notices: {
    window_days: number
    notices: number
    sent: number
    read: number
    acknowledged: number
    actioned: number
    read_rate: number | null
    action_rate: number | null
    per_notice: { notice_id: number; title: string; sent: number; read: number; read_rate: number }[]
  }
}

export function AnalyticsPage() {
  const [days, setDays] = useState(30)
  const { data, loading } = useRemote<AnalyticsBundle>(`analytics-${days}`, () =>
    api.get<AnalyticsBundle>(`/admin/analytics${qs({ days })}`),
  )
  const [tab, setTab] = useState<'demand' | 'performance' | 'places' | 'notices'>('demand')

  if (loading && !data) {
    return (
      <div className="stack">
        <div className="skeleton" style={{ height: 200 }} />
        <div className="skeleton" style={{ height: 200 }} />
      </div>
    )
  }

  return (
    <div className="stack-lg">
      <PageHeader
        kicker="Insights"
        title="Analytics"
        subtitle="Only resolved cases count towards resolution time, and channel coverage is reported honestly"
        actions={
          <div style={{ minWidth: 170 }}>
            <Select
              value={String(days)}
              onChange={(value) => setDays(Number(value))}
              options={[
                { value: '7', label: 'Last 7 days' },
                { value: '30', label: 'Last 30 days' },
                { value: '90', label: 'Last 90 days' },
                { value: '365', label: 'Last year' },
              ]}
            />
          </div>
        }
      />

      {/* Level 2: the handful of numbers a review actually opens with, so the
          reader gets the headline before drilling into a tab. */}
      {data ? (
        <section className="page-section">
          <SectionTitle right={<Badge tone="ghost">last {days} days</Badge>}>Headline</SectionTitle>
          <div className="grid-metrics">
            <Metric label="Cases created" value={data.volume.reduce((total, row) => total + row.created, 0)} />
            <Metric label="Cases resolved" value={data.volume.reduce((total, row) => total + row.resolved, 0)} tone="done" />
            <Metric
              label="Within target"
              value={data.sla_compliance.compliance_rate === null ? '—' : percent(data.sla_compliance.compliance_rate)}
              hint={`resolved inside their target, ${data.sla_compliance.window_days} days`}
            />
            <Metric
              label="Open past target"
              value={data.sla_compliance.open_past_target}
              hint="Still open, already late"
              tone="urgent"
            />
            <Metric
              label="Resolved late"
              value={data.sla_compliance.resolved_after_target}
              hint="Closed, but after the target"
              tone="warn"
            />
            <Metric
              label="Notice read rate"
              value={data.notices.read_rate === null ? '—' : percent(data.notices.read_rate)}
              hint={`${data.notices.read} of ${data.notices.sent} delivered`}
            />
          </div>
        </section>
      ) : null}

      <Tabs
        tabs={[
          { id: 'demand', label: 'Demand' },
          { id: 'performance', label: 'Performance' },
          { id: 'places', label: 'Places & people' },
          { id: 'notices', label: 'Notices' },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'demand' ? (
        <>
          <Card>
            <SectionTitle right={<Badge tone="ghost">cases created vs resolved</Badge>}>Volume over time</SectionTitle>
            {data?.volume.length ? (
              <>
                <BarChart
                  data={data.volume.map((row) => ({ label: row.day, value: row.created }))}
                  labelFormatter={shortDate}
                />
                <div className="chart-legend" style={{ marginTop: 8 }}>
                  <span>
                    <span className="swatch" style={{ background: 'var(--sky)' }} /> Created:{' '}
                    {data.volume.reduce((total, row) => total + row.created, 0)}
                  </span>
                  <span>
                    Resolved: {data.volume.reduce((total, row) => total + row.resolved, 0)}
                  </span>
                </div>
              </>
            ) : (
              <EmptyState title="No cases in this window" />
            )}
          </Card>

          <div className="grid-2">
            <Card>
              <SectionTitle>By category</SectionTitle>
              <ul className="list-reset stack" style={{ gap: 8 }}>
                {(data?.by_category ?? []).map((row) => (
                  <li key={row.service_key}>
                    <div className="row-between small">
                      <span>{row.category.replaceAll('_', ' ').toLowerCase()}</span>
                      <span className="bold">{row.count}</span>
                    </div>
                    <ProgressBar value={row.count} max={Math.max(1, ...(data?.by_category ?? []).map((item) => item.count))} />
                  </li>
                ))}
              </ul>
            </Card>

            <Card>
              <SectionTitle>By department</SectionTitle>
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Department</th>
                      <th>Total</th>
                      <th>Still open</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.by_department ?? []).map((row) => (
                      <tr key={row.department_id}>
                        <td>{row.name}</td>
                        <td>{row.total_cases}</td>
                        <td>{row.open_cases}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        </>
      ) : null}

      {tab === 'performance' ? (
        <>
          <Card>
            <SectionTitle>Service targets</SectionTitle>
            {data?.sla_compliance ? (
              <>
                <div className="grid-metrics">
                  <Metric
                    label="Within target"
                    value={data.sla_compliance.compliance_rate === null ? '—' : percent(data.sla_compliance.compliance_rate)}
                    hint={`last ${data.sla_compliance.window_days} days`}
                    tone="done"
                  />
                  <Metric label="Resolved late" value={data.sla_compliance.resolved_after_target} tone="warn" />
                  <Metric label="Open past target" value={data.sla_compliance.open_past_target} tone="urgent" />
                  <Metric label="Cases measured" value={data.sla_compliance.cases} />
                </div>
                <p className="small muted" style={{ marginTop: 8 }}>
                  Targets are the institution's own numbers, configured per service and urgency — not a vendor's
                  benchmark.
                </p>
              </>
            ) : null}
          </Card>

          <Card>
            <SectionTitle>Resolution time by service</SectionTitle>
            <div className="table-wrap become-cards">
              <table className="data">
                <thead>
                  <tr>
                    <th>Service</th>
                    <th>Resolved cases</th>
                    <th>Average time</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.resolution_time ?? []).map((row) => (
                    <tr key={row.service_key}>
                      <td data-label="Service">{row.service_key.replaceAll('_', ' ').toLowerCase()}</td>
                      <td data-label="Resolved cases">{row.resolved_cases}</td>
                      <td data-label="Average time">{duration(row.average_minutes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="small muted" style={{ marginTop: 8 }}>
              Only resolved cases are counted here — an open case has no resolution time, and pretending otherwise
              would flatter the numbers.
            </p>
          </Card>
        </>
      ) : null}

      {tab === 'places' ? (
        <div className="grid-2">
          <Card>
            <SectionTitle right={<Badge tone="ghost">top locations</Badge>}>Where it keeps happening</SectionTitle>
            {data?.location_hotspots?.length ? (
              <ul className="list-reset stack" style={{ gap: 8 }}>
                {data.location_hotspots.map((row) => (
                  <li key={row.location_id}>
                    <div className="row-between small">
                      <span>
                        {row.name} <span className="mono tiny">{row.code}</span>
                      </span>
                      <span className="bold">{row.case_count}</span>
                    </div>
                    <ProgressBar
                      value={row.case_count}
                      max={Math.max(1, ...data.location_hotspots.map((item) => item.case_count))}
                      tone="status-warn"
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No located cases yet" />
            )}
          </Card>

          <Card>
            <SectionTitle>Workload</SectionTitle>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Staff</th>
                    <th>Open</th>
                    <th>Capacity</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.staff_workload ?? []).map((row) => (
                    <tr key={row.staff_id}>
                      <td>{row.name ?? 'Unnamed'}</td>
                      <td>{row.open_cases}</td>
                      <td>{row.capacity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      ) : null}

      {tab === 'notices' ? (
        <>
          <Card>
            <SectionTitle right={<Badge tone="ghost">measured, not assumed</Badge>}>Notice effectiveness</SectionTitle>
            {data?.notices ? (
              <>
                <div className="grid-metrics">
                  <div className="metric">
                    <div className="metric-label">Sent</div>
                    <div className="metric-value">{data.notices.sent}</div>
                    <div className="metric-hint">{data.notices.notices} notices</div>
                  </div>
                  <div className="metric">
                    <div className="metric-label">Read</div>
                    <div className="metric-value">{data.notices.read}</div>
                    <div className="metric-hint">{percent(data.notices.read_rate)} read rate</div>
                  </div>
                  <div className="metric">
                    <div className="metric-label">Acknowledged</div>
                    <div className="metric-value">{data.notices.acknowledged}</div>
                  </div>
                  <div className="metric">
                    <div className="metric-label">Actioned</div>
                    <div className="metric-value">{data.notices.actioned}</div>
                  </div>
                </div>
              </>
            ) : (
              <EmptyState title="No notices in this window" />
            )}
          </Card>

          {data?.notices?.per_notice?.length ? (
            <Card>
              <SectionTitle>Per notice</SectionTitle>
              <div className="table-wrap become-cards">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Notice</th>
                      <th>Sent</th>
                      <th>Read</th>
                      <th>Read rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.notices.per_notice.map((row) => (
                      <tr key={row.notice_id}>
                        <td data-label="Notice">{row.title}</td>
                        <td data-label="Sent">{row.sent}</td>
                        <td data-label="Read">{row.read}</td>
                        <td data-label="Read rate">{percent(row.read_rate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="small muted" style={{ marginTop: 8 }}>
                A notice nobody read is the signal to change the channel, not to blame the audience.
              </p>
            </Card>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
