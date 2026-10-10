/** People & administration: the directory and the configuration it runs on.
 *
 *  Three offices in one screen, because they are read together:
 *
 *    People            - who is on campus, what they are, whether they are active
 *    Places & assets   - departments, hostels, and the reference data those hang off
 *    Rules & targets   - the services, deadlines, rules and approval steps
 *
 *  The previous shape of this page was three tabs of loose cards: a people table
 *  with no totals and no empty state, an inventory of raw count keys, rules with
 *  their conditions dumped as JSON, and approval steps printed as one line of
 *  arrows. Each of those was a list pretending to be a table. Here every section
 *  is a table or a set of tiles, the search covers roll numbers (how a college
 *  actually looks a student up), and a search that matches nobody says so
 *  instead of showing an empty page.
 */

import { useMemo, useState } from 'react'
import { ApiError, api, qs } from '../../lib/api'
import { dateTime, duration, relative } from '../../lib/format'
import { useRemote } from '../../state/hooks'
import { useSession } from '../../state/session'
import {
  Badge,
  Bento,
  BentoItem,
  Button,
  EmptyState,
  ErrorState,
  Field,
  KV,
  LoadingState,
  Modal,
  PageHeader,
  Pagination,
  Panel,
  Select,
  StatTile,
  Tabs,
  TextInput,
  Toolbar,
} from '../../components/ui'

type Tab = 'people' | 'places' | 'config'

interface DirectoryUser {
  id: number
  full_name: string
  email: string
  role: string
  is_active: boolean
  phone: string | null
  roll_number: string | null
  hostel: string | null
  designation: string | null
  department: string | null
  employee_code: string | null
}

/** A file name for each count the summary endpoint reports, so the inventory
 *  reads as English rather than as snake_case keys. */
const COUNT_LABELS: Record<string, string> = {
  users: 'People with accounts',
  students: 'Students',
  staff: 'Staff members',
  departments: 'Departments',
  hostels: 'Hostels',
  rooms: 'Rooms',
  locations: 'QR locations',
  assets: 'Tracked assets',
  services: 'Services',
  workflows: 'Approval steps',
  policies: 'Rules',
  sla_rules: 'Deadline rules',
  cases: 'Requests logged',
  documents: 'Documents issued',
}

