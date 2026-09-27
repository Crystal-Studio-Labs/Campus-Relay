/** Connectivity and sync UI.
 *
 *  The rule this component enforces: the app never pretends. If a mutation is
 *  sitting in the outbox the person is told, in plain words, what has and has
 *  not reached the campus server - including the case number it will appear as.
 */

import { useState } from 'react'
import { t } from '../lib/i18n'
import { dateTime, relative } from '../lib/format'
import { retryOperation } from '../lib/offline'
import { useSyncState } from '../state/hooks'
import type { OutboxOperation } from '../lib/types'
import { Button, Card, EmptyState, Sheet, KV } from './ui'
import { SyncStatusBadge } from './StatusChip'

/** Slim banner pinned under the top bar. Silent when everything is healthy. */
export function ConnectivityBar() {
  const sync = useSyncState()
  const [open, setOpen] = useState(false)
  const needsAttention = sync.conflicts + sync.requiresAction > 0
  const pending = sync.pending + sync.retrying

  if (sync.online && !pending && !needsAttention && sync.storageAvailable) return null

  const tone = !sync.online ? 'banner-offline' : needsAttention ? 'banner-error' : 'banner-info'
  const message = !sync.online
    ? `${t('offline.title')} — ${t('offline.message')}`
    : needsAttention
      ? `${sync.conflicts + sync.requiresAction} queued change(s) need attention`
      : `Syncing ${pending} change(s)…`

  return (
    <>
      <div className={`banner ${tone} no-print`} role="status">
        <span className="grow">{message}</span>
        {pending || needsAttention ? (
          <Button size="sm" variant="default" onClick={() => setOpen(true)}>
            View queue
          </Button>
        ) : null}
        {sync.online && pending && !needsAttention ? (
          <Button size="sm" variant="default" onClick={() => void sync.flush()}>
            Sync now
          </Button>
        ) : null}
      </div>
      <SyncCentreSheet open={open} onClose={() => setOpen(false)} />
    </>
  )
}

/** Full transparency screen for the outbox. Also reachable from the nav. */
export function SyncCentreSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const sync = useSyncState()

  return (
    <Sheet open={open} onClose={onClose} title="Offline queue">
      <KV
        items={[
          { label: 'Connection', value: sync.online ? 'Online' : 'Offline' },
          { label: 'Waiting', value: sync.pending },
          { label: 'Retrying', value: sync.retrying },
          { label: 'Conflicts', value: sync.conflicts },
          { label: 'Needs action', value: sync.requiresAction },
          { label: 'Last sync', value: sync.lastFlushAt ? dateTime(sync.lastFlushAt) : 'not yet' },
        ]}
      />
      <div className="row" style={{ marginTop: 12 }}>
        <Button variant="primary" onClick={() => void sync.probe()}>
          Check connection
        </Button>
        <Button variant="info" onClick={() => void sync.flush()} disabled={!sync.online}>
          Sync now
        </Button>
      </div>

      {!sync.storageAvailable ? (
        <div className="banner banner-error" style={{ marginTop: 12 }}>
          {sync.storageReason || 'This browser is blocking local storage, so offline mode is unavailable.'}
        </div>
      ) : null}

      <div className="divider" />
      {sync.operations.length === 0 ? (
        <EmptyState title="Nothing queued" detail="Everything you have submitted has reached the campus server." />
      ) : (
        <ul className="list-reset stack">
          {sync.operations.map((operation) => (
            <OperationRow key={operation.idempotency_key} operation={operation} />
          ))}
        </ul>
      )}
    </Sheet>
  )
}

function OperationRow({ operation }: { operation: OutboxOperation }) {
  const [busy, setBusy] = useState(false)
  return (
    <Card as="li">
      <div className="row-between" style={{ alignItems: 'flex-start' }}>
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="row wrap" style={{ gap: 6 }}>
            <SyncStatusBadge status={operation.status} />
            {operation.case_ref ? <span className="mono small">{operation.case_ref}</span> : null}
          </div>
          <div className="bold" style={{ marginTop: 4 }}>
            {operation.label}
          </div>
          <div className="tiny muted">
            Captured {relative(operation.captured_offline_at)} · attempts {operation.attempts}
          </div>
          {operation.last_error ? <div className="small field-error">{operation.last_error}</div> : null}
          {operation.status === 'CONFLICT' && Object.keys(operation.conflicts).length ? (
            <details className="small" style={{ marginTop: 6 }}>
              <summary>What the server has instead</summary>
              <pre className="mono small" style={{ whiteSpace: 'pre-wrap' }}>
                {JSON.stringify(operation.conflicts, null, 2)}
              </pre>
            </details>
          ) : null}
        </div>
        {operation.status === 'CONFLICT' || operation.status === 'FAILED_REQUIRES_ACTION' ? (
          <Button
            size="sm"
            variant="attention"
            busy={busy}
            onClick={async () => {
              setBusy(true)
              await retryOperation(operation.idempotency_key)
              setBusy(false)
            }}
          >
            Retry
          </Button>
        ) : null}
      </div>
    </Card>
  )
}
