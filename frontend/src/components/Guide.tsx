/** The guide overlay and its controls.
 *
 *  The spotlight is positioned from the target's real bounding box, so it works
 *  on a 360px phone and a 1600px workstation without a single hardcoded offset.
 *
 *  TWO SHAPES, ONE GUIDE
 *  ---------------------
 *  Desktop: the tip card is anchored near the spotlit element, below it when
 *  there is room and above it when there is not.
 *  Phone: the card becomes a bottom sheet, full width, where a thumb already
 *  is - an anchored card on a 390px screen covers the very thing it is pointing
 *  at. The spotlight still marks the target above the sheet.
 *
 *  The dim is four panes around the target, not one box-shadow, so the hole in
 *  the middle is a genuinely transparent gap in a layer that sits above the top
 *  bar, the rail and every card. The panes take clicks (the tour drives itself),
 *  the tip card takes clicks, and the hole leaves the spotlit control usable.
 *
 *  A step may name the screen it lives on. If the target is not on this screen,
 *  the overlay opens that route and measures again; if it still does not appear
 *  after a short wait, the step is abandoned and the tour carries on. That is
 *  what lets one tour walk somebody from the request form through to the case
 *  timeline without ever stalling.
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { GUIDE_ROLES, matchesRoute, toursForRole } from '../lib/tours'
import { useGuide } from '../state/guide'
import { useSession } from '../state/session'
import { useInstitution } from '../state/institution'
import { useLanguage } from '../lib/i18n'
import { Button } from './ui'

/** Phones get the bottom sheet; everything wider gets the anchored card. */
const SHEET_BREAKPOINT = 721

