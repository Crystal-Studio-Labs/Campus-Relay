/** Protected Supervisor and Administrator Modal for Corridor Kiosks.
 *
 *  Prevents walk-up students or unauthorized users from terminating the kiosk
 *  session, tampering with settings, or logging in with a personal account.
 *
 *  Allows authorized Administrators and Super Admins to:
 *   1. Change which campus section/station this kiosk belongs to
 *   2. Decommission/sign out the kiosk terminal securely
 *   3. Inspect terminal hardware UID and local storage state
 */

import { useState } from 'react'
import { Badge, Button } from './ui'
import {
  type KioskStationSection,
  useKioskSection,
  verifySupervisorPin,
} from '../lib/kioskSection'
import { deviceUid } from '../lib/api'

interface KioskSupervisorModalProps {
  isOpen: boolean
  onClose: () => void
  onLogout: () => void
}

export function KioskSupervisorModal({ isOpen, onClose, onLogout }: KioskSupervisorModalProps) {
  const { section, setSection, allSections } = useKioskSection()
  const [pin, setPin] = useState('')
  const [isUnlocked, setIsUnlocked] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedSection, setSelectedSection] = useState<KioskStationSection>(section)
  const [confirmLogout, setConfirmLogout] = useState(false)

  if (!isOpen) return null

  const handleVerify = (e?: React.FormEvent) => {
    e?.preventDefault()
    if (verifySupervisorPin(pin)) {
      setIsUnlocked(true)
      setError(null)
      setSelectedSection(section)
    } else {
      setError('Invalid Supervisor Key. Access denied.')
      setPin('')
    }
  }

  const handleApplySection = () => {
    setSection(selectedSection)
    handleClose()
  }

  const handleClose = () => {
    setPin('')
    setIsUnlocked(false)
    setError(null)
    setConfirmLogout(false)
    onClose()
  }

  const handleNumClick = (digit: string) => {
    if (pin.length < 8) {
      setPin((prev) => prev + digit)
    }
  }

  return (
    <div
      className="kiosk-supervisor-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="supervisor-title"
    >
      <div className="kiosk-supervisor-modal">
        {/* Terminal Header */}
        <div className="kiosk-supervisor-head">
          <div className="row wrap" style={{ gap: 8, alignItems: 'center' }}>
            <span className="hero-kicker-beacon" aria-hidden="true" />
            <span className="mono tiny bold" style={{ letterSpacing: '0.08em' }}>
              SECURITY GOVERNANCE · ADMIN PROTOCOL
            </span>
          </div>
          <button
            type="button"
            className="kiosk-supervisor-close-btn"
            onClick={handleClose}
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        {!isUnlocked ? (
          /* ================= STEP 1: PIN CHALLENGE ================= */
          <div className="stack" style={{ gap: 'var(--sp-4)', padding: 'var(--sp-4)' }}>
            <div>
              <div className="row wrap" style={{ gap: 8, alignItems: 'center', marginBottom: 6 }}>
                <Badge tone="urgent">RESTRICTED STATION ACCESS</Badge>
                <span className="mono tiny muted">TERMINAL: {section.stationId}</span>
              </div>
              <h2 id="supervisor-title" className="kiosk-title" style={{ margin: '0 0 6px', fontSize: 'var(--fs-lg)' }}>
                Supervisor Access Key Required
              </h2>
              <p className="kiosk-hint" style={{ margin: 0 }}>
                Corridor terminals are locked into continuous service. Ending the session or changing
                the campus section requires administrator authorization.
              </p>
            </div>

            {error ? (
              <div className="banner banner-error" role="alert" style={{ margin: 0 }}>
                {error}
              </div>
            ) : null}

            <form onSubmit={handleVerify} className="stack" style={{ gap: 'var(--sp-3)' }}>
              <div>
                <label htmlFor="supervisor-pin" className="mono tiny bold" style={{ display: 'block', marginBottom: 6 }}>
                  ENTER 4-DIGIT SUPERVISOR PIN / ADMIN PASSCODE
                </label>
                <input
                  id="supervisor-pin"
                  type="password"
                  maxLength={8}
                  className="kiosk-supervisor-pin-input"
                  placeholder="••••"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  autoFocus
                />
              </div>

              {/* On-screen touch keypad for corridor kiosks without physical keyboards */}
              <div className="kiosk-keypad-grid">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                  <button
                    key={digit}
                    type="button"
                    className="kiosk-keypad-btn"
                    onClick={() => handleNumClick(digit)}
                  >
                    {digit}
                  </button>
                ))}
                <button
                  type="button"
                  className="kiosk-keypad-btn kiosk-keypad-clear"
                  onClick={() => setPin('')}
                >
                  CLR
                </button>
                <button
                  type="button"
                  className="kiosk-keypad-btn"
                  onClick={() => handleNumClick('0')}
                >
                  0
                </button>
                <button
                  type="button"
                  className="kiosk-keypad-btn kiosk-keypad-back"
                  onClick={() => setPin((prev) => prev.slice(0, -1))}
                >
                  ⌫
                </button>
              </div>

              <div className="row wrap" style={{ gap: 'var(--sp-2)', justifyContent: 'space-between', marginTop: 'var(--sp-2)' }}>
                <span className="mono tiny muted" style={{ alignSelf: 'center' }}>
                  Default Supervisor Key: <strong>1947</strong>
                </span>
                <div className="row wrap" style={{ gap: 'var(--sp-2)' }}>
                  <Button type="button" variant="ghost" onClick={handleClose}>
                    Return to Safe Kiosk
                  </Button>
                  <Button type="submit" variant="primary" disabled={!pin}>
                    Verify Key & Unlock
                  </Button>
                </div>
              </div>
            </form>
          </div>
        ) : (
          /* ================= STEP 2: SUPERVISOR DECK ================= */
          <div className="stack" style={{ gap: 'var(--sp-4)', padding: 'var(--sp-4)' }}>
            <div>
              <div className="row wrap" style={{ gap: 8, alignItems: 'center', marginBottom: 6 }}>
                <Badge tone="done">AUTHENTICATED SUPERVISOR</Badge>
                <span className="mono tiny muted">HARDWARE UID: {deviceUid()}</span>
              </div>
              <h2 id="supervisor-title" className="kiosk-title" style={{ margin: '0 0 6px', fontSize: 'var(--fs-lg)' }}>
                Kiosk Station & Section Management
              </h2>
              <p className="kiosk-hint" style={{ margin: 0 }}>
                Set which physical section this corridor terminal serves. Cases filed from this terminal
                will automatically bind to the selected location code.
              </p>
            </div>

            {/* Current Active Section Badge */}
            <div className="kiosk-supervisor-section-box">
              <span className="mono tiny bold" style={{ color: 'var(--signal)' }}>
                CURRENT ACTIVE STATION CONFIGURATION:
              </span>
              <div className="row wrap" style={{ alignItems: 'center', gap: 10, marginTop: 4 }}>
                <Badge tone="warn">{section.stationName}</Badge>
                <strong style={{ fontSize: 'var(--fs-base)' }}>{section.sectionName}</strong>
                <span className="mono tiny muted">({section.locationCode})</span>
              </div>
            </div>

            {/* Campus Section Radio Selector */}
            <div>
              <label className="mono tiny bold" style={{ display: 'block', marginBottom: 8 }}>
                ASSIGN KIOSK SECTION / DEPLOYMENT ZONE:
              </label>
              <div className="kiosk-sections-grid">
                {allSections.map((sec) => {
                  const isSelected = selectedSection.id === sec.id
                  return (
                    <button
                      key={sec.id}
                      type="button"
                      className={`kiosk-section-card ${isSelected ? 'is-selected' : ''}`}
                      onClick={() => setSelectedSection(sec)}
                    >
                      <div className="row between" style={{ alignItems: 'center', marginBottom: 4 }}>
                        <Badge tone={isSelected ? 'warn' : 'ghost'}>{sec.stationName}</Badge>
                        <span className="mono tiny bold">{sec.locationCode}</span>
                      </div>
                      <div className="bold" style={{ fontSize: 'var(--fs-sm)', marginBottom: 2 }}>
                        {sec.sectionName}
                      </div>
                      <div className="tiny muted">{sec.description}</div>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Destructive Actions & Session End */}
            <div className="kiosk-supervisor-danger-zone">
              <div className="row wrap between" style={{ alignItems: 'center', gap: 12 }}>
                <div>
                  <div className="bold tiny" style={{ color: 'var(--urgent)' }}>
                    TERMINATE KIOSK STATION SESSION
                  </div>
                  <div className="tiny muted">
                    Decommissions this terminal and returns to the administrative login screen.
                  </div>
                </div>

                {!confirmLogout ? (
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    onClick={() => setConfirmLogout(true)}
                  >
                    Decommission Station
                  </Button>
                ) : (
                  <div className="row wrap" style={{ gap: 8 }}>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setConfirmLogout(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      variant="danger"
                      size="sm"
                      onClick={() => {
                        handleClose()
                        onLogout()
                      }}
                    >
                      Confirm Sign-Out
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="row wrap" style={{ gap: 'var(--sp-2)', justifyContent: 'flex-end', marginTop: 'var(--sp-2)' }}>
              <Button type="button" variant="ghost" onClick={handleClose}>
                Keep Current Section
              </Button>
              <Button type="button" variant="primary" onClick={handleApplySection}>
                Save & Lock Station ({selectedSection.stationName})
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
