/** API client.
 *
 *  Every request carries the acting channel and the device id, because the
 *  server records both on the audit trail. A failed request never silently
 *  becomes a success: callers get either data or an ApiError they can show.
 */

import type { SourceChannel } from './types'

const TOKEN_KEY = 'campusrelay.token'
const DEVICE_KEY = 'campusrelay.device_uid'
const CHANNEL_KEY = 'campusrelay.channel'
const DEVICE_MODE_KEY = 'campusrelay.device_mode'

/** Where the API lives.
 *
 *  In development the Vite proxy forwards `/api` to the local backend, so this
 *  stays empty. In a split deployment - the PWA on Vercel, the API on Render -
 *  `VITE_API_BASE_URL` holds the backend's public origin. Keeping the fallback
 *  relative means the same build also works when a college self-hosts both the
 *  frontend and the backend behind one origin (nginx/Caddy single-machine). */
const API_BASE = ((import.meta.env.VITE_API_BASE_URL as string | undefined) || '').replace(/\/$/, '')
const API_PREFIX = `${API_BASE}/api/v1`

export class ApiError extends Error {
  status: number
  code: string
  details: Record<string, any>

  constructor(status: number, code: string, message: string, details: Record<string, any> = {}) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
  }

  get isOffline(): boolean {
    return this.status === 0
  }

  get isAuthFailure(): boolean {
    return this.status === 401
  }

  get isConflict(): boolean {
    return this.status === 409
  }
}

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStorage(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    /* private mode: fall back to in-memory only */
  }
}

export function deviceUid(): string {
  let uid = readStorage(DEVICE_KEY)
  if (!uid) {
    uid = `dev-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`
    writeStorage(DEVICE_KEY, uid)
  }
  return uid
}

/** The source channel is what the audit trail records. Kiosk and helpdesk
 *  layouts set this so a case filed at a desk is provably a desk case. */
export function setChannel(channel: SourceChannel) {
  writeStorage(CHANNEL_KEY, channel)
}

export function currentChannel(): SourceChannel {
  return (readStorage(CHANNEL_KEY) as SourceChannel) || 'PWA'
}

/** What kind of station is this browser? A shared tablet in a corridor must not
 *  come back as a personal phone session after a restart, or the next student
 *  would land in the last student's home screen. */
export type DeviceMode = 'personal' | 'kiosk' | 'desk'

export function setDeviceMode(mode: DeviceMode) {
  writeStorage(DEVICE_MODE_KEY, mode)
  setChannel(mode === 'kiosk' ? 'KIOSK' : mode === 'desk' ? 'ASSISTED_DESK' : 'PWA')
}

export function currentDeviceMode(): DeviceMode {
  const stored = readStorage(DEVICE_MODE_KEY)
  return stored === 'kiosk' || stored === 'desk' ? stored : 'personal'
}

export const tokenStore = {
  get: () => readStorage(TOKEN_KEY),
  set: (token: string) => writeStorage(TOKEN_KEY, token),
  clear: () => {
    try {
      window.localStorage.removeItem(TOKEN_KEY)
    } catch {
      /* ignore */
    }
  },
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  /** Extra headers, e.g. an idempotency key for a replay. */
  headers?: Record<string, string>
  /** Set for requests that must not be queued offline (auth, health). */
  noRetry?: boolean
  signal?: AbortSignal
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    'X-Source-Channel': currentChannel(),
    'X-Device-Uid': deviceUid(),
    ...(options.headers || {}),
  }
  const token = tokenStore.get()
  if (token) headers.Authorization = `Bearer ${token}`

  const isFormData = options.body instanceof FormData
  if (options.body !== undefined && !isFormData) {
    headers['Content-Type'] = 'application/json'
  }

  let response: Response
  try {
    response = await fetch(`${API_PREFIX}${path}`, {
      method: options.method || 'GET',
      headers,
      signal: options.signal,
      body:
        options.body === undefined
          ? undefined
          : isFormData
            ? (options.body as FormData)
            : JSON.stringify(options.body),
    })
  } catch (error) {
    // A network-level failure is reported as status 0 so callers can queue it.
    throw new ApiError(0, 'network_unreachable', 'No connection to the campus server.', {
      cause: (error as Error).message,
    })
  }

  if (response.status === 204) return undefined as T

  const contentType = response.headers.get('content-type') || ''
  const isJson = contentType.includes('application/json')
  const payload = isJson ? await response.json().catch(() => null) : await response.text()

  if (!response.ok) {
    const error = (payload as any)?.error
    throw new ApiError(
      response.status,
      error?.code || 'request_failed',
      error?.message || `Request failed (${response.status}).`,
      error?.details || {},
    )
  }
  return payload as T
}

/** A URL for a raw API resource that is not fetched through the JSON client:
 *  an image (`<img src>`), a file download, or a QR picture. Honours the split
 *  deployment base so it points at the backend, not the frontend origin. */
export function apiUrl(path: string): string {
  return `${API_PREFIX}/${path.replace(/^\//, '')}`
}

/** The same, forced to an absolute URL - used where a link is shared with
 *  someone on another machine (a notice share link, a QR). Falls back to the
 *  current origin when the API is same-origin (single-machine self-host). */
export function apiAbsoluteUrl(path: string): string {
  const url = apiUrl(path)
  if (/^https?:\/\//i.test(url)) return url
  return `${window.location.origin}${url}`
}

/** Private media (a notice circular, case evidence) sits behind the bearer
 *  token, which `<img src>` and `window.open` cannot send. Fetch it through the
 *  authenticated client and hand back a blob URL the browser can display. */
export async function fetchBlobUrl(path: string): Promise<string> {
  const headers: Record<string, string> = {
    'X-Source-Channel': currentChannel(),
    'X-Device-Uid': deviceUid(),
  }
  const token = tokenStore.get()
  if (token) headers.Authorization = `Bearer ${token}`
  let response: Response
  try {
    response = await fetch(`${API_PREFIX}${path}`, { headers })
  } catch (error) {
    throw new ApiError(0, 'network_unreachable', 'No connection to the campus server.', {
      cause: (error as Error).message,
    })
  }
  if (!response.ok) {
    throw new ApiError(response.status, 'media_unavailable', `Could not load that file (${response.status}).`)
  }
  return URL.createObjectURL(await response.blob())
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => request<T>(path, { signal }),
  post: <T>(path: string, body?: unknown, headers?: Record<string, string>) =>
    request<T>(path, { method: 'POST', body, headers }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  upload: <T>(path: string, form: FormData) => request<T>(path, { method: 'POST', body: form }),

  /** Is the API genuinely reachable? navigator.onLine lies on captive portals. */
  async reachable(): Promise<boolean> {
    try {
      await request('/health', { noRetry: true })
      return true
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return true
      return false
    }
  },
}

/** Build a query string, dropping empty values so URLs stay readable. */
export function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '' || value === false) return
    search.set(key, String(value))
  })
  const text = search.toString()
  return text ? `?${text}` : ''
}
