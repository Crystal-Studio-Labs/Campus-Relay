/** Clean, Beautiful Industrial Brutalist Footer — Campus Relay
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
  }

  return (
    <footer className="simple-footer no-print">
      <div className="simple-footer-inner">
        {/* Top Section: Identity, Mission & Badges */}
        <div className="simple-footer-top">
          <div className="simple-footer-brand">
            <Link to="/" className="sidebar-brand" style={{ marginBottom: 0 }}>
              <span className="brand-mark" aria-hidden="true" data-monogram={institution.monogram} />
              <span className="brand-name">{institution.shortName}</span>
            </Link>
            <p className="simple-footer-tagline">
              A high-resilience, offline-first operating layer for university and hostel management.
            </p>
          </div>

          <div className="simple-footer-badges">
            <Badge tone="warn">BPUT Hackathon 2026</Badge>
            <Badge tone="open">PS07 · Fretbox</Badge>
            <span className="footer-status-pill">
              <span className="footer-pulse" />
              <span className="mono tiny bold">SYS.ONLINE</span>
            </span>
          </div>
        </div>

        {/* Technical Rule */}
        <hr className="simple-footer-rule" />

        {/* Middle Section: Clean, uncluttered navigation links */}
        <div className="simple-footer-nav">
          <div className="simple-footer-links">
            <span className="mono tiny bold muted" style={{ letterSpacing: '0.06em' }}>STATIONS:</span>
            <Link to="/login">Student App</Link>
            <span className="footer-dot" aria-hidden="true">·</span>
            <Link to="/operations">Admin Centre</Link>
            <span className="footer-dot" aria-hidden="true">·</span>
            <Link to="/tasks">Staff Queue</Link>
            <span className="footer-dot" aria-hidden="true">·</span>
            <Link to="/approvals">Warden Desk</Link>
            <span className="footer-dot" aria-hidden="true">·</span>
            <Link to="/gate">Gate Security</Link>
            <span className="footer-dot" aria-hidden="true">·</span>
            <Link to="/kiosk">Corridor Kiosk</Link>
          </div>

          <div className="simple-footer-links">
            <span className="mono tiny bold muted" style={{ letterSpacing: '0.06em' }}>RESOURCES:</span>
            <a href="#architecture">Architecture</a>
            <span className="footer-dot" aria-hidden="true">·</span>
            <a href="https://github.com/Crystal-Studio-Labs/Campus-Relay" target="_blank" rel="noreferrer">
              GitHub ↗
            </a>
            <span className="footer-dot" aria-hidden="true">·</span>
            <a href="https://github.com/Crystal-Studio-Labs/Campus-Relay/blob/main/LICENSE" target="_blank" rel="noreferrer">
              MIT License
            </a>
          </div>
        </div>

        {/* Technical Rule */}
        <hr className="simple-footer-rule" />

        {/* Bottom Section: Credits, Theme Switcher & Back to Top */}
        <div className="simple-footer-bottom">
          <div className="simple-footer-credits tiny muted">
            © {new Date().getFullYear()} Campus Relay · Engineered with precision by{' '}
            <strong style={{ color: 'var(--ink)' }}>Crystal Studio Labs</strong> for BPUT Hackathon 2026.
          </div>

          <div className="simple-footer-controls">
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

            <button
              type="button"
              onClick={scrollToTop}
              className="btn btn-ghost btn-sm"
              title="Scroll to top"
              style={{ fontSize: 11, padding: '4px 10px' }}
            >
              ↑ Top
            </button>
          </div>
        </div>
      </div>
    </footer>
  )
}
