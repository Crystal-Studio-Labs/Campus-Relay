/** Notice studio.
 *
 *  Authoring, targeting and lifecycle in one place:
 *   - The audience is resolved before publishing, so "all 3rd years in CSE" is
 *     a verified number rather than an unverified guess;
 *   - Publishing is a lifecycle action (draft -> scheduled -> published ->
 *     expired -> archived) with per-person read, delivery and ack tracking;
 *   - Ergonomic 2-column studio layout with live realistic notice card preview,
 *     sticky action deck, audience reach meter, and first-class pagination.
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
  Pagination,
  SectionTitle,
  Select,
  Tabs,
  TextArea,
  TextInput,
} from '../../components/ui'

interface Target {
  target_type: string
  target_id: number | null
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

  // --- Compose state
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
  const [attachment, setAttachment] = useState<File | null>(null)
  const [targets, setTargets] = useState<Target[]>([{ target_type: 'CAMPUS', target_id: null }])
  const [reach, setReach] = useState<number | null>(null)

  // --- Manage & Pagination state
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [statusFilter, setStatusFilter] = useState('')
  const [searchQuery, setSearchQuery] = useState('')

  const manageQuery = qs({
    include_archived: true,
    status: statusFilter || undefined,
    q: searchQuery.trim() || undefined,
    limit: pageSize,
    offset: (page - 1) * pageSize,
  })

  const manage = useRemote<{ total: number; notices: NoticeBrief[] }>(
    tab === 'manage' ? `notices-managed-studio-${manageQuery}` : null,
    () => api.get<{ total: number; notices: NoticeBrief[] }>(`/notices${manageQuery}`),
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

  const publish = async (asDraft = false) => {
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
        publish_at: asDraft ? undefined : publishAt ? new Date(publishAt).toISOString() : undefined,
        expires_at: expiresAt ? new Date(expiresAt).toISOString() : undefined,
        acknowledgement_required: ackRequired,
        required_action: requiredAction || undefined,
        required_action_label: requiredActionLabel || undefined,
        is_pinned: pinned,
        share_enabled: shareEnabled,
        targets,
      })

      if (attachment && response.notice.id) {
        const body = new FormData()
        body.append('file', attachment)
        await api.post(`/notices/${response.notice.id}/attachment`, { body })
      }

      setMessage(
        asDraft
          ? 'Notice saved as draft.'
          : publishAt
            ? `Notice scheduled for ${dateTime(publishAt)}.`
            : 'Notice published immediately to the campus audience.',
      )
      // Reset compose form
      setTitle('')
      setContent('')
      setSummary('')
      setAttachment(null)
      setReach(null)
      setTab('manage')
      void manage.refresh()
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : 'Could not publish the notice.')
    } finally {
      setBusy(false)
    }
  }

  const changeStatus = async (noticeId: number, action: 'publish' | 'expire' | 'archive') => {
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      await api.post(`/notices/${noticeId}/status`, { action })
      setMessage(`Notice status updated to ${action}d.`)
      void manage.refresh()
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : `Could not ${action} notice.`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="stack-lg">
      <PageHeader
        kicker="Communication Operations"
        title="Notice Studio"
        subtitle="Authoring, audience resolution, and lifecycle delivery with real per-person reach verification"
        actions={
          <div className="row wrap" style={{ gap: 8 }}>
            <Badge tone="ghost">draft → scheduled → published → expired → archived</Badge>
          </div>
        }
      />

      {message ? (
        <div className="banner banner-info" role="status">
          {message}
        </div>
      ) : null}
      {error ? (
        <div className="banner banner-error" role="alert">
          {error}
        </div>
      ) : null}

      <Tabs
        tabs={[
          { id: 'compose', label: 'Compose & Target' },
          { id: 'manage', label: 'Manage & Delivery', count: manage.data?.total },
        ]}
        active={tab}
        onChange={(t) => {
          setTab(t)
          setError(null)
          setMessage(null)
        }}
      />

      {/* ==================================================== TAB 1: COMPOSE */}
      {tab === 'compose' ? (
        <div className="notice-studio-layout">
          {/* Main Column: Compose & Targeting Forms */}
          <div className="notice-studio-main">
            {/* Card 1: Content Narrative & Official Circular File */}
            <Card>
              <SectionTitle right={<Badge tone="ghost">Step 1 of 3 · Headline & Narrative</Badge>}>
                Notice Content
              </SectionTitle>

              <Field label="Notice Title" required hint="Clear, concise headline readable on notifications and kiosks.">
                <TextInput
                  value={title}
                  onChange={setTitle}
                  placeholder="e.g. Water supply interruption in Hostel 3, 28 Sept"
                />
              </Field>

              <Field
                label="Detailed Announcement Body"
                required
                hint="State what happened, when, affected areas, and what the reader must do."
              >
                <TextArea
                  value={content}
                  onChange={setContent}
                  rows={6}
                  placeholder="Full circular text or administrative order..."
                />
                <div className="row-between" style={{ marginTop: 4 }}>
                  <span className="mono tiny muted">
                    {content.trim().length < 8 ? `Need ${8 - content.trim().length} more characters` : '✓ Content valid'}
                  </span>
                  <span className="mono tiny muted">{content.length} chars</span>
                </div>
              </Field>

              <Field label="One-line Summary" hint="Shown on corridor kiosks, lock screens, and push notifications.">
                <TextInput
                  value={summary}
                  onChange={setSummary}
                  placeholder="e.g. Supply restored by 18:00 today; emergency tankers on standby"
                />
              </Field>

              {/* Official Circular File Attachment */}
              <div style={{ marginTop: 'var(--sp-2)' }}>
                <Field
                  label="Official Circular Document / Image"
                  hint="Upload scanned circular (PDF, JPG, PNG). Delivered directly to Telegram/WhatsApp channels."
                >
                  <input
                    type="file"
                    accept=".jpg,.jpeg,.png,.webp,.gif,.pdf"
                    onChange={(e) => setAttachment(e.target.files?.[0] ?? null)}
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 'var(--fs-xs)',
                      padding: '8px',
                      background: 'var(--surface-sunken)',
                      border: 'var(--border-w) solid var(--line)',
                      borderRadius: 'var(--radius-sm)',
                      width: '100%',
                    }}
                  />
                  {attachment ? (
                    <div className="row wrap" style={{ gap: 8, alignItems: 'center', marginTop: 6 }}>
                      <Badge tone="open">📎 {attachment.name}</Badge>
                      <span className="mono tiny muted">({(attachment.size / 1024).toFixed(1)} KB)</span>
                      <Button size="sm" variant="ghost" onClick={() => setAttachment(null)}>
                        Remove file
                      </Button>
                    </div>
                  ) : null}
                </Field>
              </div>
            </Card>

            {/* Card 2: Classification & Delivery Rules */}
            <Card>
              <SectionTitle right={<Badge tone="ghost">Step 2 of 3 · Lifecycle & Rules</Badge>}>
                Classification & Delivery Rules
              </SectionTitle>

              <div className="grid">
                <Field label="Notice Type">
                  <Select
                    value={noticeType}
                    onChange={(value) => {
                      setNoticeType(value)
                      if (value === 'URGENT' || value === 'EMERGENCY') setAckRequired(true)
                    }}
                    options={[
                      { value: 'NORMAL', label: 'Normal announcement' },
                      { value: 'IMPORTANT', label: 'Important notice' },
                      { value: 'URGENT', label: 'Urgent action required' },
                      { value: 'EMERGENCY', label: 'Emergency (mandatory acknowledgement)' },
                    ]}
                  />
                </Field>

                <Field label="Category">
                  <Select
                    value={category}
                    onChange={setCategory}
                    options={[
                      'GENERAL',
                      'ACADEMIC',
                      'HOSTEL',
                      'EXAM',
                      'EVENT',
                      'SAFETY',
                      'ADMINISTRATIVE',
                      'PLACEMENT',
                    ].map((value) => ({ value, label: value.replaceAll('_', ' ').toLowerCase() }))}
                  />
                </Field>

                <Field label="Priority Level">
                  <Select
                    value={priority}
                    onChange={setPriority}
                    options={[
                      { value: '', label: 'Derived from notice type' },
                      { value: 'LOW', label: 'Low priority' },
                      { value: 'NORMAL', label: 'Normal priority' },
                      { value: 'HIGH', label: 'High priority' },
                      { value: 'CRITICAL', label: 'Critical priority' },
                    ]}
                  />
                </Field>
              </div>

              <div className="stack" style={{ gap: 'var(--sp-2)', marginTop: 'var(--sp-2)' }}>
                <Checkbox
                  checked={ackRequired}
                  onChange={setAckRequired}
                  label="Require explicit digital acknowledgement from every recipient"
                />
                <Checkbox
                  checked={pinned}
                  onChange={setPinned}
                  label="Pin to the top of students' and staff notice boards"
                />
                <Checkbox
                  checked={shareEnabled}
                  onChange={setShareEnabled}
                  label="Allow public web link (safe for social/circular distribution, zero personal data)"
                />
              </div>

              <div className="grid" style={{ marginTop: 'var(--sp-2)' }}>
                <Field label="Required Action" hint="Routes the reader to the right screen.">
                  <Select
                    value={requiredAction}
                    onChange={setRequiredAction}
                    options={[
                      { value: '', label: 'None' },
                      { value: 'ACKNOWLEDGE', label: 'Acknowledge only' },
                      { value: 'OPEN_CASE', label: 'Raise a request' },
                      { value: 'SUBMIT_FORM', label: 'Submit a form' },
                    ]}
                  />
                </Field>
                {requiredAction ? (
                  <Field label="Action Button Label">
                    <TextInput
                      value={requiredActionLabel}
                      onChange={setRequiredActionLabel}
                      placeholder="e.g. Acknowledge Circular"
                    />
                  </Field>
                ) : null}
              </div>

              {/* Scheduling & Lifespan */}
              <div className="grid" style={{ marginTop: 'var(--sp-3)' }}>
                <Field label="Scheduled Release (optional)" hint="Leave blank to broadcast immediately upon publish.">
                  <input
                    type="datetime-local"
                    value={publishAt}
                    onChange={(e) => setPublishAt(e.target.value)}
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 'var(--fs-xs)',
                      padding: '8px',
                      background: 'var(--surface-sunken)',
                      border: 'var(--border-w) solid var(--line)',
                      borderRadius: 'var(--radius-sm)',
                      width: '100%',
                    }}
                  />
                </Field>

                <Field label="Expiration Date (optional)" hint="Notice is archived and unpinned automatically.">
                  <input
                    type="datetime-local"
                    value={expiresAt}
                    onChange={(e) => setExpiresAt(e.target.value)}
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 'var(--fs-xs)',
                      padding: '8px',
                      background: 'var(--surface-sunken)',
                      border: 'var(--border-w) solid var(--line)',
                      borderRadius: 'var(--radius-sm)',
                      width: '100%',
                    }}
                  />
                </Field>
              </div>
            </Card>

            {/* Card 3: Audience Targeting */}
            <Card>
              <SectionTitle right={<Badge tone="ghost">Step 3 of 3 · Target Population</Badge>}>
                Target Audience Selectors
              </SectionTitle>
              <p className="small muted" style={{ marginTop: 0 }}>
                Recipients receive push notifications and app alerts. Add selectors below to target specific branches,
                hostels, or roles.
              </p>

              {targets.map((target, index) => (
                <div
                  key={index}
                  className="row wrap"
                  style={{
                    alignItems: 'flex-end',
                    gap: 8,
                    marginBottom: 10,
                    padding: 'var(--sp-2)',
                    background: 'var(--surface-sunken)',
                    border: 'var(--border-w) solid var(--line)',
                    borderRadius: 'var(--radius-sm)',
                  }}
                >
                  <div style={{ minWidth: 160 }}>
                    <Field label="Scope">
                      <Select
                        value={target.target_type}
                        onChange={(value) =>
                          setTargets((current) =>
                            current.map((t, i) => (i === index ? { target_type: value, target_id: null } : t)),
                          )
                        }
                        options={[
                          { value: 'CAMPUS', label: 'Entire campus (all users)' },
                          { value: 'DEPARTMENT', label: 'Academic department' },
                          { value: 'HOSTEL', label: 'Hostel residence block' },
                          { value: 'YEAR', label: 'Academic year (1–4)' },
                          { value: 'ROLE', label: 'Specific role' },
                        ]}
                      />
                    </Field>
                  </div>

                  {target.target_type === 'DEPARTMENT' ? (
                    <div style={{ minWidth: 200, flex: 1 }}>
                      <Field label="Department">
                        <Select
                          value={target.target_id ? String(target.target_id) : ''}
                          onChange={(value) =>
                            setTargets((current) =>
                              current.map((t, i) =>
                                i === index ? { ...t, target_id: value ? Number(value) : null } : t,
                              ),
                            )
                          }
                          options={[
                            { value: '', label: 'Select department…' },
                            ...(departments.data?.departments ?? []).map((d) => ({
                              value: String(d.id),
                              label: d.name,
                            })),
                          ]}
                        />
                      </Field>
                    </div>
                  ) : null}

                  {target.target_type === 'HOSTEL' ? (
                    <div style={{ minWidth: 200, flex: 1 }}>
                      <Field label="Hostel">
                        <Select
                          value={target.target_id ? String(target.target_id) : ''}
                          onChange={(value) =>
                            setTargets((current) =>
                              current.map((t, i) =>
                                i === index ? { ...t, target_id: value ? Number(value) : null } : t,
                              ),
                            )
                          }
                          options={[
                            { value: '', label: 'Select hostel…' },
                            ...(hostels.data?.hostels ?? []).map((h) => ({
                              value: String(h.id),
                              label: h.name,
                            })),
                          ]}
                        />
                      </Field>
                    </div>
                  ) : null}

                  {target.target_type === 'YEAR' ? (
                    <div style={{ minWidth: 160, flex: 1 }}>
                      <Field label="Year">
                        <Select
                          value={target.target_value ?? ''}
                          onChange={(value) =>
                            setTargets((current) =>
                              current.map((t, i) => (i === index ? { ...t, target_value: value } : t)),
                            )
                          }
                          options={[
                            { value: '', label: 'Select year…' },
                            { value: '1', label: '1st Year' },
                            { value: '2', label: '2nd Year' },
                            { value: '3', label: '3rd Year' },
                            { value: '4', label: '4th Year' },
                          ]}
                        />
                      </Field>
                    </div>
                  ) : null}

                  {target.target_type === 'ROLE' ? (
                    <div style={{ minWidth: 180, flex: 1 }}>
                      <Field label="Target Role">
                        <Select
                          value={target.target_value ?? ''}
                          onChange={(value) =>
                            setTargets((current) =>
                              current.map((t, i) => (i === index ? { ...t, target_value: value } : t)),
                            )
                          }
                          options={[
                            { value: '', label: 'Select role…' },
                            { value: 'STUDENT', label: 'Students only' },
                            { value: 'STAFF', label: 'Staff / Technicians only' },
                            { value: 'WARDEN', label: 'Wardens only' },
                            { value: 'SECURITY', label: 'Security officers only' },
                          ]}
                        />
                      </Field>
                    </div>
                  ) : null}

                  {targets.length > 1 ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setTargets((current) => current.filter((_, i) => i !== index))}
                    >
                      Remove
                    </Button>
                  ) : null}
                </div>
              ))}

              <div className="row wrap" style={{ gap: 8, marginTop: 'var(--sp-2)' }}>
                <Button
                  variant="ghost"
                  onClick={() => setTargets((current) => [...current, { target_type: 'DEPARTMENT', target_id: null }])}
                >
                  ＋ Add Target Selector
                </Button>
                <Button variant="info" busy={busy} onClick={() => void previewAudience()}>
                  Verify Target Count
                </Button>
              </div>
            </Card>
          </div>

          {/* Sticky Sidebar: Live Preview & Action Deck */}
          <aside className="notice-studio-sidebar">
            {/* Live Notice Card Preview */}
            <div className="notice-preview-card">
              <div className="row-between" style={{ alignItems: 'center' }}>
                <span className="mono tiny bold" style={{ color: 'var(--signal)' }}>
                  LIVE PREVIEW
                </span>
                <Badge tone={noticeTone(noticeType)}>{noticeType}</Badge>
              </div>

              <h3 className="notice-preview-title">{title.trim() || 'Notice Title Preview'}</h3>

              <p className="notice-preview-body">
                {summary.trim() || content.trim().slice(0, 160) || 'Official announcement text will preview here...'}
              </p>

              <div className="row wrap" style={{ gap: 6, marginTop: 4 }}>
                <Badge tone="ghost">{category}</Badge>
                {pinned ? <Badge tone="warn">📌 Pinned</Badge> : null}
                {ackRequired ? <Badge tone="urgent">Ack Required</Badge> : null}
                {attachment ? <Badge tone="open">📎 {attachment.name}</Badge> : null}
              </div>
            </div>

            {/* Audience Reach Verification Box */}
            <Card>
              <div className="mono tiny bold" style={{ color: 'var(--muted)', marginBottom: 6 }}>
                RECIPIENT POPULATION REACH:
              </div>
              <div className="notice-reach-meter">
                <span className="bold" style={{ fontSize: '1.25rem' }}>
                  {reach !== null ? `${reach} recipients` : 'Unchecked'}
                </span>
                <Button variant="info" size="sm" busy={busy} onClick={() => void previewAudience()}>
                  Check
                </Button>
              </div>
            </Card>

            {/* Sticky Action Deck */}
            <Card>
              <Button
                variant="primary"
                size="xl"
                block
                busy={busy}
                disabled={title.trim().length < 3 || content.trim().length < 3 || !can('notice:publish')}
                onClick={() => void publish(false)}
                style={{ fontWeight: 800 }}
              >
                {publishAt ? 'Schedule Notice' : 'Publish Broadcast'}
              </Button>

              {can('notice:create') ? (
                <Button
                  variant="ghost"
                  block
                  busy={busy}
                  disabled={title.trim().length < 3}
                  onClick={() => void publish(true)}
                  style={{ marginTop: 8 }}
                >
                  Save as Draft
                </Button>
              ) : null}

              {!can('notice:publish') ? (
                <p className="tiny muted" style={{ margin: '8px 0 0', textAlign: 'center' }}>
                  Publishing requires the notice:publish permission.
                </p>
              ) : null}
            </Card>
          </aside>
        </div>
      ) : null}

      {/* ==================================================== TAB 2: MANAGE */}
      {tab === 'manage' ? (
        <div className="stack" style={{ gap: 'var(--sp-4)' }}>
          {/* Manage Filter Toolbar */}
          <div className="notice-filter-toolbar">
            <div className="notice-filter-tabs">
              {[
                { id: '', label: 'All Notices' },
                { id: 'PUBLISHED', label: 'Published' },
                { id: 'DRAFT', label: 'Drafts' },
                { id: 'EXPIRED', label: 'Expired' },
                { id: 'ARCHIVED', label: 'Archived' },
              ].map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className={`notice-filter-pill ${statusFilter === f.id ? 'is-active' : ''}`}
                  onClick={() => {
                    setStatusFilter(f.id)
                    setPage(1)
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <div style={{ minWidth: 260 }}>
              <TextInput
                value={searchQuery}
                onChange={(val) => {
                  setSearchQuery(val)
                  setPage(1)
                }}
                placeholder="Search title, circular summary…"
              />
            </div>
          </div>

          {!manage.data?.notices.length && !manage.loading ? (
            <EmptyState
              title="No notices match this filter"
              detail="Compose a new circular or select a different filter tab above."
            />
          ) : null}

          {manage.data?.notices.length ? (
            <ul className="list-reset stack" style={{ gap: 'var(--sp-3)' }}>
              {manage.data.notices.map((notice) => (
                <Card as="li" key={notice.id} accent={notice.notice_type === 'EMERGENCY' ? 'urgent' : undefined}>
                  <div className="case-row-head">
                    <Badge tone={noticeTone(notice.notice_type)}>{notice.notice_type}</Badge>
                    <Badge tone="ghost">{notice.status}</Badge>
                    <Badge tone="ghost">{notice.category}</Badge>
                    {notice.is_pinned ? <Badge tone="warn">📌 Pinned</Badge> : null}
                    {notice.acknowledgement_required ? <Badge tone="urgent">Ack Required</Badge> : null}
                    {notice.attachment_name ? <Badge tone="open">📎 {notice.attachment_name}</Badge> : null}
                  </div>

                  <h3 className="case-row-title" style={{ margin: '8px 0 6px' }}>
                    {notice.title}
                  </h3>

                  <div className="case-row-meta">
                    <div className="case-meta-item">
                      <div className="case-meta-label">Published</div>
                      <div className="case-meta-value">
                        {notice.published_at ? dateTime(notice.published_at) : 'Not published'}
                      </div>
                    </div>
                    <div className="case-meta-item">
                      <div className="case-meta-label">Expires</div>
                      <div className="case-meta-value">{notice.expires_at ? relative(notice.expires_at) : 'Never'}</div>
                    </div>
                    <div className="case-meta-item">
                      <div className="case-meta-label">Target Scope</div>
                      <div className="case-meta-value truncate">{notice.audience_summary ?? 'Entire Campus'}</div>
                    </div>
                    <div className="case-meta-item">
                      <div className="case-meta-label">Acknowledgements</div>
                      <div className="case-meta-value">
                        {notice.analytics ? notice.analytics.acknowledged : '—'}
                      </div>
                    </div>
                  </div>

                  {notice.analytics ? (
                    <div style={{ marginTop: 'var(--sp-3)' }}>
                      <KV
                        items={[
                          { label: 'Broadcast Sent', value: notice.analytics.sent },
                          {
                            label: 'Read Rate',
                            value: `${notice.analytics.read} (${percent(notice.analytics.read_rate)})`,
                          },
                          { label: 'Acknowledged', value: notice.analytics.acknowledged },
                          { label: 'Actioned', value: notice.analytics.actioned },
                        ]}
                      />
                    </div>
                  ) : null}

                  <div className="card-actions" style={{ marginTop: 'var(--sp-3)', flexWrap: 'wrap', gap: 6 }}>
                    {notice.status === 'DRAFT' ? (
                      <Button
                        size="sm"
                        variant="success"
                        busy={busy}
                        onClick={() => void changeStatus(notice.id, 'publish')}
                      >
                        Publish Now
                      </Button>
                    ) : null}
                    {notice.status === 'PUBLISHED' ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        busy={busy}
                        onClick={() => void changeStatus(notice.id, 'expire')}
                      >
                        Expire
                      </Button>
                    ) : null}
                    {notice.status !== 'ARCHIVED' ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        busy={busy}
                        onClick={() => void changeStatus(notice.id, 'archive')}
                      >
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
                      Duplicate Draft
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => navigate(`/notices/${notice.id}`)}>
                      Open Notice View →
                    </Button>
                  </div>
                </Card>
              ))}
            </ul>
          ) : null}

          {/* First-Class Pagination Bar */}
          {manage.data && manage.data.total > 0 ? (
            <Pagination
              page={page}
              pageSize={pageSize}
              total={manage.data.total}
              onChangePage={setPage}
              onChangePageSize={setPageSize}
              pageSizeOptions={[10, 20, 30, 50]}
            />
          ) : null}
        </div>
      ) : null}

      {params.get('notice') ? (
        <p className="small muted">Opened from notice #{params.get('notice')}.</p>
      ) : null}
    </div>
  )
}
