/** Offline persistence for the PWA.
 *
 *  IndexedDB holds:
 *    cache   - the last known good server data, keyed by what it describes
 *    outbox  - queued mutations waiting for a connection
 *    drafts  - half-written requests, so a form is never lost
 *
 *  None of it is authoritative. The server is, always.
 */

import { deviceUid, currentChannel } from './api'
import { STORES, idb, storageCapability } from './db'
import type { CaseBrief, OutboxOperation, SyncStatus } from './types'

export const CACHE_KEYS = {
  overview: 'overview',
  cases: 'cases',
  notices: 'notices',
  notifications: 'notifications',
  services: 'services',
  catalogContext: 'catalog_context',
  myApprovals: 'my_approvals',
  staffTasks: 'staff_tasks',
  gateSummary: 'gate_summary',
  dashboard: 'dashboard',
  activePasses: 'active_passes',
} as const

export type CacheKey = (typeof CACHE_KEYS)[keyof typeof CACHE_KEYS]

export interface CacheEnvelope<T> {
  key: string
  data: T
  cached_at: string
}

export async function cacheWrite<T>(key: string, data: T): Promise<void> {
  await idb.put(STORES.cache, { key, data, cached_at: new Date().toISOString() })
}

export async function cacheRead<T>(key: string): Promise<CacheEnvelope<T> | null> {
  const row = await idb.get<CacheEnvelope<T>>(STORES.cache, key)
  return row ?? null
}

export async function cacheClear(): Promise<void> {
  await idb.clear(STORES.cache)
}

/** Case summaries are cached individually as well, so a case opened offline can
 *  render its header even if the list cache is stale. */
export async function cacheCases(cases: CaseBrief[]): Promise<void> {
  for (const item of cases) {
    await idb.put(STORES.cache, {
      key: `case:${item.id}`,
      data: item,
      cached_at: new Date().toISOString(),
    })
  }
}

export async function cachedCase(caseId: number): Promise<CaseBrief | null> {
  const row = await idb.get<CacheEnvelope<CaseBrief>>(STORES.cache, `case:${caseId}`)
  return row?.data ?? null
}

// --- Outbox ---------------------------------------------------------------

export function newIdempotencyKey(prefix = 'op'): string {
  const random = Math.random().toString(36).slice(2, 10)
  return `${prefix}-${Date.now().toString(36)}-${random}`
}

export interface QueueInput {
  operation: OutboxOperation['operation']
  payload: Record<string, any>
  client_base?: Record<string, any>
  entity_id?: string | null
  label: string
  case_ref?: string | null
}

/** Queue a mutation. The idempotency key is created once, on this device, and
 *  reused for every retry - which is what makes a flaky network safe. */
export async function enqueue(input: QueueInput): Promise<OutboxOperation> {
  const operation: OutboxOperation = {
    idempotency_key: newIdempotencyKey(input.operation.toLowerCase()),
    operation: input.operation,
    payload: input.payload,
    client_base: input.client_base ?? {},
    entity_id: input.entity_id ?? null,
    captured_offline_at: new Date().toISOString(),
    label: input.label,
    status: 'QUEUED',
    attempts: 0,
    next_attempt_at: 0,
    last_error: null,
    conflicts: {},
    created_at: Date.now(),
    case_ref: input.case_ref ?? null,
  }
  await idb.put(STORES.outbox, operation)
  return operation
}

export async function listOutbox(): Promise<OutboxOperation[]> {
  const rows = await idb.all<OutboxOperation>(STORES.outbox)
  return rows.sort((a, b) => a.created_at - b.created_at)
}

export async function outboxSummary(): Promise<{
  pending: number
  syncing: number
  conflicts: number
  requiresAction: number
  retrying: number
  failed: number
  operations: OutboxOperation[]
}> {
  const rows = await listOutbox()
  const count = (status: SyncStatus) => rows.filter((row) => row.status === status).length
  return {
    pending: count('QUEUED'),
    syncing: count('SYNCING'),
    conflicts: count('CONFLICT'),
    requiresAction: count('FAILED_REQUIRES_ACTION'),
    retrying: count('FAILED_RETRYING'),
    failed: count('FAILED_REQUIRES_ACTION') + count('CONFLICT'),
    operations: rows,
  }
}

export async function updateOutbox(
  idempotencyKey: string,
  patch: Partial<OutboxOperation>,
): Promise<void> {
  const existing = await idb.get<OutboxOperation>(STORES.outbox, idempotencyKey)
  if (!existing) return
  await idb.put(STORES.outbox, { ...existing, ...patch })
}

export async function removeOutbox(idempotencyKey: string): Promise<void> {
  await idb.remove(STORES.outbox, idempotencyKey)
}

export async function retryOperation(idempotencyKey: string): Promise<void> {
  await updateOutbox(idempotencyKey, {
    status: 'QUEUED',
    next_attempt_at: 0,
    last_error: null,
    conflicts: {},
  })
}

/** Exponential backoff with a ceiling: 5s, 20s, 45s, ... capped at 5 minutes. */
export function backoffMs(attempts: number): number {
  const seconds = Math.min(5 * Math.max(attempts, 1) ** 2, 300)
  return seconds * 1000
}

export function deviceContext() {
  return { device_uid: deviceUid(), channel: currentChannel() }
}

export { storageCapability }

// --- Drafts ---------------------------------------------------------------

export interface DraftRecord {
  key: string
  service_key: string
  values: Record<string, any>
  updated_at: string
  synced_with_server: boolean
}

export async function saveDraft(serviceKey: string, values: Record<string, any>): Promise<void> {
  await idb.put(STORES.drafts, {
    key: `draft:${serviceKey}`,
    service_key: serviceKey,
    values,
    updated_at: new Date().toISOString(),
    synced_with_server: false,
  })
}

export async function readDraft(serviceKey: string): Promise<DraftRecord | null> {
  const row = await idb.get<DraftRecord>(STORES.drafts, `draft:${serviceKey}`)
  return row ?? null
}

export async function listDrafts(): Promise<DraftRecord[]> {
  return idb.all<DraftRecord>(STORES.drafts)
}

export async function deleteDraft(serviceKey: string): Promise<void> {
  await idb.remove(STORES.drafts, `draft:${serviceKey}`)
}
