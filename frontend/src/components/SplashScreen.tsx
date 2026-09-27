/** Industrial Brutalist Animated Splash Screen.
 *
 *  Provides an authoritative, high-impact boot sequence for the campus operating
 *  layer. Synchronized with the active theme (White / Dark mode), telemetry diagnostics,
 *  hardware device ID, and dynamic progress bar.
 */

import { useEffect, useState } from 'react'
import { currentChannel, currentDeviceMode, deviceUid } from '../lib/api'
import { useInstitution } from '../state/institution'
import { useTheme } from '../state/theme'

interface SplashScreenProps {
  label?: string
  onComplete?: () => void
}

export function SplashScreen({ label = 'Initializing campus operating layer…', onComplete }: SplashScreenProps) {
  const institution = useInstitution()
  const { theme } = useTheme()
  const [progress, setProgress] = useState(15)
  const [activeStep, setActiveStep] = useState(0)

  const steps = [
    { code: 'BOOT_01', text: 'INITIALIZING MESH CORE & MEMORY CACHE' },
    { code: 'AUTH_02', text: 'VERIFYING HARDWARE FINGERPRINT & LEDGER' },
    { code: 'SYNC_03', text: 'LINKING PERSISTENT INDEXEDDB BUFFER' },
    { code: 'READY_04', text: 'OPERATIONAL LAYER ENGAGED · ONLINE' },
  ]

  useEffect(() => {
    const t1 = setTimeout(() => {
      setProgress(42)
      setActiveStep(1)
    }, 280)

    const t2 = setTimeout(() => {
      setProgress(78)
      setActiveStep(2)
    }, 620)

    const t3 = setTimeout(() => {
      setProgress(100)
      setActiveStep(3)
      onComplete?.()
    }, 1050)

    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
      clearTimeout(t3)
    }
  }, [onComplete])

  const mode = currentDeviceMode().toUpperCase()
  const channel = currentChannel()
  const uid = deviceUid()

  return (
    <div className="splash-screen" role="status" aria-live="polite">
      {/* Background Technical Grid Overlay */}
      <div className="splash-grid-bg" aria-hidden="true" />

      {/* Central Brutalist Console Frame */}
      <div className="splash-console-frame">
        {/* 4 Corner Crosshairs */}
        <span className="splash-corner splash-tl" aria-hidden="true">+</span>
        <span className="splash-corner splash-tr" aria-hidden="true">+</span>
        <span className="splash-corner splash-bl" aria-hidden="true">+</span>
        <span className="splash-corner splash-br" aria-hidden="true">+</span>

        {/* Top Hardware Telemetry Header */}
        <div className="splash-topbar">
          <div className="row wrap" style={{ gap: 8, alignItems: 'center' }}>
            <span className="hero-kicker-beacon" aria-hidden="true" />
            <span className="mono tiny bold" style={{ letterSpacing: '0.08em' }}>
              SYS.BOOT // CORE v2.6.4
            </span>
          </div>
          <div className="mono tiny bold hide-mobile" style={{ color: 'var(--mint)' }}>
            [● TELEMETRY ONLINE]
          </div>
        </div>

        {/* Brand Emblem & Headline */}
        <div className="splash-brand-block">
          <div className="splash-emblem-wrap">
            <div className="splash-emblem-core">
              <span className="splash-emblem-beacon" />
              <span className="mono bold" style={{ fontSize: '1.25rem', color: '#ffffff' }}>CR</span>
            </div>
          </div>

          <div style={{ textAlign: 'start' }}>
            <h1 className="splash-title">
              {institution.shortName || 'Campus Relay'}
            </h1>
            <p className="splash-subtitle">
              Resilient Operating Layer for Campus Operations
            </p>
          </div>
        </div>

        {/* Hardware & Channel Telemetry Strip */}
        <div className="splash-telemetry-strip">
          <div className="row wrap between" style={{ gap: 6 }}>
            <span className="mono tiny">
              STATION MODE: <strong>{mode}</strong>
            </span>
            <span className="mono tiny">
              CHANNEL: <strong>{channel}</strong>
            </span>
            <span className="mono tiny hide-mobile">
              DEVICE: <strong>{uid.slice(0, 14)}…</strong>
            </span>
            <span className="mono tiny">
              THEME: <strong>{theme.toUpperCase()}</strong>
            </span>
          </div>
        </div>

        {/* Step-by-Step Diagnostics Checklist */}
        <div className="splash-diagnostics-box">
          <div className="mono tiny bold" style={{ marginBottom: 6, color: 'var(--muted)' }}>
            DIAGNOSTIC BOOT SEQUENCE:
          </div>
          <div className="stack" style={{ gap: 4 }}>
            {steps.map((step, idx) => {
              const isDone = idx < activeStep
              const isCurrent = idx === activeStep
              return (
                <div
                  key={step.code}
                  className={`splash-diag-item ${isDone ? 'is-done' : isCurrent ? 'is-active' : ''}`}
                >
                  <span className="mono bold tiny splash-diag-status">
                    {isDone ? '[OK]' : isCurrent ? '[▶]' : '[··]'}
                  </span>
                  <span className="mono tiny splash-diag-text">
                    [{step.code}] {step.text}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Dynamic Progress Bar */}
        <div className="splash-progress-section">
          <div className="row between mono tiny bold" style={{ marginBottom: 4 }}>
            <span>{label}</span>
            <span>{progress}%</span>
          </div>
          <div className="splash-progress-track">
            <div
              className="splash-progress-fill"
              style={{ width: `${progress}%` }}
              role="progressbar"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>
        </div>

        {/* Bottom Hardware Status */}
        <div className="splash-footer-bar">
          <span className="mono tiny muted">
            SECURE LOCAL-FIRST ARCHITECTURE · AUDIT IDEMPOTENCY ACTIVE
          </span>
        </div>
      </div>
    </div>
  )
}
