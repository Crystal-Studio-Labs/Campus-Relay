/** Data hooks.
 *
 *  Every remote read goes through useRemote, which:
 *    - writes the response into IndexedDB when it succeeds (so the next open
 *      offline still shows data)
 *    - falls back to that cached copy when the network is gone, and says so
 *      (`stale: true`) instead of pretending the data is fresh
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, api } from '../lib/api'
import { cacheRead, cacheWrite } from '../lib/offline'
import { syncEngine, type SyncSnapshot } from '../lib/sync'

export interface RemoteState<T> {
  data: T | null
  error: string | null
  errorCode: string | null
  loading: boolean
  /** Served from the offline cache: the value may be out of date. */
  stale: boolean
  cachedAt: string | null
  refresh: () => Promise<void>
}

export function useRemote<T>(
  key: string | null,
  fetcher: (signal?: AbortSignal) => Promise<T>,
  options: { cacheKey?: string | null; enabled?: boolean } = {},
): RemoteState<T> {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [errorCode, setErrorCode] = useState<string | null>(null)
  const [loading, setLoading] = useState(Boolean(key && options.enabled !== false))
  const [stale, setStale] = useState(false)
  const [cachedAt, setCachedAt] = useState<string | null>(null)
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher

  const cacheKey = options.cacheKey === undefined ? key : options.cacheKey

  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (!key || options.enabled === false) return
      setLoading(true)
      try {
        const fresh = await fetcherRef.current(signal)
        setData(fresh)
        setStale(false)
        setError(null)
        setErrorCode(null)
        if (cacheKey) {
          const stamp = new Date().toISOString()
          await cacheWrite(cacheKey, fresh)
          setCachedAt(stamp)
        }
      } catch (requestError) {
        if (requestError instanceof DOMException && requestError.name === 'AbortError') return
        const message =
          requestError instanceof ApiError
            ? requestError.message
            : 'Something went wrong loading this screen.'
        setError(message)
        setErrorCode(requestError instanceof ApiError ? requestError.code : 'unknown')
        if (cacheKey) {
          const cached = await cacheRead<T>(cacheKey)
          if (cached) {
            setData(cached.data)
            setCachedAt(cached.cached_at)
            setStale(true)
          }
        }
      } finally {
        setLoading(false)
      }
    },
    [key, cacheKey, options.enabled],
  )

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])

  const refresh = useCallback(() => load(), [load])

  return { data, error, errorCode, loading, stale, cachedAt, refresh }
}

/** Subscribe to the sync engine's snapshot. */
export function useSyncState(): SyncSnapshot & { flush: () => Promise<void>; probe: () => Promise<boolean> } {
  const [snapshot, setSnapshot] = useState<SyncSnapshot>(() => ({
    online: true,
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
  }))

  useEffect(() => syncEngine.subscribe(setSnapshot), [])

  return {
    ...snapshot,
    flush: () => syncEngine.flush(),
    probe: () => syncEngine.probe(),
  }
}

/** Interval-based refresh for queue screens, paused while offline. */
export function usePolling(callback: () => void, intervalMs: number, enabled = true) {
  const ref = useRef(callback)
  ref.current = callback
  useEffect(() => {
    if (!enabled) return
    const timer = window.setInterval(() => ref.current(), intervalMs)
    return () => window.clearInterval(timer)
  }, [intervalMs, enabled])
}

export async function postWhenOnline<T>(
  path: string,
  body: unknown,
  idempotencyKey?: string,
): Promise<T> {
  return api.post<T>(path, body, idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined)
}
