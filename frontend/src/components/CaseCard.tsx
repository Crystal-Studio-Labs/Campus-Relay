/** Case list item, used by every list: student, staff, admin queue, helpdesk.
 *
 *  Rebuilt from a stack of badges over grey lines into an explicit hierarchy:
 *
 *    1. identity + state   case number, status, priority, SLA, reopened
 *    2. the title          the one line a person actually reads
 *    3. a labelled meta grid   service, location, requester, opened, updated
 *    4. a quiet side column    channel, offline capture, anything waiting on you
 *
 *  The meta grid is real definition-list markup so the labels line up down the
 *  list instead of every row inventing its own sentence.
 */

import { duration, relative, shortDate } from '../lib/format'
import type { CaseBrief } from '../lib/types'
import { Badge } from './ui'
import { CaseStatusBadge, ChannelBadge, OfflineCapturedBadge, PriorityBadge, SlaBadge } from './StatusChip'

interface MetaItem {
  label: string
  value: string
}

export function CaseCard({
  item,
  onOpen,
  showRequester,
  showAssignee,
  compact,
}: {
  item: CaseBrief
  onOpen: () => void
  showRequester?: boolean
  showAssignee?: boolean
  compact?: boolean
}) {
  const accent =
    item.status === 'ESCALATED' || item.sla_state === 'BREACHED'
      ? 'var(--status-urgent)'
      : item.status === 'VERIFICATION_REQUIRED'
        ? 'var(--signal)'
        : null

  const meta: MetaItem[] = [
    { label: 'Service', value: item.service_name },
    item.location ? { label: 'Location', value: item.location.name } : null,
    showRequester && item.requester ? { label: 'Raised by', value: item.requester.full_name } : null,
    showAssignee ? { label: 'Assignment', value: item.assigned_staff_id ? 'Assigned' : 'Unassigned' } : null,
    { label: 'Opened', value: duration(item.age_minutes) },
    { label: 'Updated', value: relative(item.last_activity_at) },
    item.resolved_at ? { label: 'Resolved', value: shortDate(item.resolved_at) } : null,
  ].filter((entry): entry is MetaItem => entry !== null)

  return (
    <article
      className="case-row"
      style={accent ? { borderInlineStart: `4px solid ${accent}` } : undefined}
      role="button"
      tabIndex={0}
      aria-label={`Case ${item.case_number}: ${item.title}`}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onOpen()
        }
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div className="case-row-head">
          <span className="ident small muted">{item.case_number}</span>
          <CaseStatusBadge status={item.status} />
          <PriorityBadge priority={item.priority} />
          <SlaBadge state={item.sla_state} dueAt={item.due_at} />
          {item.reopen_count > 0 ? <Badge tone="warn">Reopened ×{item.reopen_count}</Badge> : null}
        </div>

        <h3 className="case-row-title truncate">{item.title}</h3>

        {compact ? (
          <div className="small muted" style={{ marginTop: 4 }}>
            Updated {relative(item.last_activity_at)}
          </div>
        ) : (
          <div className="case-row-meta">
            {meta.map((entry) => (
              <div className="case-meta-item" key={entry.label}>
                <div className="case-meta-label">{entry.label}</div>
                <div className="case-meta-value truncate">{entry.value}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="case-row-side">
        <ChannelBadge channel={item.source_channel} />
        <OfflineCapturedBadge capturedAt={item.captured_offline_at} />
        {item.verification_state === 'AWAITING_REQUESTER' ? <Badge tone="open">Waiting for you</Badge> : null}
        <span className="case-row-chevron" aria-hidden="true">
          →
        </span>
      </div>
    </article>
  )
}

export function CaseList({
  cases,
  onOpen,
  showRequester,
  showAssignee,
}: {
  cases: CaseBrief[]
  onOpen: (item: CaseBrief) => void
  showRequester?: boolean
  showAssignee?: boolean
}) {
  return (
    <ul className="list-reset stack">
      {cases.map((item) => (
        <li key={item.id}>
          <CaseCard
            item={item}
            onOpen={() => onOpen(item)}
            showRequester={showRequester}
            showAssignee={showAssignee}
          />
        </li>
      ))}
    </ul>
  )
}
