/** Kiosk / tablet-in-a-corridor shell.
 *
 *  Assumptions that differ from the phone app: no keyboard habits, no personal
 *  session, a queue of people behind you, and often a cheap Android tablet with
 *  a cracked screen. So: huge touch targets, no hidden gestures, and an idle
 *  reset so the next student never sees the last student's data.
 *
 *  The idle timeout and the wording both come from the institution
 *  configuration, because the right answer differs between a quiet library
 *  lobby and a busy admissions counter.
 */

import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { setChannel } from '../lib/api'
import { LANGUAGES } from '../lib/i18n'
import { useInstitution } from '../state/institution'
import { useSession } from '../state/session'

export function KioskShell({ children, onReset }: { children: ReactNode; onReset?: () => void }) {
  const navigate = useNavigate()
  const { logout } = useSession()
  const institution = useInstitution()
  const [clock, setClock] = useState(() => new Date())
  const [idle, setIdle] = useState(false)
  const timer = useRef<number | null>(null)

  const idleMs = Math.max(15, institution.config.stations.kiosk_idle_seconds) * 1000
  const offered = institution.config.localisation.languages
  const languages = LANGUAGES.filter((entry) => offered.includes(entry.code))
    .map((entry) => entry.native)
    .join(' · ')

  useEffect(() => {
    setChannel('KIOSK')
    const tick = window.setInterval(() => setClock(new Date()), 1000)
    return () => window.clearInterval(tick)
  }, [])

  useEffect(() => {
    const bump = () => {
      setIdle(false)
      if (timer.current) window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => setIdle(true), idleMs)
    }
    bump()
    const events: (keyof WindowEventMap)[] = ['pointerdown', 'keydown', 'touchstart']
    events.forEach((event) => window.addEventListener(event, bump))
    return () => {
      events.forEach((event) => window.removeEventListener(event, bump))
      if (timer.current) window.clearTimeout(timer.current)
    }
  }, [idleMs])

  // On idle, clear the screen back to the start. Anything else risks exposing
  // one student's case list to the next person standing here.
  useEffect(() => {
    if (!idle) return
    onReset?.()
    navigate('/kiosk', { replace: true })
  }, [idle, navigate, onReset])

  return (
    <div className="kiosk">
      <div className="kiosk-clock no-print">
        {clock.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </div>
      <header className="kiosk-header">
        <div className="kiosk-title">{institution.shortName}</div>
        <div className="kiosk-hint">
          Self-service kiosk{languages ? ` · ${languages}` : ''}
        </div>
      </header>
      <div className="kiosk-body">{children}</div>
      <footer className="no-print row center" style={{ padding: 'var(--sp-3)', gap: 'var(--sp-3)' }}>
        <span className="tiny muted">
          This screen resets after {institution.config.stations.kiosk_idle_seconds}s of no activity.
        </span>
        <button className="btn btn-ghost btn-sm" onClick={() => logout()}>
          End kiosk session
        </button>
      </footer>
    </div>
  )
}
