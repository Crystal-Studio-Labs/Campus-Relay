/** IndexedDB access layer.
 *
 *  PostgreSQL is the authoritative store; this is the client-side working copy
 *  plus the outbox. It is deliberately a thin wrapper: four stores, no schema
 *  migrations to reason about, and a hard failure mode that is reported to the
 *  user rather than swallowed.
 */

const DB_NAME = 'campus-relay'
const DB_VERSION = 1

export const STORES = {
  outbox: 'outbox',
  cache: 'cache',
  drafts: 'drafts',
  meta: 'meta',
} as const

type StoreName = (typeof STORES)[keyof typeof STORES]

let dbPromise: Promise<IDBDatabase> | null = null
let unavailableReason: string | null = null

const memoryFallback = {
  outbox: new Map<string, any>(),
  cache: new Map<string, any>(),
  drafts: new Map<string, any>(),
  meta: new Map<string, any>(),
} as Record<StoreName, Map<string, any>>

function open(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      unavailableReason = 'IndexedDB is not available in this browser context.'
      reject(new Error(unavailableReason))
      return
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORES.outbox)) {
        db.createObjectStore(STORES.outbox, { keyPath: 'idempotency_key' })
      }
      if (!db.objectStoreNames.contains(STORES.cache)) {
        db.createObjectStore(STORES.cache, { keyPath: 'key' })
      }
      if (!db.objectStoreNames.contains(STORES.drafts)) {
        db.createObjectStore(STORES.drafts, { keyPath: 'key' })
      }
      if (!db.objectStoreNames.contains(STORES.meta)) {
        db.createObjectStore(STORES.meta, { keyPath: 'key' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => {
      unavailableReason = request.error?.message || 'Could not open the local database.'
      reject(request.error)
    }
  })
  return dbPromise
}

export interface StorageCapability {
  available: boolean
  reason: string | null
}

export async function storageCapability(): Promise<StorageCapability> {
  try {
    await open()
    return { available: true, reason: null }
  } catch {
    return {
      available: false,
      reason:
        unavailableReason ||
        'Local storage is unavailable, so offline queueing is disabled in this browser session.',
    }
  }
}

async function tx<T>(
  store: StoreName,
  mode: IDBTransactionMode,
  work: (objectStore: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await open()
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(store, mode)
    const request = work(transaction.objectStore(store))
    request.onsuccess = () => resolve(request.result as T)
    request.onerror = () => reject(request.error)
  })
}

/** All read/write helpers fall back to an in-memory map when IndexedDB is
 *  blocked (private mode, hardened browsers). The caller learns about it via
 *  storageCapability() and the UI says so instead of pretending to persist. */
export const idb = {
  async put<T>(store: StoreName, value: T & { key?: string; idempotency_key?: string }): Promise<void> {
    try {
      await tx(store, 'readwrite', (os) => os.put(value))
    } catch {
      const key = (value as any).key ?? (value as any).idempotency_key
      memoryFallback[store].set(String(key), value)
    }
  },

  async get<T>(store: StoreName, key: string): Promise<T | undefined> {
    try {
      return (await tx<T | undefined>(store, 'readonly', (os) => os.get(key) as IDBRequest<T | undefined>)) ?? undefined
    } catch {
      return memoryFallback[store].get(key) as T | undefined
    }
  },

  async all<T>(store: StoreName): Promise<T[]> {
    try {
      return (await tx<T[]>(store, 'readonly', (os) => os.getAll() as IDBRequest<T[]>)) ?? []
    } catch {
      return Array.from(memoryFallback[store].values()) as T[]
    }
  },

  async remove(store: StoreName, key: string): Promise<void> {
    try {
      await tx(store, 'readwrite', (os) => os.delete(key))
    } catch {
      memoryFallback[store].delete(key)
    }
  },

  async clear(store: StoreName): Promise<void> {
    try {
      await tx(store, 'readwrite', (os) => os.clear())
    } catch {
      memoryFallback[store].clear()
    }
  },
}
