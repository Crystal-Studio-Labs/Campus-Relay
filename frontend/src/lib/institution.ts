/** Institution configuration client.
 *
 *  Campus Relay is a template. The deployment's identity - the name on the
 *  plate, the design language, the words used for campus structure, how long a
 *  lobby kiosk waits - comes from `config/institution.json` on the server and
 *  reaches the interface through this module. Nothing here is per-user.
 *
 *  Two rules this module exists to enforce:
 *
 *  1. **The interface never hardcodes an institution.** A component that needs
 *     the college name reads it from `useInstitution()`, not from a string
 *     literal, so a second college is a config change.
 *  2. **The last known configuration survives going offline.** It is cached in
 *     localStorage by `state/institution.tsx`, and the built-in defaults below
 *     are a mirror of `backend/app/core/institution.py`, so the app renders a
 *     coherent, correctly branded shell even on a first load with no network.
 */

import { api } from './api'

/* ================================ TYPES ================================ */

export interface InstitutionIdentity {
  name: string
  short_name: string
  monogram: string
  code: string
  tagline: string
  kind: string
  city: string
  region: string
  support_email: string
  support_phone: string
  website: string
}

export type ThemeDefault = 'device' | 'light' | 'dark'

export type TextDirection = 'ltr' | 'rtl'

export interface InstitutionAppearance {
  skin: string
  default_theme: ThemeDefault
  allow_user_theme_override: boolean
  /** Institution accent, applied as the primary action colour. Ignored when it
   *  fails contrast rather than shipping an unreadable button. */
  accent: string | null
  /** Crest/logo for the brand plate; empty means the wordmark alone. */
  crest_url: string
  /** Reading direction of the shell. */
  direction: TextDirection
}

export interface VocabularyEntry {
  singular: string
  plural: string
}

export interface InstitutionStations {
  kiosk_idle_seconds: number
  kiosk_default_theme: string
  helpdesk_channel: string
  default_channel: string
}

export type FeatureKey =
  | 'agents'
  | 'kiosk'
  | 'gate'
  | 'notices'
  | 'offline_sync'
  | 'guided_tours'
  | 'device_lab'

export interface InstitutionGuardrails {
  wcag_level: string
  min_body_contrast: number
  min_touch_target_px: number
  status_always_carries_word: boolean
  require_audit_reason: boolean
}

/** Where the running server read its configuration from. Present only on the
 *  administrator's response, because it describes the deployment. */
export interface InstitutionSource {
  file: string
  found: boolean
  loaded_at: string
  warnings: string[]
  env_override: boolean
}

/** One knob the template exposes, as reported by the server. */
export interface EditableKey {
  path: string
  label: string
  group: string
  current: string | number | boolean
}

export interface InstitutionConfig {
  schema_version: number
  identity: InstitutionIdentity
  academics: { term_label: string; timezone: string; week_starts_on: string }
  localisation: { default_language: string; languages: string[] }
  appearance: InstitutionAppearance
  vocabulary: Record<string, VocabularyEntry>
  stations: InstitutionStations
  features: Record<string, boolean>
  guardrails: InstitutionGuardrails
  source?: InstitutionSource
  editable_keys?: EditableKey[]
}

/* ============================== DEFAULTS =============================== */

/** Mirror of the server defaults. Used before the first successful fetch, and
 *  when a fetch fails on a device that has never been online. Keep in step with
 *  `DEFAULT_INSTITUTION` in backend/app/core/institution.py. */
export const DEFAULT_INSTITUTION: InstitutionConfig = {
  schema_version: 1,
  identity: {
    name: 'Campus Relay',
    short_name: 'Campus Relay',
    monogram: 'CR',
    code: 'CR',
    tagline: 'A resilient operating layer for everyday campus operations.',
    kind: 'University',
    city: '',
    region: '',
    support_email: '',
    support_phone: '',
    website: '',
  },
  academics: { term_label: 'Current term', timezone: 'Asia/Kolkata', week_starts_on: 'monday' },
  localisation: { default_language: 'en', languages: ['en', 'hi', 'or'] },
  appearance: {
    skin: 'industrial',
    default_theme: 'light',
    allow_user_theme_override: true,
    accent: null,
    crest_url: '',
    direction: 'ltr',
  },
  vocabulary: {
    campus: { singular: 'Campus', plural: 'Campuses' },
    department: { singular: 'Department', plural: 'Departments' },
    branch: { singular: 'Branch', plural: 'Branches' },
    year: { singular: 'Year', plural: 'Years' },
    batch: { singular: 'Batch', plural: 'Batches' },
    hostel: { singular: 'Hostel', plural: 'Hostels' },
    block: { singular: 'Block', plural: 'Blocks' },
    student: { singular: 'Student', plural: 'Students' },
    staff: { singular: 'Staff member', plural: 'Staff' },
  },
  stations: {
    kiosk_idle_seconds: 90,
    kiosk_default_theme: 'light',
    helpdesk_channel: 'ASSISTED_DESK',
    default_channel: 'PWA',
  },
  features: {
    agents: true,
    kiosk: true,
    gate: true,
    notices: true,
    offline_sync: true,
    guided_tours: true,
    device_lab: true,
  },
  guardrails: {
    wcag_level: 'AA',
    min_body_contrast: 4.5,
    min_touch_target_px: 46,
    status_always_carries_word: true,
    require_audit_reason: true,
  },
}