export function GuideOverlay() {
  const { tour, step, stepIndex, stepCount, next, previous, stop, skipStep } = useGuide()
  const { profile } = useSession()
  const institution = useInstitution()
  const { t } = useLanguage()
  const location = useLocation()
  const navigate = useNavigate()

  const [rect, setRect] = useState<DOMRect | null>(null)
  const [tipHeight, setTipHeight] = useState(200)
  const [tick, setTick] = useState(0)
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.innerWidth < SHEET_BREAKPOINT)
  const waited = useRef(0)
  const tipRef = useRef<HTMLDivElement>(null)

  const allowed =
    (GUIDE_ROLES as readonly string[]).includes(profile?.role ?? '') &&
    institution.config.features.guided_tours !== false

  useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth < SHEET_BREAKPOINT)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Each new step starts with a fresh patience budget.
  useEffect(() => {
    waited.current = 0
  }, [step])

  // Find the target, opening its screen if this step names one. Bounded: after
  // roughly three seconds of nothing the step is dropped and the tour moves on.
  useEffect(() => {
    if (!allowed || !step) return
    if (document.querySelector(step.target)) return
    if (step.route && !matchesRoute(location.pathname, step.route)) {
      navigate(step.route)
      return
    }
    if (waited.current >= 10) {
      skipStep()
      return
    }
    waited.current += 1
    const timer = window.setTimeout(() => setTick((value) => value + 1), 280)
    return () => window.clearTimeout(timer)
  }, [allowed, step, tick, location.pathname, navigate, skipStep])

  // Follow the target through scrolling, rotation and reflow. The marker class
  // is applied in the same pass that produces the rect, so the element on screen
  // and the element the ring is drawn around can never drift apart - which is
  // what happened when a step opened another screen and the marker waited on a
  // different effect's timing. Whatever it marks is removed again on the next
  // step, so a tour never leaves stray markers behind.
  useLayoutEffect(() => {
    if (!step) {
      setRect(null)
      return
    }
    let frame = 0
    let marked: Element | null = null
    const measure = () => {
      const element = document.querySelector(step.target)
      if (!element) {
        setRect(null)
        return
      }
      if (marked && marked !== element) marked.classList.remove('guide-target')
      marked = element
      element.classList.add('guide-target')
      setRect(element.getBoundingClientRect())
    }
    const element = document.querySelector(step.target)
    element?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    const onResize = () => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(measure)
    }
    measure()
    window.addEventListener('scroll', onResize, true)
    window.addEventListener('resize', onResize)
    const timer = window.setTimeout(measure, 320) // after smooth scroll settles
    return () => {
      window.cancelAnimationFrame(frame)
      window.clearTimeout(timer)
      window.removeEventListener('scroll', onResize, true)
      window.removeEventListener('resize', onResize)
      marked?.classList.remove('guide-target')
    }
  }, [step, tick])

  useLayoutEffect(() => {
    if (tipRef.current) setTipHeight(tipRef.current.offsetHeight)
  }, [step, rect, narrow])

  if (!allowed || !tour || !step) return null

  const stepLabel = t('guide.stepOf').replace('{done}', String(stepIndex + 1)).replace('{total}', String(stepCount))

  // While the right screen is being opened there is nothing to point at yet, so
  // the full card would only flash in the wrong place.
  if (!rect) {
    return (
      <div className="guide-root" role="status" aria-live="polite">
        <div className="guide-waiting">{t('guide.opening')}</div>
      </div>
    )
  }

  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  const pad = 8
  const spotlight = {
    left: Math.max(4, rect.left - pad),
    top: Math.max(4, rect.top - pad),
    width: Math.min(viewportWidth - 8, rect.width + pad * 2),
    height: rect.height + pad * 2,
  }

  // Place the tip below the target when there is room, otherwise above it, and
  // otherwise centre it on screen (e.g. the target is a tall list).
  const below = spotlight.top + spotlight.height + 12
  const fitsBelow = below + tipHeight + 12 < viewportHeight
  let tipTop = fitsBelow ? below : Math.max(12, spotlight.top - tipHeight - 12)
  if (tipTop < 12) tipTop = Math.min(viewportHeight - tipHeight - 12, viewportHeight / 2 - tipHeight / 2)
  const tipLeft = Math.min(Math.max(12, spotlight.left), Math.max(12, viewportWidth - 380 - 12))

  // Four panes framing the hole. Each pane is clamped to the viewport so a
  // target scrolled half out of sight cannot produce a negative size.
  const holeRight = spotlight.left + spotlight.width
  const holeBottom = spotlight.top + spotlight.height
  const panes = [
    { left: 0, top: 0, width: viewportWidth, height: Math.max(0, spotlight.top) },
    {
      left: 0,
      top: holeBottom,
      width: viewportWidth,
      height: Math.max(0, viewportHeight - holeBottom),
    },
    { left: 0, top: spotlight.top, width: Math.max(0, spotlight.left), height: spotlight.height },
    {
      left: holeRight,
      top: spotlight.top,
      width: Math.max(0, viewportWidth - holeRight),
      height: spotlight.height,
    },
  ]

  return (
    <div className="guide-root" role="dialog" aria-label={tour.name}>
      {panes.map((pane, index) => (
        <div key={index} className="guide-scrim" style={pane} aria-hidden="true" />
      ))}
      <div className="guide-spotlight" style={spotlight} aria-hidden="true" />
      <div
        className={`guide-tip${narrow ? ' guide-tip-sheet' : ''}`}
        ref={tipRef}
        style={narrow ? undefined : { top: tipTop, left: tipLeft }}
      >
        <div className="guide-tip-head">
          <span className="guide-step-count">{stepLabel}</span>
          <button type="button" className="guide-close" onClick={stop} aria-label={t('guide.stop')}>
            <span aria-hidden="true">✕</span>
          </button>
        </div>
        <h3>{step.title}</h3>
        <p>{step.body}</p>
        <div className="guide-actions">
          {stepIndex > 0 ? (
            <Button size="sm" variant="ghost" onClick={previous}>
              ← {t('guide.back')}
            </Button>
          ) : null}
          <Button size="sm" variant="primary" onClick={next}>
            {stepIndex + 1 >= stepCount ? t('guide.finish') : `${t('guide.next')} →`}
          </Button>
          <Button size="sm" variant="ghost" onClick={stop}>
            {t('guide.skip')}
          </Button>
        </div>
      </div>
    </div>
  )
}

/** Compact control for the top bar: on/off switch plus "tour this screen".
 *  Rendered only for the roles the guide is written for. */
export function GuideControls({ compact, onStart }: { compact?: boolean; onStart?: () => void }) {
  const { enabled, setEnabled, start, tour } = useGuide()
  const { profile } = useSession()
  const institution = useInstitution()
  const { t } = useLanguage()
  const location = useLocation()
  const navigate = useNavigate()

  const allowed =
    (GUIDE_ROLES as readonly string[]).includes(profile?.role ?? '') &&
    institution.config.features.guided_tours !== false
  if (!allowed) return null

  const matching = toursForRole(profile?.role).find((item) => matchesRoute(location.pathname, item.route))

  return (
    <div className="row wrap" style={{ gap: 6 }}>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        aria-pressed={enabled}
        title={enabled ? t('guide.onHint') : t('guide.offHint')}
        onClick={() => setEnabled(!enabled)}
      >
        {enabled ? `● ${t('guide.on')}` : `○ ${t('guide.off')}`}
      </button>
      {enabled && matching && !tour ? (
        <Button
          size="sm"
          variant="agent"
          onClick={() => {
            // On a phone these controls live inside the account panel, which
            // would sit on top of the tour it just started.
            onStart?.()
            start(matching.id)
          }}
        >
          {t('guide.tourThisScreen')}
        </Button>
      ) : null}
      {enabled && !matching && !compact ? (
        <Button size="sm" variant="ghost" onClick={() => navigate('/guide')}>
          {t('guide.allTours')}
        </Button>
      ) : null}
    </div>
  )
}
