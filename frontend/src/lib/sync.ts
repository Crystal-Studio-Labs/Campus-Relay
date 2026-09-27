/** Sync engine.
 *
 *  Responsibilities:
 *    - decide whether we are actually online (a real API probe, not navigator.onLine)
 *    - flush the outbox when we are
 *    - never lose an operation: transient failures back off and retry, permanent
 *      failures are kept and surfaced so a human can act
 *    - report conflicts instead of overwriting server state
 */

import { ApiError, api, tokenStore } from './api'
import { backoffMs, listOutbox, outboxSummary, updateOutbox } from './offline'
import type { OutboxOperation, SyncStatus } from './types'

export interface SyncSnapshot {
  online: boolean
  checking: boolean
  flushing: boolean
  pending: number
  retrying: number
  conflicts: number
  requiresAction: number
  syncedTotal: number
  lastFlushAt: string | null
  lastError: string | null
  operations: OutboxOperation[]
  storageAvailable: boolean
  storageReason: string | null
}

type Listener = (snapshot: SyncSnapshot) => void

const PROBE_INTERVAL_MS = 20_000

export class SyncEngine {
  private listeners = new Set<Listener>()
  private timer: number | null = null
  private flushing = false
  private snapshot: SyncSnapshot = {
    online: typeof navigator === 'undefined' ? true : navigator.onLine,
    checking: false,
    flushing: false,
    pending: 0,
    retrying: 0,
    conflicts: 0,
    requiresAction: 0,
    syncedTotal: 0,
    lastFlushAt: null,
    lastError: null,
    operations: [],
    storageAvailable: true,
    storageReason: null,
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    listener(this.snapshot)
    return () => this.listeners.delete(listener)
  }

  private emit(patch: Partial<SyncSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch }
    this.listeners.forEach((listener) => listener(this.snapshot))
  }

  async init() {
    const { storageCapability } = await import('./offline')
    const capability = await storageCapability()
    this.emit({ storageAvailable: capability.available, storageReason: capability.reason })
    await this.refreshCounts()
    await this.probe()
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => void this.probe())
      window.addEventListener('offline', () => this.emit({ online: false }))
    }
    this.startPolling()
  }

  private startPolling() {
    if (this.timer !== null) return
    this.timer = window.setInterval(() => {
      void this.probe()
    }, PROBE_INTERVAL_MS)
  }

  /** Probe the server for real. A captive portal answers navigator.onLine=online
   *  while nothing works, so the only trustworthy signal is an API round trip. */
  async probe(): Promise<boolean> {
    if (this.snapshot.checking) return this.snapshot.online
    this.emit({ checking: true })
    const token = tokenStore.get()
    let online = false
    if (!token) {
      // Before sign-in there is no authenticated endpoint to probe.
      try {
        await api.get('/health')
        online = true
      } catch {
        online = false
      }
    } else {
      online = await api.reachable()
    }
    this.emit({ online, checking: false })
    if (online) await this.flush()
    return online
  }

  async refreshCounts() {
    const summary = await outboxSummary()
    this.emit({
      pending: summary.pending,
      retrying: summary.retrying,
      conflicts: summary.conflicts,
      requiresAction: summary.requiresAction,
      operations: summary.operations,
    })
  }

  /** Push every eligible operation. Safe to call repeatedly. */
  async flush(): Promise<void> {
    if (this.flushing || !this.snapshot.online) return
    if (!tokenStore.get()) return

    const operations = await listOutbox()
    const now = Date.now()
    const eligible = operations.filter(
      (operation) =>
        (operation.status === 'QUEUED' || operation.status === 'FAILED_RETRYING') &&
        operation.next_attempt_at <= now,
    )
    if (!eligible.length) return

    this.flushing = true
    this.emit({ flushing: true })

    for (const operation of eligible) {
      await updateOutbox(operation.idempotency_key, { status: 'SYNCING' })
    }
    await this.refreshCounts()

    try {
      const response = await api.post<{
        counts: Record<string, number>
        results: {
          idempotency_key: string
          status: SyncStatus
          detail: string | null
          retryable: boolean
          conflicts: Record<string, any>
          server_id: number | null
          data: Record<string, any>
        }[]
        server_time: string
      }>('/sync/push', { device_uid: eligible[0] ? undefined : undefined, operations: eligible.map(toPayload) })

      let synced = 0
      for (const result of response.results) {
        const operation = eligible.find((item) => item.idempotency_key === result.idempotency_key)
        if (!operation) continue
        const attempts = operation.attempts + 1

        if (result.status === 'SYNCED') {
          synced += 1
          // Record the case number the server assigned, so the person can see
          // that the thing they filed offline now exists as a real case.
          const caseNumber =
            typeof result.data?.case_number === 'string' ? (result.data.case_number as string) : null
          await updateOutbox(result.idempotency_key, {
            status: 'SYNCED',
            attempts,
            last_error: null,
            conflicts: {},
            entity_id: result.server_id ? String(result.server_id) : operation.entity_id,
            case_ref: caseNumber ?? operation.case_ref,
          })
          // Keep the row briefly so the UI can show "synced", then drop it.
          window.setTimeout(() => {
            void import('./offline').then(({ removeOutbox }) => removeOutbox(result.idempotency_key))
          }, 8000)
        } else if (result.status === 'CONFLICT') {
          await updateOutbox(result.idempotency_key, {
            status: 'CONFLICT',
            attempts,
            last_error: result.detail,
            conflicts: result.conflicts,
          })
        } else if (result.status === 'FAILED_REQUIRES_ACTION') {
          await updateOutbox(result.idempotency_key, {
            status: 'FAILED_REQUIRES_ACTION',
            attempts,
            last_error: result.detail,
          })
        } else {
          // Transient: back off and try again later.
          await updateOutbox(result.idempotency_key, {
            status: 'FAILED_RETRYING',
            attempts,
            last_error: result.detail,
            next_attempt_at: Date.now() + backoffMs(attempts),
          })
        }
      }

      this.emit({
        syncedTotal: this.snapshot.syncedTotal + synced,
        lastFlushAt: new Date().toISOString(),
        lastError: null,
      })
    } catch (error) {
      const detail =
        error instanceof ApiError ? error.message : 'Could not reach the campus server.'
      for (const operation of eligible) {
        const attempts = operation.attempts + 1
        await updateOutbox(operation.idempotency_key, {
          status: 'FAILED_RETRYING',
          attempts,
          last_error: detail,
          next_attempt_at: Date.now() + backoffMs(attempts),
        })
      }
      this.emit({ lastError: detail, online: error instanceof ApiError && error.status === 0 ? false : this.snapshot.online })
    } finally {
      this.flushing = false
      this.emit({ flushing: false })
      await this.refreshCounts()
    }
  }
}

function toPayload(operation: OutboxOperation) {
  return {
    idempotency_key: operation.idempotency_key,
    operation: operation.operation,
    payload: operation.payload,
    client_base: operation.client_base,
    entity_id: operation.entity_id,
    captured_offline_at: operation.captured_offline_at,
  }
}

export const syncEngine = new SyncEngine()
