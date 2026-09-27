/** One notice, opened.
 *
 *  Reading is recorded, acknowledgement is explicit, and any required action
 *  either completes here or routes the person to the screen that can complete it.
 *  The delivery table below the notice is not decoration: it is the same numbers
 *  the administrator sees, shown to the reader so they are not being measured
 *  behind their back.
 */

import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ApiError, api, apiAbsoluteUrl, fetchBlobUrl } from '../lib/api'
import { dateTime, noticeTone, relative } from '../lib/format'
import { useRemote, useSyncState } from '../state/hooks'
import { useSession } from '../state/session'
import { enqueue } from '../lib/offline'
import type { NoticeBrief } from '../lib/types'
import { Badge, Button, Card, EmptyState, ErrorState, KV, LoadingState, ProgressBar, SectionTitle } from '../components/ui'

const ACTION_ROUTES: Record<string, string> = {
  OPEN_CASE: '/report',
  SUBMIT_FORM: '/report',
  REGISTER: '/report',
}

export function NoticeDetailPage() {
  const { noticeId } = useParams()
  const navigate = useNavigate()
  const sync = useSyncState()
  const { can } = useSession()
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [share, setShare] = useState<{ url: string; note: string } | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [attachmentError, setAttachmentError] = useState<string | null>(null)

  const { data, loading, error, refresh } = useRemote<NoticeBrief>(`notice-${noticeId}`, () =>
    api.get<NoticeBrief>(`/notices/${noticeId}`),
  )

  const attachmentName = data?.attachment_name ?? null
  const isImage = Boolean(attachmentName && /\.(jpe?g|png|webp|gif)$/i.test(attachmentName))
  const noticeId_ = data?.id

  // Private media needs the bearer token, so it is fetched as a blob rather
  // than pointed at with an <img src>. Only images preview; a PDF opens.
  useEffect(() => {
    if (!data?.has_attachment || !isImage || !noticeId_) return
    let cancelled = false
    let created: string | null = null
    fetchBlobUrl(`/notices/${noticeId_}/attachment`)
      .then((url) => {
        if (cancelled) {
          URL.revokeObjectURL(url)
          return
        }
        created = url
        setPreviewUrl(url)
      })
      .catch((requestError) => {
        if (!cancelled) {
          setAttachmentError(requestError instanceof ApiError ? requestError.message : 'Could not load the attachment.')
        }
      })
    return () => {
      cancelled = true
      if (created) URL.revokeObjectURL(created)
    }
  }, [noticeId_, isImage, data?.has_attachment])

  const openAttachment = async () => {
    if (!noticeId_) return
    setAttachmentError(null)
    try {
      const url = await fetchBlobUrl(`/notices/${noticeId_}/attachment`)
      window.open(url, '_blank', 'noopener')
      // The tab owns the blob now; revoke a little later so it has time to open.
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (requestError) {
      setAttachmentError(requestError instanceof ApiError ? requestError.message : 'Could not open the attachment.')
    }
  }

  const downloadAttachment = async () => {
    if (!noticeId_) return
    setAttachmentError(null)
    try {
      const url = await fetchBlobUrl(`/notices/${noticeId_}/attachment`)
      const link = document.createElement('a')
      link.href = url
      link.download = attachmentName || 'notice'
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (requestError) {
      setAttachmentError(requestError instanceof ApiError ? requestError.message : 'Could not download the attachment.')
    }
  }

  if (loading && !data) return <LoadingState label="Loading notice" />
  if (error && !data) return <ErrorState message={error} onRetry={() => void refresh()} offline={!sync.online} />
  if (!data) return <EmptyState title="Notice not found" />

  const state = data.my_state

  const act = async (
    path: string,
    label: string,
    offlineQueue?: 'NOTICE_READ' | 'NOTICE_ACTION',
    payload?: Record<string, any>,
  ) => {
    setBusy(true)
    setMessage(null)
    try {
      await api.post(path, payload ?? {})
      setMessage(label)
      await refresh()
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 0 && offlineQueue) {
        await enqueue({ operation: offlineQueue, payload: payload ?? { notice_id: data.id }, label })
        setMessage('Saved on this device — it will be recorded when you are back online.')
      } else {
        setMessage(requestError instanceof ApiError ? requestError.message : 'That did not work.')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="stack-lg">
      <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
        ← Back
      </Button>

      {message ? (
        <div className="banner banner-info" role="status">
          {message}
        </div>
      ) : null}

      <Card accent={data.notice_type === 'EMERGENCY' ? 'urgent' : data.is_pinned ? 'sun' : undefined}>
        <div className="row wrap" style={{ gap: 6 }}>
          <Badge tone={noticeTone(data.notice_type)}>{data.notice_type}</Badge>
          {data.is_pinned ? <Badge tone="warn">Pinned</Badge> : null}
          <Badge tone="ghost">{data.status}</Badge>
          {state?.acknowledged_at ? <Badge tone="done">Acknowledged</Badge> : null}
          {state?.action_completed_at ? <Badge tone="done">Action completed</Badge> : null}
        </div>
        <h1 style={{ marginTop: 8 }}>{data.title}</h1>
        <div className="small muted">
          {data.published_at ? `Published ${dateTime(data.published_at)} (${relative(data.published_at)})` : 'Not published'}
          {data.expires_at ? ` · expires ${relative(data.expires_at)}` : ''}
          {data.created_by ? ` · by ${data.created_by}` : ''}
        </div>

        <div className="divider" />
        <p style={{ whiteSpace: 'pre-wrap' }}>{data.content}</p>

        {data.has_attachment && attachmentName ? (
          <div className="stack" style={{ marginTop: 12 }} data-guide="notice-attachment">
            <div className="row-between wrap">
              <div>
                <div className="bold tiny">{isImage ? 'Circular image' : 'Circular document'}</div>
                <div className="mono tiny" style={{ wordBreak: 'break-all' }}>
                  {attachmentName}
                </div>
              </div>
              <div className="row wrap">
                <Button size="sm" variant="info" onClick={() => void openAttachment()}>
                  Open in a new tab
                </Button>
                <Button size="sm" variant="ghost" onClick={() => void downloadAttachment()}>
                  Download
                </Button>
              </div>
            </div>
            {isImage && previewUrl ? (
              <a
                href={previewUrl}
                target="_blank"
                rel="noreferrer"
                onClick={(event) => {
                  event.preventDefault()
                  void openAttachment()
                }}
              >
                <img
                  src={previewUrl}
                  alt={attachmentName}
                  loading="lazy"
                  style={{ maxWidth: '100%', borderRadius: 'var(--radius)', border: '1px solid var(--line)' }}
                />
              </a>
            ) : null}
            {attachmentError ? (
              <p className="small" style={{ color: 'var(--danger)' }}>
                {attachmentError}
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="divider" />
        <KV
          items={[
            { label: 'Audience', value: data.audience_summary ?? 'everyone on campus' },
            {
              label: 'Targets',
              value:
                data.targets.length === 0
                  ? 'whole campus'
                  : data.targets.map((target) => target.label || target.target_type).join(', '),
            },
            { label: 'Your state', value: state?.read_at ? `read ${relative(state.read_at)}` : 'not read yet' },
          ]}
        />
      </Card>

      {state?.needs_acknowledgement || data.required_action ? (
        <Card accent="urgent">
          <SectionTitle>Action required</SectionTitle>
          <p className="small">
            {data.required_action_label || 'This notice requires you to acknowledge that you have read and understood it.'}
          </p>
          <div className="row wrap">
            <Button
              variant="attention"
              size="lg"
              busy={busy}
              onClick={() =>
                void act(
                  `/notices/${data.id}/acknowledge`,
                  'Acknowledged. Thank you.',
                  'NOTICE_ACTION',
                  { notice_id: data.id, action_type: 'ACKNOWLEDGE' },
                )
              }
            >
              I acknowledge
            </Button>
            {data.required_action && ACTION_ROUTES[data.required_action] ? (
              <Button
                variant="primary"
                size="lg"
                onClick={async () => {
                  await act(
                    `/notices/${data.id}/action`,
                    'Action recorded — taking you to the right screen.',
                    'NOTICE_ACTION',
                    { notice_id: data.id, action_type: data.required_action },
                  )
                  navigate(ACTION_ROUTES[data.required_action as string])
                }}
              >
                {data.required_action_label || 'Complete the action'}
              </Button>
            ) : null}
          </div>
        </Card>
      ) : (
        <Card>
          <div className="row wrap">
            <Button
              variant="info"
              busy={busy}
              disabled={Boolean(state?.read_at)}
              onClick={() => void act(`/notices/${data.id}/read`, 'Marked as read.', 'NOTICE_READ')}
            >
              {state?.read_at ? 'Already read' : 'Mark as read'}
            </Button>
            {can('notice:share') ? (
              <Button
                variant="ghost"
                busy={busy}
                onClick={async () => {
                  setBusy(true)
                  try {
                    const result = await api.post<{ share_token: string; share_url: string; note: string }>(
                      `/notices/${data.id}/share`,
                      { channel: 'COPY_LINK' },
                    )
                    const absolute = apiAbsoluteUrl(`/public/notices/${result.share_token}`)
                    setShare({ url: absolute, note: result.note })
                    try {
                      await navigator.clipboard?.writeText(absolute)
                    } catch {
                      /* clipboard may be blocked; the URL is shown anyway */
                    }
                  } catch (requestError) {
                    setMessage(requestError instanceof ApiError ? requestError.message : 'Sharing failed.')
                  } finally {
                    setBusy(false)
                  }
                }}
              >
                Share a read-only link
              </Button>
            ) : null}
          </div>
          {share ? (
            <div className="banner banner-info" style={{ marginTop: 10 }}>
              <div className="grow">
                <div className="bold">Public link (no login, no personal data)</div>
                <div className="mono tiny" style={{ wordBreak: 'break-all' }}>
                  {share.url}
                </div>
                <div className="tiny">{share.note}</div>
              </div>
            </div>
          ) : null}
        </Card>
      )}

      {data.analytics && can('notice:analytics') ? (
        <Card>
          <SectionTitle right={<Badge tone="ghost">{data.analytics.status}</Badge>}>Delivery & response</SectionTitle>
          <div className="grid-metrics">
            <div className="metric">
              <div className="metric-label">Sent</div>
              <div className="metric-value">{data.analytics.sent}</div>
            </div>
            <div className="metric">
              <div className="metric-label">Read</div>
              <div className="metric-value">{data.analytics.read}</div>
              <div className="metric-hint">{Math.round(data.analytics.read_rate * 100)}%</div>
            </div>
            <div className="metric">
              <div className="metric-label">Acknowledged</div>
              <div className="metric-value">{data.analytics.acknowledged}</div>
            </div>
            <div className="metric">
              <div className="metric-label">Actioned</div>
              <div className="metric-value">{data.analytics.actioned}</div>
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <div className="tiny bold">Read rate</div>
            <ProgressBar value={data.analytics.read} max={data.analytics.sent || 1} />
          </div>
          {Object.keys(data.analytics.by_role ?? {}).length ? (
            <p className="small muted" style={{ marginTop: 8 }}>
              Reached:{' '}
              {Object.entries(data.analytics.by_role)
                .map(([role, count]) => `${role.replaceAll('_', ' ').toLowerCase()} (${count})`)
                .join(', ')}
            </p>
          ) : null}
          <Button
            size="sm"
            variant="ghost"
            style={{ marginTop: 8 }}
            onClick={() => navigate(`/notices/studio?notice=${data.id}`)}
          >
            Open in the notice studio
          </Button>
        </Card>
      ) : null}
    </div>
  )
}
