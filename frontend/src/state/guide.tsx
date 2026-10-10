/** Guide state: tours, the on/off switch, and where the person is in a tour.
 *
 *  Rules that keep a guide from becoming an annoyance:
 *   - it is off until switched on, and the choice is remembered per device;
 *   - it is written for students and teachers only (see lib/tours.ts);
 *   - a step whose element is not on this screen is dropped, not stalled on -
 *     unless the step names the screen it belongs to, in which case the overlay
 *     opens that screen and measures again;
 *   - a step that still cannot be found is abandoned after a short wait, so a
 *     guide can never trap somebody on a step that does not exist for their role
 *     or their device;
 *   - Escape always exits;
 *   - the dim is four panes around the target on a layer above every panel, so
 *     the spotlit control stays crisp and clickable through the hole while the
 *     rest of the screen is held still until the step is answered;
 *   - Escape, Skip and Finish all leave the page exactly as it was found.
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
  /** Steps dropped because their target does not exist for this role/device. */
  skipped: string[]
  start: (tourId: string) => void
  next: () => void
  previous: () => void
  stop: () => void
  finish: () => void
  completed: string[]
  /** Abandon the current step and move on. Called by the overlay when a target
   *  never appears, so the tour always makes progress. */
  skipStep: () => void
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
  /** Steps given up on during this run, by title. */
  const [dropped, setDropped] = useState<string[]>([])

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

  // Which steps this person can actually be shown. A step is kept when its
  // element is on the screen, or when it names the screen to open first.
  const resolved = useMemo(() => {
    if (!tour) return { steps: [] as TourStep[], skipped: [] as string[] }
    const present: TourStep[] = []
    const missing: string[] = []
    for (const step of tour.steps) {
      if (dropped.includes(step.title)) continue
      const onScreen = typeof document !== 'undefined' && document.querySelector(step.target)
      if (onScreen || step.route) present.push(step)
      else missing.push(step.title)
    }
    return { steps: present, skipped: missing }
  }, [tour, dropped])

  const step = tour ? resolved.steps[index] ?? null : null

  const start = useCallback((id: string) => {
    setEnabledState(true)
    try {
      window.localStorage.setItem(ENABLED_KEY, 'on')
    } catch {
      /* ignore */
    }
    setDropped([])
    setTourId(id)
    setIndex(0)
  }, [])

  const stop = useCallback(() => setTourId(null), [])

  const finish = useCallback(() => {
    if (tourId) setCompleted((current) => [...new Set([...current, tourId])])
    setTourId(null)
    setIndex(0)
  }, [tourId])

  const next = useCallback(() => {
    if (index + 1 >= resolved.steps.length) {
      finish()
      return
    }
    setIndex((current) => current + 1)
  }, [index, resolved.steps.length, finish])

  const previous = useCallback(() => setIndex((current) => Math.max(0, current - 1)), [])

  const skipStep = useCallback(() => {
    if (!step) return
    setDropped((current) => [...current, step.title])
  }, [step])

  // If the last step of a run is dropped, the walkthrough ends rather than
  // sitting on an index that no longer exists.
  useEffect(() => {
    if (tour && resolved.steps.length <= index) finish()
  }, [tour, resolved.steps.length, index, finish])

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
      skipStep,
    }),
    [enabled, setEnabled, tour, step, index, resolved, start, next, previous, stop, finish, completed, skipStep],
  )

  return <GuideContext.Provider value={value}>{children}</GuideContext.Provider>
}

export function useGuide(): GuideValue {
  const value = useContext(GuideContext)
  if (!value) throw new Error('useGuide must be used inside GuideProvider')
  return value
}
