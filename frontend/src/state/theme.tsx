/** Theme, skin and text-size state.
 *
 *  Three things a person can change about how the product looks, and the
 *  difference between them matters:
 *
 *    theme  light or dark - a comfort choice, remembered per device;
 *    skin   the institutional design language - set by config, but an
 *           administrator can preview another one on their own device;
 *    text   normal or large - an accessibility choice.
 *
 *  All three are applied as attributes on <html> so that portalled overlays and
 *  native form controls follow, and so the pre-paint script in index.html can
 *  set them before the first frame. The defaults come from the institution
 *  config (see docs/CONFIGURATION.md), which is why a second college can ship a
 *  different look without this file being edited.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  DEFAULT_SKIN,
  DEFAULT_THEME,
  SKIN_KEY,
  TEXT_KEY,
  THEME_KEY,
  THEME_OPTIONS,
  isThemeId,
  resolveSkin,
  themeMeta,
  type TextId,
  type ThemeId,
} from '../theme/registry'
import { useInstitution } from './institution'

export type ThemeChoice = ThemeId
export type TextChoice = TextId
export type DensityChoice = 'comfortable' | 'compact'
export type ContrastChoice = 'normal' | 'high'
export { THEME_OPTIONS }

const DENSITY_KEY = 'campusrelay.density'
const CONTRAST_KEY = 'campusrelay.contrast'

/** Relative luminance of a #rrggbb colour (WCAG definition). */
function luminance(hex: string): number | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!match) return null
  const value = match[1]
  const channel = (index: number) => {
    const c = parseInt(value.slice(index, index + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4)
}

function darken(hex: string, amount = 0.28): string {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!match) return hex
  const value = match[1]
  const parts = [0, 2, 4].map((i) => Math.max(0, Math.round(parseInt(value.slice(i, i + 2), 16) * (1 - amount))))
  return `#${parts.map((p) => p.toString(16).padStart(2, '0')).join('')}`
}

/** An accent is only applied when it can carry near-black button copy; an
 *  arbitrary colour that fails contrast is ignored rather than shipped. */
function safeAccent(accent: string | null | undefined): string | null {
  if (!accent) return null
  const l = luminance(accent)
  if (l === null) return null
  return l >= 0.28 && l <= 0.92 ? accent : null
}

interface ThemeValue {
  theme: ThemeChoice
  text: TextChoice
  density: DensityChoice
  contrast: ContrastChoice
  skin: string
  /** False when the institution has locked the appearance; the switch is then
   *  shown disabled with the reason rather than hidden. */
  canChooseTheme: boolean
  setTheme: (theme: ThemeChoice) => void
  setText: (text: TextChoice) => void
  setDensity: (density: DensityChoice) => void
  setContrast: (contrast: ContrastChoice) => void
  setSkin: (skin: string) => void
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeValue | null>(null)

function readStored<T extends string>(key: string, allowed: readonly T[]): T | null {
  try {
    const stored = window.localStorage.getItem(key)
    return (allowed as readonly string[]).includes(stored ?? '') ? (stored as T) : null
  } catch {
    return null
  }
}

function store(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    /* Private mode. The in-memory value still applies for this session, which
       is the honest behaviour: nothing here is a server-side preference. */
  }
}

/** First visit: the institution may pin a theme, otherwise follow the device,
 *  and only then fall back to the shipped default. */
function initialTheme(institutionDefault: string | undefined): ThemeChoice {
  const stored = readStored<ThemeChoice>(THEME_KEY, ['light', 'dark'])
  if (stored) return stored
  if (isThemeId(institutionDefault)) return institutionDefault
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  } catch {
    return DEFAULT_THEME
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const institution = useInstitution()
  const appearance = institution.config.appearance
  // The institution's default only decides the *first* visit; after that the
  // person's own choice wins, because they are the one looking at the screen.
  const [theme, setThemeState] = useState<ThemeChoice>(() =>
    initialTheme(appearance.default_theme === 'device' ? undefined : appearance.default_theme),
  )
  const [text, setTextState] = useState<TextChoice>(
    () => readStored<TextChoice>(TEXT_KEY, ['normal', 'large']) ?? 'normal',
  )
  const [skin, setSkinState] = useState<string>(() =>
    resolveSkin(readStored<string>(SKIN_KEY, [appearance.skin, DEFAULT_SKIN]) ?? appearance.skin),
  )
  const [density, setDensityState] = useState<DensityChoice>(
    () => readStored<DensityChoice>(DENSITY_KEY, ['comfortable', 'compact']) ?? 'comfortable',
  )
  const [contrast, setContrastState] = useState<ContrastChoice>(
    () => readStored<ContrastChoice>(CONTRAST_KEY, ['normal', 'high']) ?? 'normal',
  )

  useEffect(() => {
    const root = document.documentElement
    root.setAttribute('data-theme', theme)
    root.setAttribute('data-skin', skin)
    root.dataset.text = text
    root.dataset.density = density
    // 'high' is the explicit choice; the OS preference is handled in CSS.
    if (contrast === 'high') root.setAttribute('data-contrast', 'high')
    else root.removeAttribute('data-contrast')
    // Tells the browser which way round the native controls are drawn.
    root.style.colorScheme = theme

    // Reading direction is an institution choice (a right-to-left script).
    const direction = appearance.direction === 'rtl' ? 'rtl' : 'ltr'
    root.setAttribute('dir', direction)

    // Institution accent, applied only if it can carry near-black button copy.
    const accent = safeAccent(appearance.accent)
    if (accent) {
      root.style.setProperty('--signal', accent)
      root.style.setProperty('--signal-dark', darken(accent))
    } else {
      root.style.removeProperty('--signal')
      root.style.removeProperty('--signal-dark')
    }

    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.setAttribute('content', themeMeta(theme).themeColor)
  }, [theme, skin, text, density, contrast, appearance.accent, appearance.direction])

  const setTheme = useCallback((next: ThemeChoice) => {
    setThemeState(next)
    store(THEME_KEY, next)
  }, [])

  const setText = useCallback((next: TextChoice) => {
    setTextState(next)
    store(TEXT_KEY, next)
  }, [])

  const setDensity = useCallback((next: DensityChoice) => {
    setDensityState(next)
    store(DENSITY_KEY, next)
  }, [])

  const setContrast = useCallback((next: ContrastChoice) => {
    setContrastState(next)
    store(CONTRAST_KEY, next)
  }, [])

  const setSkin = useCallback((next: string) => {
    setSkinState(resolveSkin(next))
    store(SKIN_KEY, resolveSkin(next))
  }, [])

  const value = useMemo<ThemeValue>(
    () => ({
      theme,
      text,
      density,
      contrast,
      skin,
      canChooseTheme: appearance.allow_user_theme_override,
      setTheme,
      setText,
      setDensity,
      setContrast,
      setSkin,
      toggleTheme: () => setTheme(theme === 'dark' ? 'light' : 'dark'),
    }),
    [theme, text, density, contrast, skin, appearance.allow_user_theme_override, setTheme, setText, setDensity, setContrast, setSkin],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeValue {
  const value = useContext(ThemeContext)
  if (!value) throw new Error('useTheme must be used inside ThemeProvider')
  return value
}
