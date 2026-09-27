/** The guide overlay and its controls.
 *
 *  The spotlight is positioned from the target's real bounding box, so it works
 *  on a 360px phone and a 1600px workstation without a single hardcoded offset.
 *  Only the tip card accepts pointer events; the dimmed area stays inert, so the
 *  app underneath is never locked out by the guide.
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { TOURS } from '../lib/tours'
import { useGuide } from '../state/guide'
import { Button } from './ui'

export function GuideOverlay() {
  const { tour, step, stepIndex, stepCount, next, previous, stop } = useGuide()
  const [rect, setRect] = useState<DOMRect | null>(null)
  const [tipHeight, setTipHeight] = useState(200)
  const tipRef = useRef<HTMLDivElement>(null)

  // Follow the target through scrolling, rotation and reflow.
  useLayoutEffect(() => {
    if (!step) {
      setRect(null)
      return
    }
    let frame = 0
    const measure = () => {
      const element = document.querySelector(step.target)
      if (!element) {
        setRect(null)
        return
      }
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
    }
  }, [step])

  useLayoutEffect(() => {
    if (tipRef.current) setTipHeight(tipRef.current.offsetHeight)
  }, [step, rect])

  useEffect(() => {
    if (!step) return
    document.querySelector(step.target)?.classList.add('guide-target')
    return () => document.querySelector(step.target)?.classList.remove('guide-target')
  }, [step])

  if (!tour || !step) return null

  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  const pad = 8

  const spotlight = rect
    ? {
        left: Math.max(4, rect.left - pad),
        top: Math.max(4, rect.top - pad),
        width: Math.min(viewportWidth - 8, rect.width + pad * 2),
        height: rect.height + pad * 2,
      }
    : null

  // Place the tip below the target when there is room, otherwise above it, and
  // otherwise centre it on screen (e.g. the target is a tall list).
  let tipTop: number
  let tipLeft: number
  if (spotlight) {
    const below = spotlight.top + spotlight.height + 12
    const fitsBelow = below + tipHeight + 12 < viewportHeight
    tipTop = fitsBelow ? below : Math.max(12, spotlight.top - tipHeight - 12)
    if (tipTop < 12) tipTop = Math.min(viewportHeight - tipHeight - 12, viewportHeight / 2 - tipHeight / 2)
    tipLeft = Math.min(Math.max(12, spotlight.left), viewportWidth - 380 - 12)
  } else {
    tipTop = Math.max(12, viewportHeight / 2 - tipHeight / 2)
    tipLeft = Math.max(12, viewportWidth / 2 - 190)
  }

  return (
    <div className="guide-root" role="dialog" aria-label={`Guided tour: ${tour.name}`}>
      {spotlight ? <div className="guide-spotlight" style={spotlight} aria-hidden="true" /> : null}
      <div className="guide-tip" ref={tipRef} style={{ top: tipTop, left: tipLeft }}>
        <h3>{step.title}</h3>
        <p>{step.body}</p>
        <div className="guide-actions">
          {stepIndex > 0 ? (
            <Button size="sm" variant="ghost" onClick={previous}>
              ← Back
            </Button>
          ) : null}
          <Button size="sm" variant="primary" onClick={next}>
            {stepIndex + 1 >= stepCount ? 'Finish' : 'Next →'}
          </Button>
          <Button size="sm" variant="ghost" onClick={stop}>
            Skip
          </Button>
          <span className="guide-step-count">
            {stepIndex + 1} / {stepCount}
          </span>
        </div>
      </div>
    </div>
  )
}

/** Compact control for the top bar: on/off switch plus "tour this screen". */
export function GuideControls({ compact }: { compact?: boolean }) {
  const { enabled, setEnabled, start, tour } = useGuide()
  const location = useLocation()
  const navigate = useNavigate()

  const matching = TOURS.find((item) => item.route === location.pathname)

  return (
    <div className="row wrap" style={{ gap: 6 }}>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        aria-pressed={enabled}
        title={
          enabled
            ? 'Guides are on. New screens will offer a tour.'
            : 'Guides are off. Turn them on to see what each screen does.'
        }
        onClick={() => setEnabled(!enabled)}
      >
        {enabled ? '● Guide on' : '○ Guide off'}
      </button>
      {enabled && matching && !tour ? (
        <Button size="sm" variant="agent" onClick={() => start(matching.id)}>
          Tour this screen
        </Button>
      ) : null}
      {enabled && !matching && !compact ? (
        <Button size="sm" variant="ghost" onClick={() => navigate('/guide')}>
          All tours
        </Button>
      ) : null}
    </div>
  )
}
