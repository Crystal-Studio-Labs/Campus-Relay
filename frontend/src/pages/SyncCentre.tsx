/** Offline & sync centre.
 *
 *  This page exists because "it works offline" is a claim, and claims should be
 *  inspectable. It shows the device's outbox, the server's view of the same
 *  operations, and what the two disagree about.
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { dateTime, relative } from '../lib/format'
import { retryOperation } from '../lib/offline'
import { useRemote, useSyncState } from '../state/hooks'
import { useSession } from '../state/session'
import { Badge, Button, Card, EmptyState, KV, PageHeader, SectionTitle, Tabs } from '../components/ui'
import { SyncStatusBadge } from '../components/StatusChip'

interface ServerOperation {
  idempotency_key: string
  operation: string
  status: string
  attempts: number
  entity_type: string | null
  entity_id: string | null
  detail: string | null
  created_at: string
  synced_at: string | null
}

export function SyncCentrePage() {
  const navigate = useNavigate()
  const sync = useSyncState()
  const { can } = useSession()
  const [tab, setTab] = useState<'device' | 'server' | 'how'>('device')
  const [message, setMessage] = useState<string | null>(null)

  const serverOps = useRemote<{ operations: ServerOperation[]; states: string[] }>(
    tab === 'server' && can('sync:submit') ? 'sync-operations' : null,
    () => api.get<{ operations: ServerOperation[]; states: string[] }>('/sync/operations?limit=100'),
  )

  return (
    <div className="stack-lg">
      <PageHeader
        title="Offline & sync"
        subtitle="The device queue, the server's own record, and where they disagree"
        actions={<Badge tone={sync.online ? 'done' : 'warn'}>{sync.online ? 'Online' : 'Offline'}</Badge>}
      />

      {message ? <div className="banner banner-info">{message}</div> : null}
      {!sync.storageAvailable ? (
        <div className="banner banner-error">
          {sync.storageReason || 'This browser is blocking local storage, so offline capture is unavailable here.'}
        </div>
      ) : null}

      <div className="grid-metrics" data-guide="sync-metrics">
        <div className="metric">
          <div className="metric-label">Waiting to send</div>
          <div className="metric-value">{sync.pending}</div>
        </div>
        <div className="metric">
          <div className="metric-label">Retrying</div>
          <div className="metric-value">{sync.retrying}</div>
        </div>
        <div className="metric">
          <div className="metric-label">Conflicts</div>
          <div className="metric-value">{sync.conflicts}</div>
        </div>
        <div className="metric">
          <div className="metric-label">Synced this session</div>
          <div className="metric-value">{sync.syncedTotal}</div>
        </div>
      </div>

      <div className="row wrap">
        <Button variant="primary" onClick={() => void sync.probe()}>
          Check connection
        </Button>
        <Button variant="info" onClick={() => void sync.flush()} disabled={!sync.online || sync.flushing}>
          {sync.flushing ? 'Syncing…' : 'Sync now'}
        </Button>
        <Button variant="ghost" onClick={() => navigate('/report')}>
          File a request
        </Button>
      </div>

      <div data-guide="sync-tabs">
        <Tabs
          tabs={[
            { id: 'device', label: 'This device', count: sync.operations.length },
            { id: 'server', label: 'Server record' },
            { id: 'how', label: 'How it works' },
          ]}
          active={tab}
          onChange={setTab}
        />
      </div>

      {tab === 'device' ? (
        sync.operations.length === 0 ? (
          <EmptyState
            title="Nothing queued on this device"
            detail="Everything you have submitted has reached the campus server. Turn off your connection and file a request to see the queue fill up."
          />
        ) : (
          <ul className="list-reset stack">
            {sync.operations.map((operation) => (
              <Card as="li" key={operation.idempotency_key}>
                <div className="row-between" style={{ alignItems: 'flex-start' }}>
                  <div className="grow">
                    <div className="row wrap" style={{ gap: 6 }}>
                      <SyncStatusBadge status={operation.status} />
                      <Badge tone="ghost">{operation.operation.replaceAll('_', ' ').toLowerCase()}</Badge>
                      {operation.case_ref ? <span className="mono small">{operation.case_ref}</span> : null}
                    </div>
                    <div className="bold" style={{ marginTop: 4 }}>
                      {operation.label}
                    </div>
                    <KV
                      items={[
                        { label: 'Key', value: <span className="mono tiny">{operation.idempotency_key}</span> },
                        { label: 'Captured', value: `${dateTime(operation.captured_offline_at)} (${relative(operation.captured_offline_at)})` },
                        { label: 'Attempts', value: operation.attempts },
                        ...(operation.last_error ? [{ label: 'Last error', value: operation.last_error }] : []),
                      ]}
                    />
                    {operation.status === 'CONFLICT' && Object.keys(operation.conflicts).length ? (
                      <pre className="mono tiny" style={{ whiteSpace: 'pre-wrap' }}>
                        {JSON.stringify(operation.conflicts, null, 2)}
                      </pre>
                    ) : null}
                  </div>
                  {operation.status !== 'SYNCED' && operation.status !== 'SYNCING' ? (
                    <Button
                      size="sm"
                      variant="attention"
                      onClick={async () => {
                        await retryOperation(operation.idempotency_key)
                        setMessage('Queued for another attempt.')
                        void sync.flush()
                      }}
                    >
                      Retry
                    </Button>
                  ) : null}
                </div>
              </Card>
            ))}
          </ul>
        )
      ) : null}

      {tab === 'server' ? (
        <Card>
          <SectionTitle>Operations the server has seen from you</SectionTitle>
          {serverOps.data?.operations?.length ? (
            <div className="table-wrap become-cards">
              <table className="data">
                <thead>
                  <tr>
                    <th>Operation</th>
                    <th>Key</th>
                    <th>Status</th>
                    <th>Attempts</th>
                    <th>Entity</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {serverOps.data.operations.map((row) => (
                    <tr key={row.idempotency_key}>
                      <td data-label="Operation">{row.operation.replaceAll('_', ' ').toLowerCase()}</td>
                      <td data-label="Key">
                        <span className="mono tiny">{row.idempotency_key}</span>
                      </td>
                      <td data-label="Status">
                        <Badge tone={row.status === 'SYNCED' ? 'done' : row.status === 'CONFLICT' ? 'urgent' : 'warn'}>
                          {row.status}
                        </Badge>
                      </td>
                      <td data-label="Attempts">{row.attempts}</td>
                      <td data-label="Entity">
                        {row.entity_type} {row.entity_id ? `#${row.entity_id}` : ''}
                      </td>
                      <td data-label="Created">{dateTime(row.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="No server-side operations" detail="Nothing from this account has been replayed yet." />
          )}
          <p className="small muted" style={{ marginTop: 8 }}>
            A replayed key returns the original result instead of applying the change twice — that is what makes a
            double tap or a flaky connection safe.
          </p>
        </Card>
      ) : null}

      {tab === 'how' ? (
        <Card>
          <ul className="small">
            <li>
              <strong>One key, generated on the device.</strong> When you queue an action the app creates an
              idempotency key and keeps it for every retry. The server stores it, so replaying never duplicates work.
            </li>
            <li>
              <strong>Connectivity is probed, not assumed.</strong> The app pings a cheap authenticated endpoint,
              because a captive portal will happily tell the browser it is online.
            </li>
            <li>
              <strong>Conflicts are reported, not overwritten.</strong> Each queued action carries the state you saw
              when you queued it. If the case moved on, the server refuses and tells the app what changed.
            </li>
            <li>
              <strong>Nothing is silently dropped.</strong> A permanent failure stays in the queue marked "needs your
              action" until a human deals with it.
            </li>
            <li>
              <strong>Drafts survive.</strong> Half-written forms are saved locally as you type, so a locked phone or
              a dead battery does not cost you the complaint you were writing.
            </li>
          </ul>
        </Card>
      ) : null}
    </div>
  )
}
