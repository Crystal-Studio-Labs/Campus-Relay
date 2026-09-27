/** Notice board.
 *
 *  A notice is not a wall of text: it has a lifecycle (draft -> scheduled ->
 *  published -> expired), an audience, and per-person tracking. The inbox shows
 *  only what was addressed to *me*, which is what makes the read rate meaningful
 *  instead of decorative.
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError, api } from '../lib/api'
import { useRemote, useSyncState } from '../state/hooks'
import { useSession } from '../state/session'
import { enqueue } from '../lib/offline'
import type { NoticeBrief } from '../lib/types'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  Pagination,
  SectionTitle,
  Tabs,
} from '../components/ui'
import { NoticeCard } from '../components/NoticeCard'

interface Inbox {
  unread: NoticeBrief[]
  needs_action: NoticeBrief[]
  all: NoticeBrief[]
}

interface NoticeList {
  total: number
  notices: NoticeBrief[]
  pending_acknowledgements: { notice_id: number; title: string }[]
}

export function NoticesPage() {
  const navigate = useNavigate()
  const sync = useSyncState()
  const { can } = useSession()
  const [tab, setTab] = useState<'needs_action' | 'unread' | 'all'>('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(12)

  const managerView = can('notice:publish') || can('notice:manage')
  const inbox = useRemote<Inbox>('notices-inbox', () => api.get<Inbox>('/notices/inbox'), {
    cacheKey: 'notices',
  })
  const managed = useRemote<NoticeList>(
    managerView ? 'notices-managed' : null,
    () => api.get<NoticeList>('/notices?limit=100'),
    { cacheKey: 'notices' },
  )

  const list = managerView
    ? tab === 'needs_action'
      ? (managed.data?.notices ?? []).filter((item) => item.acknowledgement_required)
      : tab === 'unread'
        ? (managed.data?.notices ?? []).filter((item) => !item.my_state?.read_at)
        : (managed.data?.notices ?? [])
    : tab === 'needs_action'
      ? inbox.data?.needs_action ?? []
      : tab === 'unread'
        ? inbox.data?.unread ?? []
        : inbox.data?.all ?? []

  const loading = managerView ? managed.loading : inbox.loading
  const error = managerView ? managed.error : inbox.error

  const open = async (notice: NoticeBrief) => {
    if (!notice.my_state?.read_at) {
      try {
        await api.post(`/notices/${notice.id}/read`, {})
      } catch (requestError) {
        if (requestError instanceof ApiError && requestError.status === 0) {
          await enqueue({
            operation: 'NOTICE_READ',
            payload: { notice_id: notice.id },
            label: `Mark notice read: ${notice.title.slice(0, 40)}`,
          })
        }
      }
    }
    navigate(`/notices/${notice.id}`)
  }

  return (
    <div className="stack-lg">
      <PageHeader
        title="Notices"
        subtitle="Announcements addressed to you by campus, hostel, branch, year or role"
        actions={<Badge tone="ghost">{list.length} shown</Badge>}
      />

      <div data-guide="notices-tabs">
        <Tabs
          tabs={[
            { id: 'all', label: 'All' },
            { id: 'unread', label: 'Unread', count: managerView ? undefined : inbox.data?.unread.length },
            {
              id: 'needs_action',
              label: 'Needs action',
              count: managerView ? managed.data?.pending_acknowledgements.length : inbox.data?.needs_action.length,
            },
          ]}
          active={tab}
          onChange={setTab}
        />
      </div>

      {!sync.online ? (
        <div className="banner banner-offline">
          Offline — showing the notices saved on this device. Reading a notice offline is recorded and synced later.
        </div>
      ) : null}

      {loading && !list.length ? <LoadingState label="Loading notices" /> : null}
      {error && !list.length ? (
        <ErrorState
          message={error}
          onRetry={() => void (managerView ? managed.refresh() : inbox.refresh())}
          offline={!sync.online}
        />
      ) : null}

      {!loading && list.length === 0 ? (
        <EmptyState
          title={tab === 'needs_action' ? 'Nothing needs your action' : 'No notices here'}
          detail={
            tab === 'needs_action'
              ? 'When an urgent notice requires acknowledgement it appears here until you respond.'
              : 'Notices addressed to you — by campus, hostel, branch, year or role — appear here.'
          }
        />
      ) : null}

      <ul className="list-reset card-columns" data-guide="notices-list">
        {list.slice((page - 1) * pageSize, page * pageSize).map((notice) => (
          <li key={notice.id}>
            <NoticeCard notice={notice} onOpen={() => void open(notice)} showAnalytics={managerView} />
          </li>
        ))}
      </ul>

      {list.length > pageSize ? (
        <Pagination
          page={page}
          pageSize={pageSize}
          total={list.length}
          onChangePage={setPage}
          onChangePageSize={(s) => {
            setPageSize(s)
            setPage(1)
          }}
          pageSizeOptions={[6, 12, 24, 48]}
        />
      ) : null}

      {managerView ? (
        <Card className="card-flat">
          <SectionTitle>Authoring</SectionTitle>
          <Button variant="primary" block onClick={() => navigate('/notices/studio')}>
            Open the notice studio
          </Button>
        </Card>
      ) : null}
    </div>
  )
}
