/** Entry point.
 *
 *  Order matters here. The session and the sync engine are started before the
 *  first render so the app can be opened with no network and still show the last
 *  known state rather than an error page.
 */

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import { App } from './App'
import { SessionProvider } from './state/session'
import { ThemeProvider } from './state/theme'
import { InstitutionProvider } from './state/institution'
import { GuideProvider } from './state/guide'
import { GuideOverlay } from './components/Guide'
import { syncEngine } from './lib/sync'
import { setLanguage, currentLanguage } from './lib/i18n'
// One import for the whole design language; the manifest inside lists the four
// layers in cascade order. Nothing else in the app imports CSS.
import './styles/index.css'

setLanguage(currentLanguage())
document.documentElement.lang = currentLanguage()

// The service worker precaches the shell, so a reload in a dead zone still opens.
registerSW({ immediate: true })

// Start probing connectivity and flushing the outbox immediately, not after the
// first screen mounts: a queued complaint should be on its way while the person
// is still looking at the app.
void syncEngine.init().catch(() => undefined)

const container = document.getElementById('root')
if (!container) throw new Error('Root container missing')

createRoot(container).render(
  <StrictMode>
    <BrowserRouter>
      {/* Institution wraps everything: the deployment's identity, language set
          and default design skin come from the institution config, not from
          code. See docs/CONFIGURATION.md. */}
      <InstitutionProvider>
        <ThemeProvider>
          <SessionProvider>
            <GuideProvider>
              <App />
              {/* Rendered once, outside the shell, so it can spotlight the shell too. */}
              <GuideOverlay />
            </GuideProvider>
          </SessionProvider>
        </ThemeProvider>
      </InstitutionProvider>
    </BrowserRouter>
  </StrictMode>,
)
