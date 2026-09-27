/** Session state: who is signed in, what they may do, and on what kind of device. */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { ApiError, api, setChannel, tokenStore } from '../lib/api'
import { setLanguage } from '../lib/i18n'
import type { Profile, RoleKey } from '../lib/types'

interface SessionValue {
  profile: Profile | null
  status: 'loading' | 'anonymous' | 'authenticated'
  error: string | null
  login: (email: string, password: string) => Promise<Profile>
  logout: () => void
  refresh: () => Promise<void>
  /** Permission check mirroring the server's RBAC keys. The server re-checks
   *  everything; this only decides what to render. */
  can: (...permissions: string[]) => boolean
}

const SessionContext = createContext<SessionValue | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [status, setStatus] = useState<SessionValue['status']>('loading')
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!tokenStore.get()) {
      setStatus('anonymous')
      setProfile(null)
      return
    }
    try {
      const fresh = await api.get<Profile>('/auth/me')
      setProfile(fresh)
      if (fresh.language) setLanguage(fresh.language === 'or' ? 'or' : 'en')
      setStatus('authenticated')
      setError(null)
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.isAuthFailure) {
        tokenStore.clear()
        setProfile(null)
        setStatus('anonymous')
      } else {
        // Server unreachable: keep the cached profile so the app still opens
        // offline and shows what it already knows.
        setStatus(profile ? 'authenticated' : 'anonymous')
        setError(
          requestError instanceof ApiError ? requestError.message : 'Could not reach the server.',
        )
      }
    }
  }, [profile])

  useEffect(() => {
    void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    setError(null)
    const response = await api.post<{ access_token: string; profile: Profile }>('/auth/login', {
      email,
      password,
    })
    tokenStore.set(response.access_token)
    setChannel('PWA')
    setProfile(response.profile)
    if (response.profile.language) setLanguage(response.profile.language === 'or' ? 'or' : 'en')
    setStatus('authenticated')
    return response.profile
  }, [])

  const logout = useCallback(() => {
    tokenStore.clear()
    setProfile(null)
    setStatus('anonymous')
  }, [])

  const value = useMemo<SessionValue>(() => {
    const permissions = new Set(profile?.permissions ?? [])
    return {
      profile,
      status,
      error,
      login,
      logout,
      refresh,
      can: (...required: string[]) => required.every((permission) => permissions.has(permission)),
    }
  }, [profile, status, error, login, logout, refresh])

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext)
  if (!value) throw new Error('useSession must be used inside SessionProvider')
  return value
}

export function useRole(): RoleKey | null {
  return useSession().profile?.role ?? null
}

/** Which experience should this device get?
 *
 *  The brief forbids shipping one desktop layout squeezed onto a phone. We detect
 *  three things: viewport class, interaction capability (pointer quality) and the
 *  role. Layout selection is then a pure function of those. */
export type ViewportClass = 'mobile' | 'tablet' | 'desktop'

export function useViewport(): { viewport: ViewportClass; coarsePointer: boolean; prefersReducedMotion: boolean } {
  const [state, setState] = useState(() => measure())

  useEffect(() => {
    const update = () => setState(measure())
    window.addEventListener('resize', update)
    window.addEventListener('orientationchange', update)
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    motion.addEventListener('change', update)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('orientationchange', update)
      motion.removeEventListener('change', update)
    }
  }, [])

  return state
}

function measure(): { viewport: ViewportClass; coarsePointer: boolean; prefersReducedMotion: boolean } {
  const width = typeof window === 'undefined' ? 1280 : window.innerWidth
  const viewport: ViewportClass = width <= 720 ? 'mobile' : width <= 1024 ? 'tablet' : 'desktop'
  const coarsePointer =
    typeof window !== 'undefined' && window.matchMedia('(hover: none) and (pointer: coarse)').matches
  const prefersReducedMotion =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  return { viewport, coarsePointer, prefersReducedMotion }
}
