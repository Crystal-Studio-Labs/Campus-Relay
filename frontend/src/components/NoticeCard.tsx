/** Notice and notification presentation. */

import { dateTime, noticeTone, priorityTone, relative } from '../lib/format'
import type { AppNotification, NoticeBrief } from '../lib/types'
import { Badge, Button, Card } from './ui'

export function NoticeCard({
  notice,
  onOpen,
  showAnalytics,
}: {
  notice: NoticeBrief
  onOpen: () => void
  showAnalytics?: boolean
}) {
  const state = notice.my_state
  const needsAck = Boolean(state?.needs_acknowledgement)
  const unread = state ? !state.read_at : false
  return (
    <Card
      onClick={onOpen}
      as="article"
      ariaLabel={`Notice: ${notice.title}`}
      accent={notice.notice_type === 'EMERGENCY' ? 'urgent' : notice.is_pinned ? 'sun' : undefined}
      className={unread ? 'is-unread' : undefined}
    >
      <div className="row wrap" style={{ gap: 6 }}>
        {notice.is_pinned ? <Badge tone="warn">Pinned</Badge> : null}
        <Badge tone={noticeTone(notice.notice_type)}>{notice.notice_type}</Badge>
        {notice.status !== 'PUBLISHED' ? <Badge tone="ghost">{notice.status}</Badge> : null}
        {unread ? <Badge tone="open">Unread</Badge> : null}
        {needsAck ? <Badge tone="urgent">Action needed</Badge> : null}
        {notice.has_attachment ? <Badge tone="ghost">Attachment</Badge> : null}
      </div>
      <h3 style={{ marginTop: 6 }}>{notice.title}</h3>
      <p className="small" style={{ marginBottom: 6 }}>
        {notice.summary || notice.content.slice(0, 160)}
      </p>
      <div className="row wrap small muted" style={{ gap: 10 }}>
        <span>{notice.published_at ? `Published ${dateTime(notice.published_at)}` : 'Not published'}</span>
        {notice.expires_at ? <span>Expires {relative(notice.expires_at)}</span> : null}
        {notice.audience_summary ? <span>For {notice.audience_summary}</span> : null}
        {showAnalytics && notice.analytics ? (
          <span>
            Read {notice.analytics.read}/{notice.analytics.sent}
            {notice.analytics.acknowledgement_required
              ? ` · Acknowledged ${notice.analytics.acknowledged}`
              : ''}
          </span>
        ) : null}
      </div>
      {needsAck ? (
        <div className="tiny bold" style={{ marginTop: 6 }}>
          {notice.required_action_label || 'Acknowledge to confirm you have read this'}
        </div>
      ) : null}
    </Card>
  )
}

export function NotificationRow({
  item,
  onOpen,
  onMarkRead,
}: {
  item: AppNotification
  onOpen?: () => void
  onMarkRead?: () => void
}) {
  return (
    <Card as="li" className={item.is_read ? undefined : 'tint-sky'}>
      <div className="row-between" style={{ alignItems: 'flex-start' }}>
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="row wrap" style={{ gap: 6 }}>
            {item.priority !== 'NORMAL' ? <Badge tone={priorityTone(item.priority)}>{item.priority}</Badge> : null}
            <Badge tone="ghost">{item.category.replaceAll('_', ' ').toLowerCase()}</Badge>
            {!item.is_read ? <Badge tone="open">New</Badge> : null}
          </div>
          <div className="bold" style={{ marginTop: 4 }}>
            {item.title}
          </div>
          <div className="small">{item.body}</div>
          <div className="tiny muted" style={{ marginTop: 4 }}>
            {dateTime(item.created_at)} · {relative(item.created_at)}
          </div>
        </div>
        <div className="stack" style={{ gap: 6 }}>
          {onOpen ? (
            <Button size="sm" variant="info" onClick={onOpen}>
              Open
            </Button>
          ) : null}
          {!item.is_read && onMarkRead ? (
            <Button size="sm" variant="ghost" onClick={onMarkRead}>
              Mark read
            </Button>
          ) : null}
        </div>
      </div>
    </Card>
  )
}
