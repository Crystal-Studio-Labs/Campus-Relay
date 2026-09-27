/** Theme and skin registry.
 *
 *  The product has two independent visual axes, and keeping them apart is what
 *  makes it adoptable by a second college without forking it:
 *
 *    THEME  how much light comes off the screen. A comfort choice made by the
 *           person using the screen. Exactly two: light and dark. Stored per
 *           device under `campusrelay.theme`, applied as `data-theme` on <html>.
 *
 *    SKIN   what the interface looks like: shape, weight, density, whether
 *           structure is visible. An institutional identity choice, made once
 *           per deployment in the institution config and applied as `data-skin`
 *           on <html>. Bright institutional is the shipped skin.
 *
 *  A skin is a token set, never a fork. Nothing in the app branches on the skin
 *  name; the skin only changes values in `src/styles/tokens.css`. That means a
 *  college can be given a new look without touching a single component, and a
 *  new look still inherits every accessibility guarantee, because the palettes
 *  and the contrast standard stay in the theme layer.
 */

/* ============================== THEME AXIS ============================== */

export type ThemeId = 'light' | 'dark'

export interface ThemeOption {
  id: ThemeId
  /** Symbol control: readable at a glance, no translation needed. */
  symbol: string
  label: string
  hint: string
  /** Mirrors `--paper` in tokens.css, for the browser chrome colour. */
  themeColor: string
}

export const THEME_OPTIONS: ThemeOption[] = [
  {
    id: 'light',
    symbol: '☀',
    label: 'Light',
    hint: 'Light theme — dark ink on a soft blue-grey page',
    themeColor: '#f4f6fb',
  },
  {
    id: 'dark',
    symbol: '☾',
    label: 'Dark',
    hint: 'Dark theme — light ink on a deep navy page',
    themeColor: '#0b1220',
  },
]

export const DEFAULT_THEME: ThemeId = 'light'

export function isThemeId(value: unknown): value is ThemeId {
  return value === 'light' || value === 'dark'
}

export function themeMeta(id: ThemeId): ThemeOption {
  return THEME_OPTIONS.find((option) => option.id === id) ?? THEME_OPTIONS[0]
}

/* =============================== SKIN AXIS ============================== */

/** `shipped` skins are in tokens.css and selectable. `planned` skins are on the
 *  roadmap: they are listed here, described, and shown in the setup screen, but
 *  deliberately not selectable, because offering a switch that does nothing is
 *  worse than offering none. */
export type SkinStatus = 'shipped' | 'planned'

export interface SkinDefinition {
  id: string
  name: string
  status: SkinStatus
  /** One line, for the setup screen's select. */
  summary: string
  /** What actually changes, in the language an administrator can check. */
  characteristics: string[]
  /** Who asks for it. Kept in the product because it is the reason the skin
   *  registry exists at all. */
  requestedBy?: string
}

export const SKINS: SkinDefinition[] = [
  {
    id: 'industrial',
    name: 'Industrial Brutalism (Blueprint)',
    status: 'shipped',
    summary: 'Squared plates, engineering-paper grid, hazard markings, tactile offset, stencilled labels.',
    characteristics: [
      'Squared corners (2px) and 2-3px hard rules with zero soft pill curves',
      'Tactile drop shadows and physical plate offset lift',
      'A faint engineering-paper grid behind the page and a rule under every panel head',
      'Hazard marking reserved for brand plate, live and urgent states',
      'Uppercase stencilled labels for fields, tables and section titles',
      'Identifiers (case numbers, asset codes) set in a tabular monospace face',
    ],
    requestedBy: 'Campus Relay primary design language — authentic industrial brutalism for high-reliability campus operations.',
  },
  {
    id: 'modern',
    name: 'Modern institutional',
    status: 'shipped',
    summary: 'High-contrast institutional interface with sentence-case labels.',
    characteristics: [
      'Squared surfaces with clean institutional structure',
      'A calm blue for action, green for done, amber for attention',
      'Sentence-case labels and larger headings for easy scanning',
      'Generous spacing and a comfortable reading measure',
      'Reads as trustworthy to a registrar and familiar to a student',
    ],
    requestedBy: 'Institutional administrative desks and standard reporting views.',
  },
  {
    id: 'govt-portal',
    name: 'Government portal',
    status: 'shipped',
    summary: 'Flat, dense, print-first, blue and white, no decorative marking.',
    characteristics: [
      'No plate edges or hazard marking; borders reduce to 1px hairlines',
      'Sentence-case labels at a smaller size, so a dense register fits one screen',
      'A single authority colour (deep navy) with no accent blocking',
      'Structure carried by rules and headings only, in the pattern a citizen portal is expected to follow',
      'Print output treated as a primary target, not a secondary one',
    ],
    requestedBy: 'Colleges preparing documents that have to be filed with a state or central portal.',
  },
  {
    id: 'university-portal',
    name: 'University portal',
    status: 'shipped',
    summary: 'Institutional serif headings, generous whitespace, crest-driven branding.',
    characteristics: [
      'Serif display face for headings, sans body, rebuilt around an institution crest',
      'Soft radius restored and drop shadows returned for card depth',
      'A calm neutral palette where a single institutional colour carries branding',
      'Longer line lengths for prospectus-style prose and notice reading',
      'A layout that maps onto existing university templates so it reads as familiar',
    ],
    requestedBy: 'Institutions that must visibly match an existing website identity.',
  },
]

