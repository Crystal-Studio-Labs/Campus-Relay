/** Alerts (notifications) + preferences + delivery channels.
 *
 *  The distinction the UI keeps sharp: a *notice* is an announcement everyone
 *  got; a *notification* is something addressed to me about my own stuff. Both
 *  live here so a person has one place to check, but they are labelled.
 *
 *  An external channel is only offered as a live choice when the institution has
 *  configured a provider for it; otherwise it is shown, unconfigured, with the
 *  reason. That is deliberate - a switch that does nothing is worse than none,
 *  and the app never claims it sent something it did not.
 */

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError, api, qs } from '../lib/api'
import { useRemote, useSyncState } from '../state/hooks'
import { enqueue } from '../lib/offline'
import { useSession } from '../state/session'
import type { AppNotification } from '../lib/types'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  LoadingState,
  PageHeader,
  Pagination,
  SectionTitle,
  Tabs,
  TextInput,
} from '../components/ui'
import { NotificationRow } from '../components/NoticeCard'

interface NotificationPage {
  total: number
  unread: number
  notifications: AppNotification[]
}

interface Preference {
  category: string
  in_app: boolean
  push: boolean
  telegram: boolean
  whatsapp: boolean
  locked: boolean
  reason: string | null
}

interface ChannelInfo {
  configured: boolean
  note: string
}

interface PreferencesPayload {
  preferences: Preference[]
  user: {
    telegram_chat_id: string | null
    whatsapp_number: string | null
    phone: string | null
  }
  channels: Record<string, ChannelInfo>
}

