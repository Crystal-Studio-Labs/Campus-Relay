/** Notice studio.
 *
 *  Authoring, targeting and lifecycle in one place. Two behaviours matter:
 *   - the audience is resolved *before* publishing, so "all 3rd years in CSE" is
 *     a number you can check rather than a hope;
 *   - publishing is a lifecycle action (draft -> scheduled -> published ->
 *     expired -> archived), so a notice cannot quietly sit half-sent.
 */

import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ApiError, api, qs } from '../../lib/api'
import { dateTime, noticeTone, percent, relative } from '../../lib/format'
import { useRemote } from '../../state/hooks'
import { useSession } from '../../state/session'
import type { NoticeBrief } from '../../lib/types'
import {
  Badge,
  Button,
  Card,
  Checkbox,
  EmptyState,
  Field,
  KV,
  PageHeader,
  SectionTitle,
  Select,
  Tabs,
  TextArea,
  TextInput,
} from '../../components/ui'

interface Target {
  target_type: string
  target_id: number | null
  /** Role selectors are keyed by role name, not a row id. */
  target_value?: string | null
  label?: string | null
}

export function NoticeStudio() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { can } = useSession()
  const [tab, setTab] = useState<'compose' | 'manage'>('compose')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // --- compose state
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [summary, setSummary] = useState('')
  const [noticeType, setNoticeType] = useState('NORMAL')
  const [category, setCategory] = useState('GENERAL')
  const [priority, setPriority] = useState('')
  const [publishAt, setPublishAt] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [ackRequired, setAckRequired] = useState(false)
  const [requiredAction, setRequiredAction] = useState('')
  const [requiredActionLabel, setRequiredActionLabel] = useState('')
  const [pinned, setPinned] = useState(false)
  const [shareEnabled, setShareEnabled] = useState(false)
  // A circular is often a photographed page or a PDF. Uploading it here means
  // the notice can be delivered to WhatsApp/Telegram as the file itself.
  const [attachment, setAttachment] = useState<File | null>(null)
  const [targets, setTargets] = useState<Target[]>([{ target_type: 'CAMPUS', target_id: null }])
  const [reach, setReach] = useState<number | null>(null)

  const manage = useRemote<{ total: number; notices: NoticeBrief[] }>(
    tab === 'manage' ? 'notices-managed-studio' : null,
    () => api.get<{ total: number; notices: NoticeBrief[] }>(`/notices${qs({ include_archived: true, limit: 60 })}`),
    { cacheKey: null },
  )
  const departments = useRemote<{ departments: any[] }>('studio-departments', () =>
    api.get<{ departments: any[] }>('/admin/departments'),
  )
  const hostels = useRemote<{ hostels: any[] }>('studio-hostels', () =>
    api.get<{ hostels: any[] }>('/admin/hostels'),
  )

  const previewAudience = async () => {
    setBusy(true)
    setError(null)
    setReach(null)
    try {
      let total = 0
      for (const target of targets) {
        const result = await api.get<{ reach: number }>(
          `/notices/audience-preview${qs({
            target_type: target.target_type,
            target_id: target.target_id ?? undefined,
            target_value: target.target_value ?? undefined,
          })}`,
        )
        total += result.reach
      }
      setReach(total)
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : 'Could not preview the audience.')
    } finally {
      setBusy(false)
    }
  }

  const publish = async () => {
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const response = await api.post<{ notice: NoticeBrief }>('/notices', {
        title,
        content,
        summary: summary || undefined,
        notice_type: noticeType,
        category,
        priority: priority || undefined,
        publish_at: publishAt ? new Date(publishAt).toISOString() : undefined,
        expires_at: expiresAt ? new Date(expiresAt).toISOString() : undefined,
        acknowledgement_required: ackRequired,
        required_action: requiredAction || undefined,
        required_action_label: requiredActionLabel || undefined,
        is_pinned: pinned,
        share_enabled: shareEnabled,
        targets,
      })
      let attachmentNote = ''
      if (attachment) {
        try {
          const form = new FormData()
          form.append('file', attachment)
          await api.upload(`/notices/${response.notice.id}/attachment`, form)
          attachmentNote = ' The circular is attached and will ride along to configured external channels.'
        } catch {
          attachmentNote = ' The notice was created, but the attachment upload failed - re-upload it from Manage.'
        }
      }
      setAttachment(null)
      setMessage(
        (publishAt
          ? `Scheduled as ${response.notice.status}. It will become visible at the scheduled time.`
          : `Published to ${reach ?? 'the resolved audience'}. Track reads on the notice itself.`) + attachmentNote,
      )
      setTab('manage')
      void manage.refresh()
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : 'Publishing failed.')
    } finally {
      setBusy(false)
    }
  }

  const changeStatus = async (noticeId: number, action: string) => {
    setBusy(true)
    setError(null)
    try {
      await api.post(`/notices/${noticeId}/status`, { action })
      setMessage(`Notice ${action}d.`)
      void manage.refresh()
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : `Could not ${action} that notice.`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="stack-lg">
      <PageHeader
        kicker="Communication"
        title="Notice studio"
        subtitle="Targeted announcements with a lifecycle and per-person read, acknowledgement and action tracking"
        actions=<Badge tone="ghost">draft → scheduled → published → expired → archived</Badge>
      />

      {message ? <div className="banner banner-info" role="status">{message}</div> : null}
      {error ? <div className="banner banner-error" role="alert">{error}</div> : null}

      <Tabs
        tabs={[
          { id: 'compose', label: 'Compose' },
          { id: 'manage', label: 'Manage', count: manage.data?.total },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'compose' ? (
        <>
          <Card>
            <SectionTitle right={<Badge tone="ghost">Step 1 of 4</Badge>}>Content</SectionTitle>
            <Field label="Title" required>
              <TextInput value={title} onChange={setTitle} placeholder="Water supply interruption in Hostel B, 24 Sept" />
            </Field>
            <Field label="Body" required hint="Plain language. Say what happened, when, and what the reader must do.">
              <TextArea value={content} onChange={setContent} rows={6} />
            </Field>
            <Field label="One-line summary" hint="Shown in the list view on a phone.">
              <TextInput value={summary} onChange={setSummary} placeholder="Supply restored by 18:00" />
            </Field>
          </Card>

          <Card>
            <SectionTitle right={<Badge tone="ghost">Step 2 of 4</Badge>}>Classification</SectionTitle>
            <div className="grid">
              <Field label="Notice type">
                <Select
                  value={noticeType}
                  onChange={(value) => {
                    setNoticeType(value)
                    if (value === 'URGENT' || value === 'EMERGENCY') setAckRequired(true)
                  }}
                  options={[
                    { value: 'NORMAL', label: 'Normal' },
                    { value: 'IMPORTANT', label: 'Important' },
                    { value: 'URGENT', label: 'Urgent' },
                    { value: 'EMERGENCY', label: 'Emergency (requires acknowledgement)' },
                  ]}
                />
              </Field>
              <Field label="Category">
                <Select
                  value={category}
                  onChange={setCategory}
                  options={['GENERAL', 'ACADEMIC', 'HOSTEL', 'EXAM', 'EVENT', 'SAFETY', 'ADMINISTRATIVE', 'PLACEMENT'].map(
                    (value) => ({ value, label: value.replaceAll('_', ' ').toLowerCase() }),
                  )}
                />
              </Field>
              <Field label="Priority">
                <Select
                  value={priority}
                  onChange={setPriority}
                  options={[
                    { value: '', label: 'Derived from type' },
                    { value: 'LOW', label: 'Low' },
                    { value: 'NORMAL', label: 'Normal' },
                    { value: 'HIGH', label: 'High' },
                    { value: 'CRITICAL', label: 'Critical' },
                  ]}
                />
              </Field>
            </div>
            <Checkbox checked={ackRequired} onChange={setAckRequired} label="Require acknowledgement from every recipient" />
            <Checkbox checked={pinned} onChange={setPinned} label="Pin to the top of everyone's notice board" />
            <Checkbox
              checked={shareEnabled}
              onChange={setShareEnabled}
              label="Allow a read-only public link (no personal data)"
            />
            <div className="grid" style={{ marginTop: 12 }}>
              <Field label="Required action" hint="Routes the reader to the right screen.">
                <Select
                  value={requiredAction}
                  onChange={setRequiredAction}
                  options={[
                    { value: '', label: 'None' },
                    { value: 'ACKNOWLEDGE', label: 'Acknowledge only' },
                    { value: 'OPEN_CASE', label: 'Raise a request' },
                    { value: 'SUBMIT_FORM', label: 'Submit a form' },
                    { value: 'REGISTER', label: 'Register' },
                    { value: 'VIEW_DOCUMENT', label: 'View a document' },
                  ]}
                />
              </Field>
              <Field label="Action button label">
                <TextInput value={requiredActionLabel} onChange={setRequiredActionLabel} placeholder="I have read this" />
              </Field>
            </div>
            <div style={{ marginTop: 12 }}>
              <Field
                label="Attach a circular (image or PDF)"
                hint="Optional. If Telegram or WhatsApp is configured, the file is delivered as the image or document itself — not just a text summary."
                htmlFor="notice-attachment"
              >
                <input
                  id="notice-attachment"
                  className="input"
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={(event) => setAttachment(event.target.files?.[0] ?? null)}
                />
              </Field>
              {attachment ? (
                <p className="small muted" style={{ marginBottom: 0 }}>
                  Attached: <span className="mono">{attachment.name}</span>
                </p>
              ) : null}
            </div>
          </Card>

          <Card>
            <SectionTitle right={<Badge tone="ghost">Step 3 of 4</Badge>}>Schedule</SectionTitle>
            <div className="grid">
              <Field label="Publish at" hint="Leave empty to publish immediately.">
                <TextInput value={publishAt} onChange={setPublishAt} type="datetime-local" />
              </Field>
              <Field label="Expires at">
                <TextInput value={expiresAt} onChange={setExpiresAt} type="datetime-local" />
              </Field>
            </div>
          </Card>

          <Card>
            <SectionTitle
              right={
                <>
                  <Badge tone="ghost">Step 4 of 4</Badge>
                  <Badge tone="ghost">same type = OR, different type = AND</Badge>
                </>
              }
            >
              Audience
            </SectionTitle>
            {targets.map((target, index) => (
              <div key={index} className="row wrap" style={{ gap: 8, marginBottom: 8 }}>
                <div style={{ minWidth: 170, flex: 1 }}>
                  <Select
                    value={target.target_type}
                    onChange={(value) =>
                      setTargets((current) =>
                        current.map((item, position) =>
                          position === index ? { target_type: value, target_id: null, label: null } : item,
                        ),
                      )
                    }
                    options={[
                      { value: 'CAMPUS', label: 'Everyone on campus' },
                      { value: 'DEPARTMENT', label: 'Department' },
                      { value: 'HOSTEL', label: 'Hostel' },
                      { value: 'ROLE', label: 'Role' },
                    ]}
                  />
                </div>
                {target.target_type === 'DEPARTMENT' ? (
                  <div style={{ minWidth: 200, flex: 1 }}>
                    <Select
                      value={String(target.target_id ?? '')}
                      onChange={(value) =>
                        setTargets((current) =>
                          current.map((item, position) =>
                            position === index ? { ...item, target_id: Number(value) } : item,
                          ),
                        )
                      }
                      options={[
                        { value: '', label: 'Choose a department…' },
                        ...(departments.data?.departments ?? []).map((item) => ({
                          value: String(item.id),
                          label: item.name,
                        })),
                      ]}
                    />
                  </div>
                ) : null}
                {target.target_type === 'HOSTEL' ? (
                  <div style={{ minWidth: 200, flex: 1 }}>
                    <Select
                      value={String(target.target_id ?? '')}
                      onChange={(value) =>
                        setTargets((current) =>
                          current.map((item, position) =>
                            position === index ? { ...item, target_id: Number(value) } : item,
                          ),
                        )
                      }
                      options={[
                        { value: '', label: 'Choose a hostel…' },
                        ...(hostels.data?.hostels ?? []).map((item) => ({
                          value: String(item.id),
                          label: `${item.name} (${item.hostellers} hostellers)`,
                        })),
                      ]}
                    />
                  </div>
                ) : null}
                {target.target_type === 'ROLE' ? (
                  <div style={{ minWidth: 200, flex: 1 }}>
                    <Select
                      value={target.target_value ?? ''}
                      onChange={(value) =>
                        setTargets((current) =>
                          current.map((item, position) =>
                            position === index ? { ...item, target_id: null, target_value: value } : item,
                          ),
                        )
                      }
                      options={[
                        { value: '', label: 'Choose a role…' },
                        ...['STUDENT', 'STAFF', 'WARDEN', 'FACULTY', 'SECURITY', 'HELPDESK_OPERATOR'].map((role) => ({
                          value: role,
                          label: role.replaceAll('_', ' ').toLowerCase(),
                        })),
                      ]}
                    />
                  </div>
                ) : null}
                {targets.length > 1 ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setTargets((current) => current.filter((_, position) => position !== index))}
                  >
                    Remove
                  </Button>
                ) : null}
              </div>
            ))}
            <div className="row wrap" style={{ marginTop: 8 }}>
              <Button
                variant="ghost"
                onClick={() => setTargets((current) => [...current, { target_type: 'DEPARTMENT', target_id: null }])}
              >
                ＋ Add a selector
              </Button>
              <Button variant="info" busy={busy} onClick={() => void previewAudience()}>
                Count the audience
              </Button>
              {reach !== null ? <Badge tone="done">{reach} people will receive this</Badge> : null}
            </div>
          </Card>

          <Button
            variant="primary"
            size="xl"
            block
            busy={busy}
            disabled={title.trim().length < 3 || content.trim().length < 3 || !can('notice:publish')}
            onClick={() => void publish()}
          >
            {publishAt ? 'Schedule notice' : 'Publish now'}
          </Button>
          {!can('notice:publish') ? (
            <p className="small muted">Your role can draft, but publishing requires the notice:publish right.</p>
          ) : null}
        </>
      ) : null}

      {tab === 'manage' ? (
        <>
          {!manage.data?.notices.length ? (
            <EmptyState title="No notices yet" detail="Compose one and it will appear here with its delivery numbers." />
          ) : null}

          {manage.data?.notices.length ? (
            <div className="results-head">
              <span>
                <span className="results-count">{manage.data.notices.length}</span> notices
              </span>
              <span>Delivery, read and action numbers are real — a notice nobody read says so</span>
            </div>
          ) : null}

          <ul className="list-reset stack">
            {manage.data?.notices.map((notice) => (
              <Card as="li" key={notice.id} accent={notice.notice_type === 'EMERGENCY' ? 'urgent' : undefined}>
                <div className="case-row-head">
                  <Badge tone={noticeTone(notice.notice_type)}>{notice.notice_type}</Badge>
                  <Badge tone="ghost">{notice.status}</Badge>
                  {notice.is_pinned ? <Badge tone="warn">Pinned</Badge> : null}
                  {notice.acknowledgement_required ? <Badge tone="blocked">Ack required</Badge> : null}
                </div>
                <h3 className="case-row-title">{notice.title}</h3>
                <div className="case-row-meta">
                  <div className="case-meta-item">
                    <div className="case-meta-label">Published</div>
                    <div className="case-meta-value">
                      {notice.published_at ? dateTime(notice.published_at) : 'Not published'}
                    </div>
                  </div>
                  <div className="case-meta-item">
                    <div className="case-meta-label">Expires</div>
                    <div className="case-meta-value">{notice.expires_at ? relative(notice.expires_at) : '—'}</div>
                  </div>
                  <div className="case-meta-item">
                    <div className="case-meta-label">Audience</div>
                    <div className="case-meta-value truncate">{notice.audience_summary ?? '—'}</div>
                  </div>
                  <div className="case-meta-item">
                    <div className="case-meta-label">Acknowledged</div>
                    <div className="case-meta-value">
                      {notice.analytics ? notice.analytics.acknowledged : '—'}
                    </div>
                  </div>
                </div>
                {notice.analytics ? (
                  <div style={{ marginTop: 'var(--sp-3)' }}>
                    <KV
                      items={[
                        { label: 'Sent', value: notice.analytics.sent },
                        {
                          label: 'Read',
                          value: `${notice.analytics.read} (${percent(notice.analytics.read_rate)})`,
                        },
                        { label: 'Acknowledged', value: notice.analytics.acknowledged },
                        { label: 'Actioned', value: notice.analytics.actioned },
                      ]}
                    />
                  </div>
                ) : null}
                <div className="card-actions">
                  {notice.status === 'DRAFT' ? (
                    <Button size="sm" variant="success" busy={busy} onClick={() => void changeStatus(notice.id, 'publish')}>
                      Publish
                    </Button>
                  ) : null}
                  {notice.status === 'PUBLISHED' ? (
                    <Button size="sm" variant="ghost" busy={busy} onClick={() => void changeStatus(notice.id, 'expire')}>
                      Expire
                    </Button>
                  ) : null}
                  {notice.status !== 'ARCHIVED' ? (
                    <Button size="sm" variant="ghost" busy={busy} onClick={() => void changeStatus(notice.id, 'archive')}>
                      Archive
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="info"
                    busy={busy}
                    onClick={async () => {
                      setBusy(true)
                      try {
                        await api.post(`/notices/${notice.id}/duplicate`, {})
                        setMessage('Duplicated as a new draft.')
                        void manage.refresh()
                      } catch (requestError) {
                        setError(requestError instanceof ApiError ? requestError.message : 'Could not duplicate.')
                      } finally {
                        setBusy(false)
                      }
                    }}
                  >
                    Duplicate
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => navigate(`/notices/${notice.id}`)}>
                    Open
                  </Button>
                </div>
              </Card>
            ))}
          </ul>
        </>
      ) : null}

      {params.get('notice') ? (
        <p className="small muted">Opened from notice #{params.get('notice')}.</p>
      ) : null}
    </div>
  )
}
