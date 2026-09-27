/** Guide state: tours, the on/off switch, and where the person is in a tour.
 *
 *  Rules that keep a guide from becoming an annoyance:
 *   - it is off until switched on, and the choice is remembered per device;
 *   - a step whose element is not on this screen is skipped, not stalled on;
 *   - Escape always exits;
 *   - the overlay never blocks the app: the spotlight is inert, only the tip
 *     card takes clicks, so nobody gets trapped behind a dimmed screen.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { TOURS, type Tour, type TourStep } from '../lib/tours'

const ENABLED_KEY = 'campusrelay.guide'

interface GuideValue {
  /** Master switch, remembered on this device. */
  enabled: boolean
  setEnabled: (enabled: boolean) => void
  tour: Tour | null
  step: TourStep | null
  stepIndex: number
  stepCount: number
  /** Steps that were skipped because their target is not on this screen. */
  skipped: string[]
  start: (tourId: string) => void
  next: () => void
  previous: () => void
  stop: () => void
  finish: () => void
  completed: string[]
}

const GuideContext = createContext<GuideValue | null>(null)

export function GuideProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabledState] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem(ENABLED_KEY) === 'on'
    } catch {
      return false
    }
  })
  const [tourId, setTourId] = useState<string | null>(null)
  const [index, setIndex] = useState(0)
  const [completed, setCompleted] = useState<string[]>([])

  const setEnabled = useCallback((next: boolean) => {
    setEnabledState(next)
    try {
      window.localStorage.setItem(ENABLED_KEY, next ? 'on' : 'off')
    } catch {
      /* ignore */
    }
    if (!next) setTourId(null)
  }, [])

  const tour = useMemo(() => TOURS.find((item) => item.id === tourId) ?? null, [tourId])

  // Resolve which steps are actually present on this screen. Recomputed when the
  // index changes so a page that renders late is still picked up.
  const resolved = useMemo(() => {
    if (!tour) return { steps: [] as TourStep[], skipped: [] as string[] }
    const present: TourStep[] = []
    const missing: string[] = []
    for (const step of tour.steps) {
      if (typeof document === 'undefined' || document.querySelector(step.target)) present.push(step)
      else missing.push(step.title)
    }
    return { steps: present, skipped: missing }
  }, [tour, index])

  const step = tour ? resolved.steps[index] ?? null : null

  const start = useCallback(
    (id: string) => {
      setEnabledState(true)
      try {
        window.localStorage.setItem(ENABLED_KEY, 'on')
      } catch {
        /* ignore */
      }
      setTourId(id)
      setIndex(0)
    },
    [],
  )

  const stop = useCallback(() => setTourId(null), [])

  const finish = useCallback(() => {
    if (tourId) setCompleted((current) => [...new Set([...current, tourId])])
    setTourId(null)
  }, [tourId])

  const next = useCallback(() => {
    setIndex((current) => {
      if (current + 1 >= resolved.steps.length) {
        if (tourId) setCompleted((tours) => [...new Set([...tours, tourId])])
        setTourId(null)
        return 0
      }
      return current + 1
    })
  }, [resolved.steps.length, tourId])

  const previous = useCallback(() => setIndex((current) => Math.max(0, current - 1)), [])

  useEffect(() => {
    if (!tour) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setTourId(null)
      if (event.key === 'ArrowRight') next()
      if (event.key === 'ArrowLeft') previous()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [tour, next, previous])

  const value = useMemo<GuideValue>(
    () => ({
      enabled,
      setEnabled,
      tour,
      step,
      stepIndex: index,
      stepCount: resolved.steps.length,
      skipped: resolved.skipped,
      start,
      next,
      previous,
      stop,
      finish,
      completed,
    }),
    [enabled, setEnabled, tour, step, index, resolved, start, next, previous, stop, finish, completed],
  )

  return <GuideContext.Provider value={value}>{children}</GuideContext.Provider>
}

export function useGuide(): GuideValue {
  const value = useContext(GuideContext)
  if (!value) throw new Error('useGuide must be used inside GuideProvider')
  return value
}