/* ============================== CACHE ================================== */

const CACHE_KEY = 'campusrelay.institution'

/** A partial configuration is normal: the server fills in every missing key, so
 *  a half-written file still produces a complete object here. */
export function mergeInstitution(partial: Partial<InstitutionConfig> | null | undefined): InstitutionConfig {
  if (!partial) return DEFAULT_INSTITUTION
  return {
    schema_version: partial.schema_version ?? DEFAULT_INSTITUTION.schema_version,
    identity: { ...DEFAULT_INSTITUTION.identity, ...(partial.identity ?? {}) },
    academics: { ...DEFAULT_INSTITUTION.academics, ...(partial.academics ?? {}) },
    localisation: { ...DEFAULT_INSTITUTION.localisation, ...(partial.localisation ?? {}) },
    appearance: { ...DEFAULT_INSTITUTION.appearance, ...(partial.appearance ?? {}) },
    vocabulary: { ...DEFAULT_INSTITUTION.vocabulary, ...(partial.vocabulary ?? {}) },
    stations: { ...DEFAULT_INSTITUTION.stations, ...(partial.stations ?? {}) },
    features: { ...DEFAULT_INSTITUTION.features, ...(partial.features ?? {}) },
    guardrails: { ...DEFAULT_INSTITUTION.guardrails, ...(partial.guardrails ?? {}) },
    source: partial.source,
    editable_keys: partial.editable_keys,
  }
}

export function loadCachedInstitution(): InstitutionConfig | null {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    return mergeInstitution(JSON.parse(raw) as Partial<InstitutionConfig>)
  } catch {
    return null
  }
}

export function saveCachedInstitution(config: InstitutionConfig): void {
  try {
    // `source` and `editable_keys` are administrator-only detail; caching them
    // would mean a stale file path being shown on a device that cannot check it.
    const { source: _source, editable_keys: _keys, ...cacheable } = config
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(cacheable))
  } catch {
    /* private mode: the in-memory value still applies */
  }
}

/* ============================== CLIENT ================================= */

export const institutionApi = {
  /** Public: also what an unsigned kiosk and the sign-in screen read. */
  public: (signal?: AbortSignal) => api.get<InstitutionConfig>('/institution', signal),
  /** Administrator: adds provenance and the edit checklist. */
  full: () => api.get<InstitutionConfig>('/admin/institution'),
  /** Re-read config/institution.json without restarting the API. */
  reload: () =>
    api.post<{
      reloaded: boolean
      changed_sections: string[]
      warnings: string[]
      source: InstitutionSource
    }>('/admin/institution/reload'),
}

/* ============================== HELPERS ================================ */

/** Never render an empty plate: fall back through short name, code and a fixed
 *  string so a misconfigured deployment still has something honest to show. */
export function displayName(config: InstitutionConfig): string {
  const identity = config.identity
  return identity.short_name?.trim() || identity.name?.trim() || identity.code?.trim() || 'Campus Relay'
}

export function monogram(config: InstitutionConfig): string {
  const identity = config.identity
  if (identity.monogram?.trim()) return identity.monogram.trim().slice(0, 4)
  const source = identity.short_name || identity.name || 'CR'
  const initials = source
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0]!.toUpperCase())
    .join('')
  return initials.slice(0, 4) || 'CR'
}

/** The word this institution uses for a piece of campus structure. */
export function vocab(
  config: InstitutionConfig,
  key: string,
  options: { plural?: boolean; fallback?: string } = {},
): string {
  const entry = config.vocabulary[key]
  if (!entry) return options.fallback ?? key
  return (options.plural ? entry.plural : entry.singular) || entry.singular || options.fallback || key
}

export function featureOn(config: InstitutionConfig, key: FeatureKey): boolean {
  return config.features[key] !== false
}

/** Every module the template can switch on or off, with its current state. The
 *  order is deliberate: the ones a college decides about first come first. */
const FEATURE_ORDER: FeatureKey[] = [
  'offline_sync',
  'notices',
  'gate',
  'kiosk',
  'agents',
  'guided_tours',
  'device_lab',
]

export function availableFeatures(config: InstitutionConfig): { id: FeatureKey; enabled: boolean }[] {
  return FEATURE_ORDER.map((id) => ({ id, enabled: featureOn(config, id) }))
}

export function supportLine(config: InstitutionConfig): string {
  return [config.identity.support_email, config.identity.support_phone].filter(Boolean).join(' · ')
}
