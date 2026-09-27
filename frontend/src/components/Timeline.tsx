/** The case timeline: the audit trail as a person reads it.
 *
 *  Nothing is summarised away - if the record says a warden escalated at
 *  14:20, the student can see it. That is the point of the product.
 */

import { eventLabel, dateTime, relative } from '../lib/format'
import type { TimelineEntry } from '../lib/types'

export function Timeline({ entries }: { entries: TimelineEntry[] }) {
  if (!entries.length) {
    return <p className="muted small">No activity recorded yet.</p>
  }
  return (
    <ol className="timeline">
      {entries.map((entry) => (
        <li
          key={entry.id}
          className={
            entry.to_status === 'CLOSED' || entry.to_status === 'RESOLVED'
              ? 'is-terminal'
              : entry.to_status === 'ESCALATED'
                ? 'is-urgent'
                : undefined
          }
        >
          <div className="bold">{eventLabel(entry.event_type)}</div>
          <div className="when">
            <time dateTime={entry.at} title={dateTime(entry.at)}>
              {dateTime(entry.at)}
            </time>
            {' · '}
            {relative(entry.at)}
            {entry.actor_name ? ` · ${entry.actor_name}` : entry.actor_kind === 'SYSTEM' ? ' · system' : ''}
          </div>
          {entry.to_status ? (
            <div className="small muted">
              {entry.from_status ? `${entry.from_status} → ` : ''}
              {entry.to_status}
            </div>
          ) : null}
          <EntryDetail payload={entry.payload} />
        </li>
      ))}
    </ol>
  )
}

/** Only the fields a human cares about, and never raw ids. */
function EntryDetail({ payload }: { payload: Record<string, any> }) {
  if (!payload || !Object.keys(payload).length) return null
  const interesting: [string, unknown][] = Object.entries(payload).filter(([key, value]) => {
    if (value === null || value === undefined || value === '') return false
    if (key === 'device_uid' || key === 'idempotency_key' || key === 'client_ref') return false
    if (key.endsWith('_id') && typeof value === 'number') return false
    return true
  })
  if (!interesting.length) return null
  return (
    <div className="small" style={{ marginTop: 4 }}>
      {interesting.slice(0, 6).map(([key, value]) => (
        <div key={key}>
          <span className="muted">{key.replaceAll('_', ' ')}: </span>
          <span>{typeof value === 'object' ? JSON.stringify(value) : String(value)}</span>
        </div>
      ))}
    </div>
  )
}
