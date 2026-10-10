/** Put the app on the device.
 *
 *  An installable app should be able to say so itself. This is the one place
 *  that listens for the browser's install event, so the launch screen and the
 *  shell cannot disagree about whether the app is installed.
 *
 *  Three states, and all three are honest:
 *    - already installed (running in a standalone window): say so, or nothing
 *    - the browser offered a prompt (Chromium): ask on the app's own terms
 *    - no prompt (iOS Safari, Firefox, a dismissed prompt): explain the two taps
 *      it takes in that browser's own menu rather than showing a dead button
 *
 *  It never invents a prompt: if the browser has not offered installability,
 *  there is nothing to call, so the person gets instructions instead.
 */

import { useEffect, useState } from 'react'
import { Badge, Button, Modal } from './ui'

/** The install event is not in the DOM typings, so it is declared here. */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const STANDALONE_MODES = ['standalone', 'minimal-ui', 'window-controls-overlay', 'fullscreen']

function installedAlready(): boolean {
  if (typeof window === 'undefined') return true
  if (STANDALONE_MODES.some((mode) => window.matchMedia(`(display-mode: ${mode})`).matches)) return true
  // iOS Safari reports a standalone launch here instead of through display-mode.
  return (window.navigator as Navigator & { standalone?: boolean }).standalone === true
}

function isIos(): boolean {
  if (typeof navigator === 'undefined') return false
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    // iPadOS reports itself as a Mac, so the touch points give it away.
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}

export function InstallApp({
  size,
  block,
  installedLabel,
}: {
  size?: 'sm' | 'lg'
  block?: boolean
  /** What to show once the app is on the device. Omit to render nothing. */
  installedLabel?: string
}) {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(installedAlready)
  const [helpOpen, setHelpOpen] = useState(false)

  useEffect(() => {
    const onPrompt = (event: Event) => {
      // Stop the browser's own mini-infobar; the app asks in its own words, in
      // a place the person is already looking.
      event.preventDefault()
      setPrompt(event as InstallPromptEvent)
    }
    const onInstalled = () => {
      setInstalled(true)
      setPrompt(null)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)

    // If the app is installed while this screen is open, the window it is
    // running in can change display mode without a reload.
    const media = window.matchMedia('(display-mode: standalone)')
    const onChange = () => setInstalled(installedAlready())
    media.addEventListener('change', onChange)

    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
      media.removeEventListener('change', onChange)
    }
  }, [])

  async function requestInstall() {
    if (!prompt) return
    await prompt.prompt()
    const choice = await prompt.userChoice
    if (choice.outcome === 'accepted') setInstalled(true)
    // A dismissal is an answer. The app does not ask again in this session.
    setPrompt(null)
  }

  if (installed) {
    return installedLabel ? <Badge tone="done">{installedLabel}</Badge> : null
  }

  const ios = isIos()

  return (
    <>
      <Button
        variant="default"
        size={size}
        block={block}
        onClick={() => (prompt ? void requestInstall() : setHelpOpen(true))}
      >
        ⤓ Install app
      </Button>
      <Modal open={helpOpen} onClose={() => setHelpOpen(false)} title="Put Campus Relay on this device">
        {ios ? (
          <ol className="launch-steps">
            <li>
              Tap the <strong>Share</strong> button in Safari's toolbar.
            </li>
            <li>
              Scroll the sheet and choose <strong>Add to Home Screen</strong>.
            </li>
            <li>
              Confirm with <strong>Add</strong>. The app then opens from the home screen, without the browser
              frame.
            </li>
          </ol>
        ) : (
          <ol className="launch-steps">
            <li>Open this page in Chrome or Edge.</li>
            <li>
              Open the browser menu (⋮) and choose <strong>Install app</strong>, or use the install icon in the
              address bar.
            </li>
            <li>Confirm. The app then opens in its own window and keeps working offline.</li>
          </ol>
        )}
        <p className="hint">
          Installing does not sign anyone in and does not change what this device can see: it only puts the app
          itself on the home screen or desktop.
        </p>
      </Modal>
    </>
  )
}
