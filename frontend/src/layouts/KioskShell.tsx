/** Kiosk / tablet-in-a-corridor shell.
 *
 *  Assumptions that differ from the phone app: no keyboard habits, no personal
 *  session, a queue of people behind you, and often a cheap Android tablet with
 *  a cracked screen. So: huge touch targets, no hidden gestures, and an idle
 *  reset so the next student never sees the last student's data.
 *
 *  Equipped with:
 *   - English / Hindi / Odia live language switcher
 *   - White / Dark mode theme toggle
 *   - Live clock and automatic idle reset
 */

import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { setChannel } from '../lib/api'
import { LANGUAGES, useLanguage } from '../lib/i18n'
import { useInstitution } from '../state/institution'
import { useSession } from '../state/session'
import { useTheme } from '../state/theme'

export function KioskShell({ children, onReset }: { children: ReactNode; onReset?: () => void }) {
  const navigate = useNavigate()
  const { logout } = useSession()
  const institution = useInstitution()
  const { theme, toggleTheme } = useTheme()
  const { language, setLanguage, t } = useLanguage()
  const [clock, setClock] = useState(() => new Date())
  const [idle, setIdle] = useState(false)
  const timer = useRef<number | null>(null)

  const idleMs = Math.max(15, institution.config.stations.kiosk_idle_seconds) * 1000

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
      <header className="kiosk-header">
        <div className="kiosk-header-top">
          <div className="row" style={{ alignItems: 'center', gap: 10 }}>
            <div className="kiosk-clock-badge">
              <span className="hero-kicker-beacon" aria-hidden="true" />
              <span className="mono bold tiny">
                {clock.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            </div>
            <div className="hide-mobile">
              <span className="mono tiny bold" style={{ color: 'var(--signal)' }}>
                [STATION 06 · CORRIDOR TERMINAL]
              </span>
            </div>
          </div>

          <div className="row wrap" style={{ alignItems: 'center', gap: 8 }}>
            {/* Language Switcher: English, Hindi, Odia */}
            <div className="kiosk-lang-group" role="group" aria-label={t('language.label')}>
              {LANGUAGES.map((lang) => (
                <button
                  key={lang.code}
                  type="button"
                  className={`kiosk-lang-btn ${language === lang.code ? 'is-active' : ''}`}
                  onClick={() => setLanguage(lang.code)}
                >
                  {lang.native}
                </button>
              ))}
            </div>

            {/* White / Dark Theme Switch Button */}
            <button
              type="button"
              className="kiosk-theme-btn"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? t('theme.light') : t('theme.dark')}
              title={theme === 'dark' ? 'Switch to White Mode (Light)' : 'Switch to Dark Mode'}
            >
              <span
                className="kiosk-theme-dot"
                style={{ background: theme === 'dark' ? 'var(--mint)' : 'var(--signal)' }}
              />
              <span className="mono bold tiny">{theme === 'dark' ? '☀ LIGHT MODE' : '☾ DARK MODE'}</span>
            </button>
          </div>
        </div>

        <div className="kiosk-header-brand">
          <div className="kiosk-title">{institution.shortName}</div>
          <div className="kiosk-hint">
            {t('kiosk.title')} · {t('kiosk.welcome')}
          </div>
        </div>
      </header>

      <div className="kiosk-body">{children}</div>

      <footer className="no-print row center wrap" style={{ padding: 'var(--sp-3)', gap: 'var(--sp-3)' }}>
        <span className="tiny muted">
          {t('kiosk.idleReset')}
        </span>
        <button className="btn btn-ghost btn-sm" onClick={() => logout()}>
          {t('kiosk.endSession')}
        </button>
      </footer>
    </div>
  )
}