export const DEFAULT_SKIN = 'industrial'

export function isKnownSkin(id: unknown): boolean {
  return SKINS.some((skin) => skin.id === id)
}

/** Falls back to the shipped skin rather than leaving the page unstyled. */
export function resolveSkin(id: string | null | undefined): string {
  return id && isKnownSkin(id) ? id : DEFAULT_SKIN
}

export function shippedSkins(): SkinDefinition[] {
  return SKINS.filter((skin) => skin.status === 'shipped')
}

export function skinMeta(id: string): SkinDefinition | undefined {
  return SKINS.find((skin) => skin.id === id)
}

/* ============================ TEXT SIZE AXIS =========================== */

export type TextId = 'normal' | 'large'

export const TEXT_KEY = 'campusrelay.text'
export const THEME_KEY = 'campusrelay.theme'
export const SKIN_KEY = 'campusrelay.skin'

/* ======================= ROADMAP: THEMES AND SKINS ===================== */

/** The future work an adopting institution is most likely to ask for, kept in
 *  the product so it is visible to whoever is evaluating it rather than buried
 *  in a commit message.
 *
 *  Every item below is additive by construction: a new skin is a token block, a
 *  new theme is a palette block, and neither requires changing a component. The
 *  full walkthrough is in docs/THEMES.md. */
export interface RoadmapItem {
  title: string
  detail: string
  /** What it costs the person adopting it. */
  effort: 'config only' | 'one token block' | 'new skin' | 'product change'
}

export const DESIGN_ROADMAP: { group: string; items: RoadmapItem[] }[] = [
  {
    group: 'Themes and accessibility variants',
    items: [
      {
        title: 'Time-of-day automatic theme',
        detail:
          'Follow the institution’s operating hours instead of the device setting: light through the working day, dark after the night-duty shift change. Needs the shift table, not a design decision.',
        effort: 'product change',
      },
      {
        title: 'Per-station default theme',
        detail:
          'A lobby kiosk stays light for daylight legibility while a security post defaults to dark. Belongs in the institution config’s station block, next to the kiosk idle timeout.',
        effort: 'config only',
      },
    ],
  },
  {
    group: 'Design language extensions',
    items: [
  {
    title: 'Additional institution skins',
    detail:
      'More registered design languages beyond the four shipped (modern institutional, engineering blueprint, government portal, university portal). A skin is a token block, so this needs no component work — only a review against the contrast standard.',
    effort: 'new skin',
  },
      {
        title: 'Portable design pack (import / export)',
        detail:
          'Export a deployment’s skin, accent, crest and density as one file so a sister college can adopt an identical look without editing config by hand.',
        effort: 'product change',
      },
    ],
  },
]

/** Design-language capabilities that shipped in this build. Kept next to the
 *  roadmap so the surfaces that render both can show the shipped/planned split
 *  honestly instead of listing finished work as future work. */
export const SHIPPED_DESIGN: { title: string; detail: string }[] = [
  {
    title: 'Brand accent from the institution config',
    detail:
      'One institution colour becomes `--signal` for every skin, applied by the theme provider only after a WCAG contrast check, so an unreadable accent is ignored rather than shipped.',
  },
  {
    title: 'Crest and logo slot',
    detail:
      'The shell renders an institution crest beside the wordmark, with a monochrome treatment in the dark theme.',
  },
  {
    title: 'Right-to-left layout',
    detail:
      'Reading direction is an institution choice: the shell and every layout primitive use logical properties, so an RTL script mirrors without a fork.',
  },
  {
    title: 'Density and high-contrast variants',
    detail:
      'Per-device compact density for queue and table screens, and a high-contrast structural variant that keeps every palette intact.',
  },
]

/** Flat count, used on the setup screen so the roadmap reads as a number
 *  rather than a wall of prose. */
export function roadmapCount(): { total: number; shipped: number } {
  const total = DESIGN_ROADMAP.reduce((sum, group) => sum + group.items.length, 0)
  return { total, shipped: shippedSkins().length }
}
