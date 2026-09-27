/** Directory & configuration.
 *
 *  The reference data the rest of the product runs on: people, departments,
 *  hostels and rooms, locations and assets, services, workflows, policies and
 *  service targets. Everything here is real data the engines read.
 */

import { useState } from 'react'
import { ApiError, api, qs } from '../../lib/api'
import { dateTime, duration, relative } from '../../lib/format'
import { useRemote } from '../../state/hooks'
import { useSession } from '../../state/session'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  KV,
  LoadingState,
  Metric,
  Modal,
  PageHeader,
  Pagination,
  SectionTitle,
  Select,
  Tabs,
  TextInput,
  Toolbar,
} from '../../components/ui'

type Tab = 'people' | 'places' | 'config'

export function DirectoryPage() {
  const { can } = useSession()
  const [tab, setTab] = useState<Tab>('people')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [newUserOpen, setNewUserOpen] = useState(false)

  const [roleFilter, setRoleFilter] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)

  const [newUser, setNewUser] = useState({
    full_name: '',
    email: '',
    role: 'STUDENT',
    password: '',
    department_id: '',
    staff_designation: '',
    student_roll_number: '',
    hostel_id: '',
  })

  const usersQuery = qs({
    role: roleFilter || undefined,
    q: search.trim() || undefined,
    limit: pageSize,
    offset: (page - 1) * pageSize,
  })

  const users = useRemote<{ total: number; users: any[] }>(
    tab === 'people' && can('user:manage') ? `admin-users${usersQuery}` : null,
    () => api.get<{ total: number; users: any[] }>(`/admin/users${usersQuery}`),
  )

  const config = useRemote<any>(tab === 'config' ? 'config-summary' : null, () => api.get('/admin/config/summary'))
  const departments = useRemote<any>('directory-departments', () => api.get('/admin/departments'))
  const hostels = useRemote<any>('directory-hostels', () => api.get('/admin/hostels'))
  const services = useRemote<any>('admin-services', () => api.get('/admin/services'))
  const slaRules = useRemote<any>('sla-rules', () => api.get('/sla-rules'))
  const policies = useRemote<any>('policies', () => api.get('/policies'))
  const workflows = useRemote<any>('workflows', () => api.get('/workflows'))

  const createUser = async () => {
    setBusy(true)
    setError(null)
    try {
      await api.post('/admin/users', {
        email: newUser.email,
        full_name: newUser.full_name,
        role: newUser.role,
        password: newUser.password,
        department_id: newUser.department_id ? Number(newUser.department_id) : undefined,
        staff_designation: newUser.staff_designation || undefined,
        student_roll_number: newUser.student_roll_number || undefined,
        hostel_id: newUser.hostel_id ? Number(newUser.hostel_id) : undefined,
      })
      setMessage(`Created ${newUser.full_name}. They sign in with the password you set.`)
      setNewUserOpen(false)
      setNewUser({ ...newUser, full_name: '', email: '', password: '', student_roll_number: '' })
      void users.refresh()
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : 'Could not create the user.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="stack-lg">
      <PageHeader
        kicker="People"
        title="Directory & configuration"
        subtitle="The people, places and rules the engines actually read"
      />

      {message ? <div className="banner banner-info" role="status">{message}</div> : null}
      {error ? <div className="banner banner-error" role="alert">{error}</div> : null}

      <Tabs
        tabs={[
          { id: 'people', label: 'People' },
          { id: 'places', label: 'Places & assets' },
          { id: 'config', label: 'Rules & targets' },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'people' ? (
        <>
          {!can('user:manage') ? (
            <EmptyState title="You do not manage users" detail="This section needs the user:manage permission." />
          ) : (
            <>
              <Toolbar
                actions={
                  <Button variant="primary" onClick={() => setNewUserOpen(true)}>
                    ＋ Add a user
                  </Button>
                }
              >
                <div className="toolbar-field">
                  <label className="sr-only" htmlFor="u-search">
                    Search people
                  </label>
                  <TextInput
                    id="u-search"
                    value={search}
                    onChange={(val) => {
                      setSearch(val)
                      setPage(1)
                    }}
                    placeholder="Search name or email"
                  />
                </div>
                <div className="toolbar-field">
                  <label className="sr-only" htmlFor="u-role">
                    Filter by role
                  </label>
                  <Select
                    id="u-role"
                    value={roleFilter}
                    onChange={(val) => {
                      setRoleFilter(val)
                      setPage(1)
                    }}
                    options={[
                      { value: '', label: 'All roles' },
                      ...(config.data?.reference_data?.roles ?? []).map((role: any) => ({
                        value: role.key,
                        label: role.name,
                      })),
                    ]}
                  />
                </div>
              </Toolbar>

              {users.loading && !users.data ? <LoadingState label="Loading people" /> : null}

              {users.data?.users?.length ? (
                <div className="results-head">
                  <span>
                    <span className="results-count">{users.data.total ?? users.data.users.length}</span> people found
                    {roleFilter ? ' · filtered by role' : ''}
                    {search.trim() ? ` · matching “${search.trim()}”` : ''}
                  </span>
                </div>
              ) : null}

              {users.data?.users?.length ? (
                <div className="table-wrap become-cards">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Role</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.data.users.map((entry: any) => (
                        <tr key={entry.id}>
                          <td data-label="Name">{entry.full_name}</td>
                          <td data-label="Email">
                            <span className="mono tiny">{entry.email}</span>
                          </td>
                          <td data-label="Role">
                            <Badge tone="ghost">{entry.role.replaceAll('_', ' ').toLowerCase()}</Badge>
                          </td>
                          <td data-label="Status">
                            {entry.is_active ? <Badge tone="done">active</Badge> : <Badge tone="dead">disabled</Badge>}
                          </td>
                          <td data-label="Actions">
                            <Button
                              size="sm"
                              variant="ghost"
                              busy={busy}
                              onClick={async () => {
                                setBusy(true)
                                try {
                                  await api.patch(`/admin/users/${entry.id}`, { is_active: !entry.is_active })
                                  setMessage(`${entry.full_name} is now ${entry.is_active ? 'disabled' : 'active'}.`)
                                  void users.refresh()
                                } catch (requestError) {
                                  setError(requestError instanceof ApiError ? requestError.message : 'Update failed.')
                                } finally {
                                  setBusy(false)
                                }
                              }}
                            >
                              {entry.is_active ? 'Disable' : 'Enable'}
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}

              {users.data && (users.data.total ?? users.data.users.length) > 0 ? (
                <Pagination
                  page={page}
                  pageSize={pageSize}
                  total={users.data.total ?? users.data.users.length}
                  onChangePage={setPage}
                  onChangePageSize={setPageSize}
                  pageSizeOptions={[10, 25, 50, 100]}
                />
              ) : null}
            </>
          )}
        </>
      ) : null}

      {tab === 'places' ? (
        <>
          <Card>
            <SectionTitle>Departments</SectionTitle>
            <div className="table-wrap become-cards">
              <table className="data">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Code</th>
                    <th>Kind</th>
                    <th>SLA multiplier</th>
                    <th>Staff</th>
                    <th>Open cases</th>
                  </tr>
                </thead>
                <tbody>
                  {(departments.data?.departments ?? []).map((row: any) => (
                    <tr key={row.id}>
                      <td data-label="Name">{row.name}</td>
                      <td data-label="Code">
                        <span className="mono">{row.code}</span>
                      </td>
                      <td data-label="Kind">{row.kind}</td>
                      <td data-label="SLA multiplier">×{row.sla_multiplier}</td>
                      <td data-label="Staff">{row.staff_count}</td>
                      <td data-label="Open cases">{row.open_cases}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card>
            <SectionTitle>Hostels</SectionTitle>
            <ul className="list-reset stack" style={{ gap: 8 }}>
              {(hostels.data?.hostels ?? []).map((hostel: any) => (
                <li key={hostel.id} className="row-between">
                  <div>
                    <div className="bold">
                      {hostel.name} <span className="mono tiny">{hostel.code}</span>
                    </div>
                    <div className="tiny muted">
                      {hostel.gender ?? 'mixed'} · {hostel.hostellers} hostellers ·{' '}
                      {hostel.blocks?.map((block: any) => block.name).join(', ') || 'no blocks'}
                    </div>
                  </div>
                  <Badge tone={hostel.open_cases > 3 ? 'warn' : 'ghost'}>{hostel.open_cases} open</Badge>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <SectionTitle>Reference data</SectionTitle>
            {config.data ? (
              <KV
                items={[
                  { label: 'Branches', value: (config.data.reference_data?.branches ?? []).map((item: any) => item.code).join(', ') },
                  { label: 'Years', value: (config.data.reference_data?.years ?? []).map((item: any) => item.name).join(', ') },
                  { label: 'Batches', value: (config.data.reference_data?.batches ?? []).map((item: any) => item.name).join(', ') },
                ]}
              />
            ) : (
              <p className="muted small">Loading…</p>
            )}
          </Card>
        </>
      ) : null}

      {tab === 'config' ? (
        <>
          <Card>
            <SectionTitle>Inventory of configured records</SectionTitle>
            {config.data?.counts ? (
              <div className="grid-metrics">
                {Object.entries(config.data.counts).map(([key, value]) => (
                  <Metric key={key} label={key.replaceAll('_', ' ')} value={String(value)} />
                ))}
              </div>
            ) : (
              <p className="muted small">Loading…</p>
            )}
          </Card>

          <Card>
            <SectionTitle right={<Badge tone="ghost">service targets</Badge>}>SLA rules</SectionTitle>
            <div className="table-wrap become-cards">
              <table className="data">
                <thead>
                  <tr>
                    <th>Service</th>
                    <th>Urgency</th>
                    <th>Target</th>
                    <th>At-risk at</th>
                    <th>Escalates to</th>
                  </tr>
                </thead>
                <tbody>
                  {(slaRules.data?.rules ?? []).map((row: any, index: number) => (
                    <tr key={index}>
                      <td data-label="Service">{row.service_key ?? 'all services'}</td>
                      <td data-label="Urgency">{row.priority}</td>
                      <td data-label="Target">{duration(row.target_minutes)}</td>
                      <td data-label="At-risk at">{Math.round(row.at_risk_ratio * 100)}%</td>
                      <td data-label="Escalates to">{row.escalate_to_role?.replaceAll('_', ' ').toLowerCase()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card>
            <SectionTitle>Policies</SectionTitle>
            <ul className="list-reset stack" style={{ gap: 8 }}>
              {(policies.data?.policies ?? []).map((row: any) => (
                <li key={row.key}>
                  <div className="bold small">{row.name}</div>
                  <div className="tiny muted">
                    {row.effect} · {row.service_key ?? 'all services'} · {row.message}
                  </div>
                  <pre className="mono tiny" style={{ whiteSpace: 'pre-wrap' }}>
                    {JSON.stringify(row.conditions, null, 1)}
                  </pre>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <SectionTitle>Workflows</SectionTitle>
            <ul className="list-reset stack" style={{ gap: 8 }}>
              {(workflows.data?.workflows ?? []).map((row: any) => (
                <li key={row.key ?? row.name}>
                  <div className="bold small">{row.name}</div>
                  <div className="tiny muted">
                    {(row.steps ?? []).map((step: any) => step.name ?? step.key).join(' → ')}
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <SectionTitle>Services</SectionTitle>
            <ul className="list-reset stack" style={{ gap: 6 }}>
              {(services.data?.services ?? []).map((row: any) => (
                <li key={row.key} className="row-between">
                  <div>
                    <span>{row.icon} </span>
                    <span className="bold">{row.name}</span>
                    <div className="tiny muted">
                      {row.category} · default target {duration(row.default_sla_minutes)} ·{' '}
                      {row.allowed_requester_roles?.length
                        ? `for ${row.allowed_requester_roles.join(', ')}`
                        : 'anyone'}
                    </div>
                  </div>
                  <Badge tone={row.is_active ? 'done' : 'dead'}>{row.is_active ? 'active' : 'off'}</Badge>
                </li>
              ))}
            </ul>
          </Card>
        </>
      ) : null}

      <Modal
        open={newUserOpen}
        onClose={() => setNewUserOpen(false)}
        title="Add a user"
        footer={
          <Button
            variant="primary"
            block
            busy={busy}
            disabled={!newUser.full_name || !newUser.email || newUser.password.length < 8}
            onClick={() => void createUser()}
          >
            Create account
          </Button>
        }
      >
        <Field label="Full name" required>
          <TextInput value={newUser.full_name} onChange={(value) => setNewUser({ ...newUser, full_name: value })} />
        </Field>
        <Field label="Email" required>
          <TextInput value={newUser.email} onChange={(value) => setNewUser({ ...newUser, email: value })} type="email" />
        </Field>
        <Field label="Role" required>
          <Select
            value={newUser.role}
            onChange={(value) => setNewUser({ ...newUser, role: value })}
            options={[
              { value: 'STUDENT', label: 'Student' },
              { value: 'STAFF', label: 'Staff' },
              { value: 'DEPARTMENT_HEAD', label: 'Department head' },
              { value: 'WARDEN', label: 'Warden' },
              { value: 'SECURITY', label: 'Security' },
              { value: 'HELPDESK_OPERATOR', label: 'Helpdesk operator' },
              { value: 'ADMIN', label: 'Administrator' },
            ]}
          />
        </Field>
        <Field label="Temporary password" required hint="At least 8 characters.">
          <TextInput value={newUser.password} onChange={(value) => setNewUser({ ...newUser, password: value })} type="password" />
        </Field>
        {newUser.role === 'STUDENT' ? (
          <>
            <Field label="Roll number">
              <TextInput
                value={newUser.student_roll_number}
                onChange={(value) => setNewUser({ ...newUser, student_roll_number: value })}
              />
            </Field>
            <Field label="Hostel">
              <Select
                value={newUser.hostel_id}
                onChange={(value) => setNewUser({ ...newUser, hostel_id: value })}
                options={[
                  { value: '', label: 'Day scholar' },
                  ...(hostels.data?.hostels ?? []).map((item: any) => ({ value: String(item.id), label: item.name })),
                ]}
              />
            </Field>
          </>
        ) : (
          <>
            <Field label="Designation">
              <TextInput
                value={newUser.staff_designation}
                onChange={(value) => setNewUser({ ...newUser, staff_designation: value })}
              />
            </Field>
            <Field label="Department">
              <Select
                value={newUser.department_id}
                onChange={(value) => setNewUser({ ...newUser, department_id: value })}
                options={[
                  { value: '', label: 'Unassigned' },
                  ...(departments.data?.departments ?? []).map((item: any) => ({
                    value: String(item.id),
                    label: item.name,
                  })),
                ]}
              />
            </Field>
          </>
        )}
        <p className="small muted">
          Accounts created here are real rows in the database, not demo fixtures. Demo data is only produced by the
          seeder.
        </p>
        <div className="tiny muted">Created at {dateTime(new Date().toISOString())} · {relative(new Date().toISOString())}</div>
      </Modal>
    </div>
  )
}
