/** Master Industrial Brutalist Footer — Campus Relay
 *
 *  Engineered by Crystal Studio Labs for BPUT Hackathon 2026
 *  Problem Statement 07 (Fretbox): Resilient Campus Operations Layer
 */

import { Link } from 'react-router-dom'
import { useInstitution } from '../state/institution'
import { useTheme, THEME_OPTIONS } from '../state/theme'
import { Badge } from './ui'

export function MasterFooter() {
  const institution = useInstitution()
  const { theme, setTheme } = useTheme()

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  };

  return (
    <footer className="master-footer no-print">
      {/* ------------------------------------------------------------ TELEMETRY RIBBON */}
      <div className="footer-telemetry">
        <div className="footer-telemetry-inner">
          <div className="footer-status-pill">
            <span className="footer-pulse" />
            <span className="mono tiny bold">STATUS: ALL SYSTEMS NOMINAL</span>
            <span className="footer-sep" aria-hidden="true">|</span>
            <span className="mono tiny muted">STORE_AND_FORWARD_ONLINE</span>
            <span className="footer-sep" aria-hidden="true">|</span>
            <span className="mono tiny muted">PS07_FRETBOX_SPEC_2026</span>
          </div>

          <div className="footer-theme-wrap">
            <span className="tiny mono muted">THEME:</span>
            <div className="switcher" role="group" aria-label="Theme switcher">
              {THEME_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className="symbol"
                  aria-pressed={theme === option.id}
                  aria-label={option.hint}
                  title={option.hint}
                  onClick={() => setTheme(option.id)}
                >
                  <span aria-hidden="true">{option.symbol}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------ MAIN GRID */}
      <div className="footer-main">
        <div className="footer-grid">
          {/* Column 1: Identity & Provenance */}
          <div className="footer-col footer-col-brand">
            <div className="sidebar-brand" style={{ marginBottom: 12, display: 'inline-flex' }}>
              <span className="brand-mark" aria-hidden="true" data-monogram={institution.monogram} />
              <span className="brand-name">{institution.shortName}</span>
            </div>

            <p className="footer-desc">
              A high-resilience, offline-first operating layer for everyday university and hostel operations.
              Unifies repair tickets, leave passes, and notices into one auditable state machine.
            </p>

            <div className="footer-badges">
              <Badge tone="warn">BPUT Hackathon 2026</Badge>
              <Badge tone="open">PS07 · Fretbox</Badge>
            </div>

            <div className="footer-credit-line">
              <span className="tiny muted">Engineered with precision by</span>
              <strong className="small" style={{ color: 'var(--ink)' }}> Crystal Studio Labs</strong>
            </div>
          </div>

          {/* Column 2: Dedicated Stations */}
          <div className="footer-col">
            <div className="footer-col-title mono tiny bold">OPERATIONAL_STATIONS</div>
            <ul className="footer-links list-reset">
              <li>
                <Link to="/login">Student Mobile Station</Link>
              </li>
              <li>
                <Link to="/tasks">Staff &amp; Technician Queue</Link>
              </li>
              <li>
                <Link to="/approvals">Hostel Warden Approvals</Link>
              </li>
              <li>
                <Link to="/operations">Admin Command Centre</Link>
              </li>
              <li>
                <Link to="/gate">Gate Security Desk</Link>
              </li>
              <li>
                <Link to="/kiosk">Corridor Touch Kiosk</Link>
              </li>
              <li>
                <Link to="/login?mode=desk">Walk-in Helpdesk Terminal</Link>
              </li>
            </ul>
          </div>

          {/* Column 3: Architectural Pillars */}
          <div className="footer-col">
            <div className="footer-col-title mono tiny bold">ENGINEERING_PILLARS</div>
            <ul className="footer-links list-reset">
              <li>
                <span className="footer-feature-item">
                  <strong>Universal Case Engine</strong>
                  <span className="tiny muted">Unified state machine for all requests</span>
                </span>
              </li>
              <li>
                <span className="footer-feature-item">
                  <strong>Store-and-Forward Outbox</strong>
                  <span className="tiny muted">IndexedDB cryptographic idempotency</span>
                </span>
              </li>
              <li>
                <span className="footer-feature-item">
                  <strong>Cryptographic QR Security</strong>
                  <span className="tiny muted">Tamper-proof gate passes &amp; PDFs</span>
                </span>
              </li>
              <li>
                <span className="footer-feature-item">
                  <strong>Controlled AI Agents</strong>
                  <span className="tiny muted">Human-in-the-loop autonomous triage</span>
                </span>
              </li>
            </ul>
          </div>

          {/* Column 4: Tech Stack & Governance */}
          <div className="footer-col">
            <div className="footer-col-title mono tiny bold">GOVERNANCE_&amp;_SOURCE</div>
            <ul className="footer-links list-reset">
              <li>
                <span className="tiny muted">Backend: </span>
                <span className="mono small bold">FastAPI · Python 3.12</span>
              </li>
              <li>
                <span className="tiny muted">Frontend: </span>
                <span className="mono small bold">React 18 · TypeScript · Vite</span>
              </li>
              <li>
                <span className="tiny muted">Database: </span>
                <span className="mono small bold">PostgreSQL 16 · SQLAlchemy</span>
              </li>
              <li>
                <span className="tiny muted">Cache Engine: </span>
                <span className="mono small bold">IndexedDB · Service Worker</span>
              </li>
              <li>
                <span className="tiny muted">License: </span>
                <span className="mono small bold">MIT Open Source</span>
              </li>
              <li style={{ marginTop: 8 }}>
                <a
                  className="btn btn-ghost btn-sm"
                  href="https://github.com/Crystal-Studio-Labs/Campus-Relay"
                  target="_blank"
                  rel="noreferrer"
                  style={{ width: '100%', justifyContent: 'center' }}
                >
                  GitHub Repository ↗
                </a>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------ BOTTOM BAR */}
      <div className="footer-bottom">
        <div className="footer-bottom-inner">
          <div className="footer-copyright tiny muted">
            © {new Date().getFullYear()} <strong>Campus Relay</strong> by <strong>Crystal Studio Labs</strong>.
            Developed for <strong>BPUT Hackathon 2026</strong> (PS07 Fretbox).
            <span className="hide-xs"> Configured via <code className="mono">config/institution.json</code>.</span>
          </div>

          <div className="footer-bottom-actions">
            <Link to="/login" className="tiny muted">Sign In</Link>
            <Link to="/kiosk" className="tiny muted">Kiosk</Link>
            <a
              href="https://github.com/Crystal-Studio-Labs/Campus-Relay/blob/main/LICENSE"
              target="_blank"
              rel="noreferrer"
              className="tiny muted"
            >
              MIT License
            </a>
            <button
              type="button"
              onClick={scrollToTop}
              className="btn btn-ghost btn-sm"
              style={{ fontSize: 11, padding: '2px 8px' }}
              title="Scroll to top"
            >
              ↑ Top
            </button>
          </div>
        </div>
      </div>
    </footer>
  )
}