export function NotificationsPage() {
  const navigate = useNavigate()
  const sync = useSyncState()
  const { can } = useSession()
  const [tab, setTab] = useState<'all' | 'unread' | 'preferences'>('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [message, setMessage] = useState<string | null>(null)

  const query = qs({
    unread_only: tab === 'unread' ? true : undefined,
    limit: pageSize,
    offset: (page - 1) * pageSize,
  })
  const { data, loading, error, refresh } = useRemote<NotificationPage>(
    tab === 'preferences' ? null : `notifications${query}`,
    () => api.get<NotificationPage>(`/notifications${query}`),
    { cacheKey: 'notifications' },
  )

  const preferences = useRemote<PreferencesPayload>(
    tab === 'preferences' ? 'notification-preferences' : null,
    () => api.get<PreferencesPayload>('/notification-preferences'),
  )

  const openTarget = async (item: AppNotification) => {
    if (!item.is_read) {
      try {
        await api.post(`/notifications/${item.id}/read`, {})
      } catch (requestError) {
        if (requestError instanceof ApiError && requestError.status === 0) {
          await enqueue({
            operation: 'NOTIFICATION_READ',
            payload: { notification_id: item.id },
            label: `Mark alert read: ${item.title.slice(0, 40)}`,
          })
        }
      }
      void refresh()
    }
    if (item.case_id) navigate(`/cases/${item.case_id}`)
    else if (item.notice_id) navigate(`/notices/${item.notice_id}`)
  }

  return (
    <div className="stack-lg">
      <PageHeader
        title="Alerts"
        subtitle="Things addressed to you about your own cases, approvals and notices"
        actions={data?.unread ? <Badge tone="open">{data.unread} unread</Badge> : null}
      />

      <Tabs
        tabs={[
          { id: 'all', label: 'All', count: data?.total },
          { id: 'unread', label: 'Unread', count: data?.unread },
          { id: 'preferences', label: 'Preferences' },
        ]}
        active={tab}
        onChange={(t) => {
          setTab(t)
          setPage(1)
        }}
      />

      {message ? <div className="banner banner-info">{message}</div> : null}

      {tab !== 'preferences' ? (
        <>
          <div className="row wrap">
            <Button
              variant="ghost"
              onClick={async () => {
                try {
                  await api.post('/notifications/read-all', {})
                  setMessage('All alerts marked as read.')
                  void refresh()
                } catch {
                  setMessage('Could not reach the server to mark them read.')
                }
              }}
              disabled={!data?.unread}
            >
              Mark all read
            </Button>
            <Button variant="ghost" onClick={() => void refresh()}>
              Refresh
            </Button>
          </div>

          {loading && !data ? <LoadingState label="Loading alerts" /> : null}
          {error && !data ? <ErrorState message={error} onRetry={() => void refresh()} offline={!sync.online} /> : null}
          {data && data.notifications.length === 0 ? (
            <EmptyState
              title={tab === 'unread' ? 'Nothing unread' : 'No alerts yet'}
              detail="Alerts appear here when your cases change, approvals are needed, or something urgent is published."
            />
          ) : null}
          <ul className="list-reset stack">
            {data?.notifications.map((item) => (
              <NotificationRow
                key={item.id}
                item={item}
                onOpen={() => void openTarget(item)}
                onMarkRead={async () => {
                  try {
                    await api.post(`/notifications/${item.id}/read`, {})
                  } catch {
                    await enqueue({
                      operation: 'NOTIFICATION_READ',
                      payload: { notification_id: item.id },
                      label: `Mark alert read: ${item.title.slice(0, 40)}`,
                    })
                  }
                  void refresh()
                }}
              />
            ))}
          </ul>

          {data && data.total > 0 ? (
            <Pagination
              page={page}
              pageSize={pageSize}
              total={data.total}
              onChangePage={setPage}
              onChangePageSize={setPageSize}
              pageSizeOptions={[10, 20, 50]}
            />
          ) : null}
        </>
      ) : (
        <div className="stack-lg">
          <ChannelsPanel payload={preferences.data} canEdit={can('notification:preference_manage')} onSaved={() => void preferences.refresh()} />
          <PreferencesPanel
            data={preferences.data?.preferences}
            channels={preferences.data?.channels}
            loading={preferences.loading}
            canEdit={can('notification:preference_manage')}
            onSaved={() => void preferences.refresh()}
          />
        </div>
      )}

      <Card className="card-flat">
        <SectionTitle>How delivery actually works here</SectionTitle>
        <p className="small">
          In-app alerts are real: they are stored in the database and every read is recorded. Telegram and WhatsApp
          are real adapters, but a channel is only used once the institution has configured a provider for it — until
          then it is reported as not configured and nothing is queued. Delivery to a provider is confirmed from that
          provider&apos;s response; a read receipt is never claimed. Nothing here is faked to look better in a demo.
        </p>
      </Card>
    </div>
  )
}

/** Channel status + where this user can be reached. Shown above the switches so
 *  a person can see why an option is greyed out before they look for it. */
function ChannelsPanel({
  payload,
  canEdit,
  onSaved,
}: {
  payload?: PreferencesPayload | null
  canEdit: boolean
  onSaved: () => void
}) {
  const [chatId, setChatId] = useState('')
  const [number, setNumber] = useState('')
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [queued, setQueued] = useState<string[] | null>(null)

  useEffect(() => {
    setChatId(payload?.user.telegram_chat_id ?? '')
    setNumber(payload?.user.whatsapp_number ?? '')
  }, [payload?.user.telegram_chat_id, payload?.user.whatsapp_number])

  const telegram = payload?.channels?.telegram
  const whatsapp = payload?.channels?.whatsapp

  return (
    <Card>
      <SectionTitle right={<Badge tone="ghost">external channels</Badge>}>Your delivery channels</SectionTitle>

      <div className="stack" style={{ gap: 10, marginBottom: 14 }}>
        <div className="row-between">
          <div>
            <div className="bold small">Telegram</div>
            <div className="tiny muted">{telegram?.note ?? 'Checking…'}</div>
          </div>
          <Badge tone={telegram?.configured ? 'done' : 'ghost'}>{telegram?.configured ? 'configured' : 'not configured'}</Badge>
        </div>
        <div className="row-between">
          <div>
            <div className="bold small">WhatsApp</div>
            <div className="tiny muted">{whatsapp?.note ?? 'Checking…'}</div>
          </div>
          <Badge tone={whatsapp?.configured ? 'done' : 'ghost'}>{whatsapp?.configured ? 'configured' : 'not configured'}</Badge>
        </div>
      </div>

      <div className="grid-2">
        <Field label="Telegram chat id" hint="Message your campus bot and paste the chat id, e.g. 123456789." htmlFor="tg-chat">
          <TextInput id="tg-chat" value={chatId} onChange={setChatId} placeholder="123456789" />
        </Field>
        <Field label="WhatsApp number" hint="International format, digits only, e.g. 919876543210." htmlFor="wa-number">
          <TextInput id="wa-number" value={number} onChange={setNumber} placeholder="919876543210" />
        </Field>
      </div>

      {message ? (
        <div className="banner banner-info" style={{ marginTop: 10 }}>
          {message}
        </div>
      ) : null}
      {queued && queued.length ? (
        <p className="small" style={{ marginTop: 6 }}>
          Queued for delivery: <span className="mono">{queued.join(', ')}</span>
        </p>
      ) : null}

      <div className="row wrap" style={{ marginTop: 12 }}>
        <Button
          variant="primary"
          busy={saving}
          disabled={!canEdit}
          onClick={async () => {
            setSaving(true)
            setMessage(null)
            try {
              await api.put('/notification-channels', { telegram_chat_id: chatId, whatsapp_number: number })
              setMessage('Channel addresses saved.')
              onSaved()
            } catch {
              setMessage('Could not save your channel addresses.')
            } finally {
              setSaving(false)
            }
          }}
        >
          Save addresses
        </Button>
        <Button
          variant="ghost"
          busy={testing}
          onClick={async () => {
            setTesting(true)
            setMessage(null)
            setQueued(null)
            try {
              const result = await api.post<{ queued: string[]; note: string }>('/notification-channels/test', {})
              setQueued(result.queued)
              setMessage(result.note)
            } catch {
              setMessage('Could not send a test right now.')
            } finally {
              setTesting(false)
            }
          }}
        >
          Send test
        </Button>
      </div>
    </Card>
  )
}

function PreferencesPanel({
  data,
  channels,
  loading,
  canEdit,
  onSaved,
}: {
  data?: Preference[]
  channels?: Record<string, ChannelInfo>
  loading: boolean
  canEdit: boolean
  onSaved: () => void
}) {
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [local, setLocal] = useState<
    Record<string, { in_app: boolean; push: boolean; telegram: boolean; whatsapp: boolean }>
  >({})

  if (loading && !data) return <LoadingState label="Loading preferences" />
  if (!data) return <EmptyState title="Preferences unavailable" />

  const valueFor = (item: Preference) =>
    local[item.category] ?? {
      in_app: item.in_app,
      push: item.push,
      telegram: item.telegram,
      whatsapp: item.whatsapp,
    }

  const toggle = (category: string, key: 'in_app' | 'push' | 'telegram' | 'whatsapp', base: Preference) =>
    setLocal((current) => ({
      ...current,
      [category]: { ...(current[category] ?? valueFor(base)), [key]: !(current[category] ?? valueFor(base))[key] },
    }))

  const telegramReady = channels?.telegram?.configured ?? false
  const whatsappReady = channels?.whatsapp?.configured ?? false

  return (
    <Card>
      <p className="small muted">
        Institutional-critical alerts (safety, emergency notices) cannot be switched off. Everything else is yours
        to control. External channels stay greyed out until the institution configures a provider.
      </p>
      <ul className="list-reset stack">
        {data.map((item) => {
          const value = valueFor(item)
          return (
            <li
              key={item.category}
              className="row-between"
              style={{ borderBottom: '1px solid var(--line-soft)', paddingBottom: 8, gap: 8, flexWrap: 'wrap' }}
            >
              <div>
                <div className="bold">{item.category.replaceAll('_', ' ').toLowerCase()}</div>
                {item.locked ? <div className="tiny muted">{item.reason}</div> : null}
              </div>
              <div className="row wrap" style={{ gap: 8 }}>
                <Button
                  size="sm"
                  variant={value.in_app ? 'success' : 'ghost'}
                  disabled={item.locked || !canEdit}
                  onClick={() => toggle(item.category, 'in_app', item)}
                >
                  In-app
                </Button>
                <Button
                  size="sm"
                  variant={value.push ? 'info' : 'ghost'}
                  disabled={!canEdit}
                  onClick={() => toggle(item.category, 'push', item)}
                >
                  Push
                </Button>
                <Button
                  size="sm"
                  variant={value.telegram ? 'info' : 'ghost'}
                  disabled={!canEdit || !telegramReady}
                  title={telegramReady ? undefined : 'No Telegram bot configured on this deployment.'}
                  onClick={() => toggle(item.category, 'telegram', item)}
                >
                  Telegram
                </Button>
                <Button
                  size="sm"
                  variant={value.whatsapp ? 'info' : 'ghost'}
                  disabled={!canEdit || !whatsappReady}
                  title={whatsappReady ? undefined : 'No WhatsApp Cloud API credentials configured on this deployment.'}
                  onClick={() => toggle(item.category, 'whatsapp', item)}
                >
                  WhatsApp
                </Button>
              </div>
            </li>
          )
        })}
      </ul>
      {message ? (
        <div className="banner banner-info" style={{ marginTop: 12 }}>
          {message}
        </div>
      ) : null}
      <Button
        variant="primary"
        busy={saving}
        disabled={!canEdit || !Object.keys(local).length}
        style={{ marginTop: 12 }}
        onClick={async () => {
          setSaving(true)
          setMessage(null)
          try {
            const payload = Object.entries(local).map(([category, value]) => ({ category, ...value }))
            const result = await api.put<{ updated: number; rejected: { category: string; reason: string }[] }>(
              '/notification-preferences',
              payload,
            )
            setMessage(
              result.rejected.length
                ? `${result.updated} saved. ${result.rejected.length} could not be changed: ${result.rejected
                    .map((item) => item.category)
                    .join(', ')}.`
                : `${result.updated} preference(s) saved.`,
            )
            setLocal({})
            onSaved()
          } catch {
            setMessage('Could not save preferences right now.')
          } finally {
            setSaving(false)
          }
        }}
      >
        Save preferences
      </Button>
    </Card>
  )
}
