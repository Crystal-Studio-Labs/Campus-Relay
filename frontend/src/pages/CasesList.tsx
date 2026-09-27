/** Case list.
 *
 *  Shared by every role; what changes is the filter set offered and whether the
 *  requester is shown. Data scope is enforced server-side, so this screen never
 *  has to be trusted for privacy - it just has to be pleasant to use.
 *
 *  Structure, top to bottom, the same on every list in the product:
 *    1. header with the match count
 *    2. filter tabs (the primary cut)
 *    3. toolbar (search + order)
 *    4. a results strip: how many of how many, under which filter
 *    5. the structured case rows
 *    6. pagination
 */

import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api, qs } from '../lib/api'
import { useRemote, useSyncState } from '../state/hooks'
import { useSession } from '../state/session'
import type { CaseBrief } from '../lib/types'
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  Pagination,
  Select,
  Tabs,
  TextInput,
  Toolbar,
} from '../components/ui'
import { CaseList } from '../components/CaseCard'

interface CasePage {
  total: number
  limit: number
  offset: number
  cases: CaseBrief[]
}

type Filter = 'open' | 'all' | 'mine' | 'assigned' | 'breached' | 'approval' | 'verify'

const FILTER_LABELS: Record<Filter, string> = {
  open: 'Open',
  all: 'All in scope',
  mine: 'Raised by me',
  assigned: 'Assigned to me',
  breached: 'SLA breached',
  approval: 'Awaiting approval',
  verify: 'Awaiting verification',
}

export function CasesListPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const sync = useSyncState()
  const { can } = useSession()

  const initialFilter = (params.get('filter') as Filter) || 'open'
  const [filter, setFilter] = useState<Filter>(initialFilter)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<'recent' | 'oldest' | 'priority' | 'due'>('recent')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(25)

  const query = useMemo(() => {
    const base: Record<string, string | number | boolean | undefined> = {
      limit,
      offset: (page - 1) * limit,
      sort,
      q: search.trim() || undefined,
    }
    if (filter === 'open') base.open_only = true
    if (filter === 'mine') base.mine = true
    if (filter === 'assigned') base.assigned_to_me = true
    if (filter === 'breached') base.sla_state = 'BREACHED'
    if (filter === 'approval') base.status = 'WAITING_FOR_APPROVAL'
    if (filter === 'verify') base.status = 'VERIFICATION_REQUIRED'
    return qs(base)
  }, [filter, search, sort, limit, page])

  const { data, error, loading, stale, cachedAt, refresh } = useRemote<CasePage>(
    `cases${query}`,
    () => api.get<CasePage>(`/cases${query}`),
    { cacheKey: 'cases' },
  )

  const tabs: { id: Filter; label: string }[] = [{ id: 'open', label: 'Open' }]
  if (can('case:read_own')) tabs.push({ id: 'mine', label: 'Raised by me' })
  if (can('case:update_status')) tabs.push({ id: 'assigned', label: 'Assigned to me' })
  if (can('case:read_scope') || can('case:read_all')) tabs.push({ id: 'all', label: 'All in scope' })
  tabs.push({ id: 'breached', label: 'SLA breached' })
  if (can('approval:decide')) tabs.push({ id: 'approval', label: 'Awaiting approval' })
  tabs.push({ id: 'verify', label: 'Awaiting verification' })

  const shown = data?.cases.length ?? 0
  const total = data?.total ?? 0

  return (
    <div className="stack-lg">
      <PageHeader
        title="Cases"
        subtitle="Your cases, and whatever your role is allowed to see beyond them"
        actions={total ? <Badge tone="ghost">{total} matching</Badge> : null}
      />

      <Tabs
        tabs={tabs}
        active={filter}
        onChange={(next) => {
          setFilter(next)
          setPage(1)
          setParams(next === 'open' ? {} : { filter: next })
        }}
      />

      <Toolbar
        actions={
          <>
            {search ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearch('')
                  setPage(1)
                }}
              >
                Clear search
              </Button>
            ) : null}
            <div className="toolbar-field">
              <label className="sr-only" htmlFor="case-sort">
                Order by
              </label>
              <Select
                id="case-sort"
                value={sort}
                onChange={(value) => {
                  setSort(value as typeof sort)
                  setPage(1)
                }}
                options={[
                  { value: 'recent', label: 'Newest first' },
                  { value: 'oldest', label: 'Oldest first' },
                  { value: 'priority', label: 'Most urgent first' },
                  { value: 'due', label: 'Closest to target first' },
                ]}
              />
            </div>
          </>
        }
      >
        <label className="sr-only" htmlFor="case-search">
          Search cases
        </label>
        <TextInput
          id="case-search"
          value={search}
          onChange={(val) => {
            setSearch(val)
            setPage(1)
          }}
          inputMode="search"
          placeholder="Search case number, title or description"
        />
      </Toolbar>

      {stale ? (
        <div className="banner banner-info">
          Showing the last list saved on this device (
          {cachedAt ? new Date(cachedAt).toLocaleString() : 'unknown time'}).
        </div>
      ) : null}

      {loading && !data ? <LoadingState label="Loading cases" /> : null}
      {error && !data ? <ErrorState message={error} onRetry={() => void refresh()} offline={!sync.online} /> : null}

      {data ? (
        <div className="results-head">
          <span>
            <span className="results-count">{shown}</span> of {total} · {FILTER_LABELS[filter]}
            {search.trim() ? ` · matching “${search.trim()}”` : ''}
          </span>
          {loading && data ? <span>Refreshing…</span> : null}
        </div>
      ) : null}

      {data && data.cases.length === 0 ? (
        <EmptyState
          title="No cases match this filter"
          detail="Try a different tab, or clear the search."
          action={
            <Button variant="primary" onClick={() => navigate('/report')}>
              Raise a request
            </Button>
          }
        />
      ) : null}

      {data?.cases.length ? (
        <CaseList
          cases={data.cases}
          onOpen={(item) => navigate(`/cases/${item.id}`)}
          showRequester={can('case:read_scope') || can('case:read_all')}
          showAssignee={can('case:assign')}
        />
      ) : null}

      {data && total > 0 ? (
        <Pagination
          page={page}
          pageSize={limit}
          total={total}
          onChangePage={setPage}
          onChangePageSize={(sz) => {
            setLimit(sz)
            setPage(1)
          }}
          pageSizeOptions={[15, 25, 50]}
        />
      ) : null}
    </div>
  )
}