const ROLE_WORD: Record<string, string> = {
  STUDENT: 'Student',
  TEACHER: 'Teacher',
  MANAGEMENT: 'Management',
}

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

  const users = useRemote<{ total: number; users: DirectoryUser[] }>(
    tab === 'people' && can('user:manage') ? `admin-users${usersQuery}` : null,
    () => api.get<{ total: number; users: DirectoryUser[] }>(`/admin/users${usersQuery}`),
  )

  // Loaded for the whole page, not just the "Rules & targets" tab: the role
  // filter on People and the reference data on Places & assets both read it, so
  // gating it on one tab left those two showing an empty dropdown and a card
  // stuck on "Loading…".
  const config = useRemote<any>('config-summary', () => api.get('/admin/config/summary'))
  const departments = useRemote<any>('directory-departments', () => api.get('/admin/departments'))
  const hostels = useRemote<any>('directory-hostels', () => api.get('/admin/hostels'))
  const services = useRemote<any>('admin-services', () => api.get('/admin/services'))
  const deadlineRules = useRemote<any>('sla-rules', () => api.get('/sla-rules'))
  const rules = useRemote<any>('policies', () => api.get('/policies'))
  const approvalSteps = useRemote<any>('workflows', () => api.get('/workflows'))

  const counts: Record<string, number> = config.data?.counts ?? {}

  // Services are referenced by key in deadline rules, so resolve key -> name
  // once for the whole page rather than in each row.
  const serviceNames = useMemo(() => {
    const map = new Map<string, string>()
    ;(services.data?.services ?? []).forEach((row: any) => map.set(row.key, row.name))
    return map
  }, [services.data])

  const serviceLabel = (key: string | null | undefined) => (key ? serviceNames.get(key) ?? key : 'Any service')

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

  const toggleActive = async (entry: DirectoryUser) => {
    setBusy(true)
    setError(null)
    try {
      await api.patch(`/admin/users/${entry.id}`, { is_active: !entry.is_active })
      setMessage(`${entry.full_name} is now ${entry.is_active ? 'disabled' : 'active'}.`)
      void users.refresh()
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : 'Update failed.')
    } finally {
      setBusy(false)
    }
  }

  const people = users.data?.users ?? []
  const peopleTotal = users.data?.total ?? people.length
  const filtered = Boolean(roleFilter) || Boolean(search.trim())

  return (
    <div className="stack-lg">
      <PageHeader
        kicker="People & Administration"
        title="Directory & configuration"
        subtitle="The people on campus, the places they work and live in, and the rules the campus runs on."
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

      {/* ============================== PEOPLE ============================== */}
      {tab === 'people' ? (
        !can('user:manage') ? (
          <EmptyState
            title="You do not manage people"
            detail="This office needs the user:manage permission. Ask a management account to grant it."
          />
        ) : (
          <>
            <Bento>
              <BentoItem span={3}>
                <StatTile
                  label="People with accounts"
                  value={counts.users ?? 0}
                  hint="Can sign in to this campus"
                  icon="people"
                  tone="open"
                />
              </BentoItem>
              <BentoItem span={3}>
                <StatTile label="Students" value={counts.students ?? 0} hint="On the rolls" icon="book" tone="ghost" />
              </BentoItem>
              <BentoItem span={3}>
                <StatTile
                  label="Staff members"
                  value={counts.staff ?? 0}
                  hint="Teaching and non-teaching"
                  icon="employment"
                  tone="done"
                />
              </BentoItem>
              <BentoItem span={3}>
                <StatTile
                  label="Departments"
                  value={counts.departments ?? 0}
                  hint="Work is routed to these"
                  icon="dashboard"
                  tone="ghost"
                />
              </BentoItem>
            </Bento>

            <Toolbar
              actions={
                <Button variant="primary" onClick={() => setNewUserOpen(true)}>
                  Add a person
                </Button>
              }
            >
              <div className="toolbar-field">
                <label className="sr-only" htmlFor="u-search">
                  Search by name, email or roll number
                </label>
                <TextInput
                  id="u-search"
                  value={search}
                  onChange={(val) => {
                    setSearch(val)
                    setPage(1)
                  }}
                  placeholder="Search name, email or roll number"
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
                      label: ROLE_WORD[role.key] ?? role.name,
                    })),
                  ]}
                />
              </div>
            </Toolbar>

            {users.loading && !users.data ? <LoadingState label="Loading people" /> : null}
            {users.error && !users.data ? (
              <ErrorState message={users.error} onRetry={() => void users.refresh()} />
            ) : null}

            {users.data ? (
              <div className="results-head">
                <span>
                  <span className="results-count">{peopleTotal}</span> {peopleTotal === 1 ? 'person' : 'people'}
                  {roleFilter ? ` · ${ROLE_WORD[roleFilter] ?? roleFilter.toLowerCase()} only` : ''}
                  {search.trim() ? ` · matching “${search.trim()}”` : ''}
                </span>
              </div>
            ) : null}

            {users.data && people.length === 0 ? (
              <EmptyState
                title={filtered ? 'Nobody matches that search' : 'No accounts on this campus yet'}
                detail={
                  filtered
                    ? 'The search covers names, email addresses and roll numbers. Clear it to see the whole directory.'
                    : 'Add the first account, or import a roster from a CSV, and the directory fills itself.'
                }
                action={
                  filtered ? (
                    <Button
                      onClick={() => {
                        setSearch('')
                        setRoleFilter('')
                        setPage(1)
                      }}
                    >
                      Clear the search
                    </Button>
                  ) : (
                    <Button variant="primary" onClick={() => setNewUserOpen(true)}>
                      Add a person
                    </Button>
                  )
                }
              />
            ) : null}

            {people.length > 0 ? (
              <Panel title="Directory" subtitle="Sorted by name. Disabling an account ends its access at once." flush>
                <div className="table-wrap become-cards">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Person</th>
                        <th>Roll / staff code</th>
                        <th>Role</th>
                        <th>Belongs to</th>
                        <th>Contact</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {people.map((entry) => (
                        <tr key={entry.id}>
                          <td data-label="Person">
                            <span className="bold">{entry.full_name}</span>
                            <div className="mono tiny muted">{entry.email}</div>
                          </td>
                          <td data-label="Roll / staff code">
                            <span className="mono">{entry.roll_number ?? entry.employee_code ?? '—'}</span>
                          </td>
                          <td data-label="Role">
                            <Badge tone={entry.role === 'MANAGEMENT' ? 'agent' : entry.role === 'TEACHER' ? 'open' : 'ghost'}>
                              {ROLE_WORD[entry.role] ?? entry.role.replaceAll('_', ' ').toLowerCase()}
                            </Badge>
                          </td>
                          <td data-label="Belongs to">
                            {entry.department ?? entry.hostel ?? '—'}
                            {entry.designation ? <div className="tiny muted">{entry.designation}</div> : null}
                            {entry.hostel && entry.department ? (
                              <div className="tiny muted">Resident: {entry.hostel}</div>
                            ) : null}
                          </td>
                          <td data-label="Contact">
                            <span className="mono tiny">{entry.phone ?? '—'}</span>
                          </td>
                          <td data-label="Status">
                            {entry.is_active ? <Badge tone="done">active</Badge> : <Badge tone="dead">disabled</Badge>}
                          </td>
                          <td data-label="Actions">
                            <Button size="sm" variant="ghost" busy={busy} onClick={() => void toggleActive(entry)}>
                              {entry.is_active ? 'Disable' : 'Enable'}
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>
            ) : null}

            {peopleTotal > 0 ? (
              <Pagination
                page={page}
                pageSize={pageSize}
                total={peopleTotal}
                onChangePage={setPage}
                onChangePageSize={setPageSize}
                pageSizeOptions={[10, 25, 50, 100]}
              />
            ) : null}
          </>
        )
      ) : null}

      {/* ========================== PLACES & ASSETS ========================== */}
      {tab === 'places' ? (
        <>
          <Bento>
            <BentoItem span={3}>
              <StatTile label="Departments" value={counts.departments ?? 0} hint="Named work owners" icon="dashboard" tone="ghost" />
            </BentoItem>
            <BentoItem span={3}>
              <StatTile label="Hostels" value={counts.hostels ?? 0} hint={`${counts.rooms ?? 0} rooms`} icon="home" tone="ghost" />
            </BentoItem>
            <BentoItem span={3}>
              <StatTile
                label="QR locations"
                value={counts.locations ?? 0}
                hint="Scanned to raise a request"
                icon="setup"
                tone="open"
              />
            </BentoItem>
            <BentoItem span={3}>
              <StatTile label="Tracked assets" value={counts.assets ?? 0} hint="Attached to locations" icon="list" tone="ghost" />
            </BentoItem>
          </Bento>

          <Panel
            title="Departments"
            subtitle="Every request is routed to one of these, scored by its time multiplier."
            flush
          >
            <div className="table-wrap become-cards">
              <table className="data">
                <thead>
                  <tr>
                    <th>Department</th>
                    <th>Code</th>
                    <th>Kind</th>
                    <th>Time multiplier</th>
                    <th>Staff</th>
                    <th>Open requests</th>
                  </tr>
                </thead>
                <tbody>
                  {(departments.data?.departments ?? []).map((row: any) => (
                    <tr key={row.id}>
                      <td data-label="Department">
                        <span className="bold">{row.name}</span>
                      </td>
                      <td data-label="Code">
                        <span className="mono">{row.code}</span>
                      </td>
                      <td data-label="Kind">{row.kind}</td>
                      <td data-label="Time multiplier">
                        ×{row.sla_multiplier}
                        <span className="tiny muted"> {row.sla_multiplier > 1 ? '(slower than normal)' : '(normal)'}</span>
                      </td>
                      <td data-label="Staff">{row.staff_count}</td>
                      <td data-label="Open requests">
                        {row.open_cases > 0 ? <Badge tone="warn">{row.open_cases}</Badge> : <span className="muted">0</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel title="Hostels" subtitle="Occupancy and the work outstanding in each." flush>
            <div className="table-wrap become-cards">
              <table className="data">
                <thead>
                  <tr>
                    <th>Hostel</th>
                    <th>Code</th>
                    <th>Residents</th>
                    <th>Blocks</th>
                    <th>Open requests</th>
                  </tr>
                </thead>
                <tbody>
                  {(hostels.data?.hostels ?? []).map((hostel: any) => (
                    <tr key={hostel.id}>
                      <td data-label="Hostel">
                        <span className="bold">{hostel.name}</span>
                        <div className="tiny muted">{hostel.gender ?? 'mixed'}</div>
                      </td>
                      <td data-label="Code">
                        <span className="mono">{hostel.code}</span>
                      </td>
                      <td data-label="Residents">{hostel.hostellers}</td>
                      <td data-label="Blocks">
                        {hostel.blocks?.length
                          ? hostel.blocks.map((block: any) => block.name).join(', ')
                          : 'No blocks defined'}
                      </td>
                      <td data-label="Open requests">
                        {hostel.open_cases > 0 ? (
                          <Badge tone={hostel.open_cases > 3 ? 'urgent' : 'warn'}>{hostel.open_cases}</Badge>
                        ) : (
                          <span className="muted">0</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel title="Academic reference data" subtitle="The branches, years and batches everything else hangs off.">
            {config.data ? (
              <KV
                items={[
                  {
                    label: 'Branches',
                    value: (config.data.reference_data?.branches ?? []).map((item: any) => item.code).join(', ') || '—',
                  },
                  {
                    label: 'Years',
                    value: (config.data.reference_data?.years ?? []).map((item: any) => item.name).join(', ') || '—',
                  },
                  {
                    label: 'Batches',
                    value: (config.data.reference_data?.batches ?? []).map((item: any) => item.name).join(', ') || '—',
                  },
                ]}
              />
            ) : (
              <LoadingState label="Loading reference data" />
            )}
          </Panel>
        </>
      ) : null}

      {/* ========================== RULES & TARGETS ========================== */}
      {tab === 'config' ? (
        <>
          <Bento>
            <BentoItem span={3}>
              <StatTile label="Services" value={counts.services ?? 0} hint="What can be requested" icon="cases" tone="open" />
            </BentoItem>
            <BentoItem span={3}>
              <StatTile
                label="Deadline rules"
                value={counts.sla_rules ?? 0}
                hint="Targets per service and urgency"
                icon="clock"
                tone="warn"
              />
            </BentoItem>
            <BentoItem span={3}>
              <StatTile label="Rules" value={counts.policies ?? 0} hint="Eligibility and limits" icon="gate" tone="ghost" />
            </BentoItem>
            <BentoItem span={3}>
              <StatTile
                label="Approval steps"
                value={counts.workflows ?? 0}
                hint="The route a request takes"
                icon="approvals"
                tone="ghost"
              />
            </BentoItem>
          </Bento>

          <Panel
            title="Deadline rules"
            subtitle="How long each kind of request is given, and who takes it over when it runs late."
            flush
          >
            {(deadlineRules.data?.rules ?? []).length === 0 ? (
              <div style={{ padding: 'var(--sp-4)' }}>
                <p className="muted small">No deadline rules configured.</p>
              </div>
            ) : (
              <div className="table-wrap become-cards">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Service</th>
                      <th>Urgency</th>
                      <th>Target</th>
                      <th>Flagged at</th>
                      <th>Who takes over</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(deadlineRules.data?.rules ?? []).map((row: any, index: number) => (
                      <tr key={`${row.service_key ?? 'all'}-${row.priority}-${index}`}>
                        <td data-label="Service">{serviceLabel(row.service_key)}</td>
                        <td data-label="Urgency">
                          <Badge tone={row.priority === 'URGENT' || row.priority === 'CRITICAL' ? 'urgent' : 'ghost'}>
                            {String(row.priority).toLowerCase()}
                          </Badge>
                        </td>
                        <td data-label="Target">{duration(row.target_minutes)}</td>
                        <td data-label="Flagged at">
                          {Math.round(row.at_risk_ratio * 100)}% of the target used
                        </td>
                        <td data-label="Who takes over">
                          {row.escalate_to_role
                            ? String(row.escalate_to_role).replaceAll('_', ' ').toLowerCase()
                            : 'No hand-over'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <Panel
            title="Rules"
            subtitle="Checked before a request is routed. Conditions are collapsed until you ask for them."
            flush
          >
            {(rules.data?.policies ?? []).length === 0 ? (
              <div style={{ padding: 'var(--sp-4)' }}>
                <p className="muted small">No rules configured.</p>
              </div>
            ) : (
              <div className="table-wrap become-cards">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Rule</th>
                      <th>Effect</th>
                      <th>Applies to</th>
                      <th>What it does</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(rules.data?.policies ?? []).map((row: any) => (
                      <tr key={row.key}>
                        <td data-label="Rule">
                          <span className="bold">{row.name}</span>
                          <div className="mono tiny muted">{row.key}</div>
                        </td>
                        <td data-label="Effect">
                          <Badge tone={row.effect === 'ALLOW' ? 'done' : row.effect === 'DENY' ? 'urgent' : 'warn'}>
                            {String(row.effect).toLowerCase()}
                          </Badge>
                        </td>
                        <td data-label="Applies to">{serviceLabel(row.service_key)}</td>
                        <td data-label="What it does">
                          {row.message}
                          {row.conditions && Object.keys(row.conditions).length ? (
                            <details style={{ marginTop: 6 }}>
                              <summary className="tiny muted" style={{ cursor: 'pointer' }}>
                                Conditions ({Object.keys(row.conditions).length})
                              </summary>
                              <pre className="mono tiny" style={{ whiteSpace: 'pre-wrap', marginTop: 4 }}>
                                {JSON.stringify(row.conditions, null, 1)}
                              </pre>
                            </details>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <Panel
            title="Approval steps"
            subtitle="The route a request takes, in order, for each service that needs one."
          >
            {(approvalSteps.data?.workflows ?? []).length === 0 ? (
              <p className="muted small">No approval routes configured.</p>
            ) : (
              <ul className="list-reset stack" style={{ gap: 'var(--sp-4)' }}>
                {(approvalSteps.data?.workflows ?? []).map((row: any) => (
                  <li key={row.key ?? row.name}>
                    <div className="row-between wrap" style={{ gap: 'var(--sp-2)' }}>
                      <span className="bold">{row.name}</span>
                      <span className="tiny muted">
                        {(row.steps ?? []).length} step{(row.steps ?? []).length === 1 ? '' : 's'}
                        {row.service_key ? ` · ${serviceLabel(row.service_key)}` : ''}
                      </span>
                    </div>
                    <div className="row wrap" style={{ gap: 6, marginTop: 8 }}>
                      {(row.steps ?? []).map((step: any, index: number) => (
                        <span key={step.key ?? index} className="row" style={{ gap: 6, alignItems: 'center' }}>
                          <Badge tone="ghost">
                            {index + 1}. {step.name ?? String(step.key).replaceAll('_', ' ').toLowerCase()}
                          </Badge>
                          {index < (row.steps ?? []).length - 1 ? (
                            <span className="muted tiny" aria-hidden="true">
                              →
                            </span>
                          ) : null}
                        </span>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Services" subtitle="What the campus accepts requests for, and who may raise each one." flush>
            <div className="table-wrap become-cards">
              <table className="data">
                <thead>
                  <tr>
                    <th>Service</th>
                    <th>Category</th>
                    <th>Default target</th>
                    <th>Who may raise it</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(services.data?.services ?? []).map((row: any) => (
                    <tr key={row.key}>
                      <td data-label="Service">
                        <span className="bold">
                          {row.icon} {row.name}
                        </span>
                        <div className="mono tiny muted">{row.key}</div>
                      </td>
                      <td data-label="Category">{row.category}</td>
                      <td data-label="Default target">{duration(row.default_sla_minutes)}</td>
                      <td data-label="Who may raise it">
                        {row.allowed_requester_roles?.length
                          ? row.allowed_requester_roles
                              .map((role: string) => ROLE_WORD[role] ?? role.toLowerCase())
                              .join(', ')
                          : 'Anyone signed in'}
                      </td>
                      <td data-label="Status">
                        {row.is_active ? <Badge tone="done">active</Badge> : <Badge tone="dead">off</Badge>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel title="Everything configured" subtitle="The rest of the reference data, counted as the engines see it.">
            <Bento tight>
              {Object.entries(counts)
                .filter(([key]) => !['users', 'students', 'staff', 'departments', 'services', 'sla_rules', 'policies', 'workflows'].includes(key))
                .map(([key, value]) => (
                  <BentoItem key={key} span={3}>
                    <StatTile
                      label={COUNT_LABELS[key] ?? key.replaceAll('_', ' ')}
                      value={value}
                      icon="list"
                      tone="ghost"
                    />
                  </BentoItem>
                ))}
            </Bento>
          </Panel>
        </>
      ) : null}

      <Modal
        open={newUserOpen}
        onClose={() => setNewUserOpen(false)}
        title="Add a person"
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
              { value: 'TEACHER', label: 'Teacher' },
              { value: 'MANAGEMENT', label: 'Management' },
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
        <div className="tiny muted">
          Created at {dateTime(new Date().toISOString())} · {relative(new Date().toISOString())}
        </div>
      </Modal>
    </div>
  )
}
