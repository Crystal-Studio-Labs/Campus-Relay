/** Institution configuration state.
 *
 *  The last known configuration is applied synchronously from cache on the very
 *  first render, then refreshed from the server in the background. That order
 *  is deliberate: the name on the plate and the design language must not flicker
 *  from the built-in default to the real institution a moment after the page
 *  appears, and a device that has gone offline must still render the right
 *  college rather than a generic one.
 *
 *  The provider is the outermost wrapper in main.tsx because the theme layer
 *  reads the institution's default skin and theme from it.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  DEFAULT_INSTITUTION,
  displayName,
  institutionApi,
  loadCachedInstitution,
  mergeInstitution,
  monogram,
  saveCachedInstitution,
  supportLine,
  vocab,
  type InstitutionConfig,
} from '../lib/institution'

/** Where the value currently on screen came from. Shown on the setup screen so
 *  an administrator can tell a real configuration from a fallback. */
export type Provenance = 'default' | 'cache' | 'server'

interface InstitutionValue {
  config: InstitutionConfig
  provenance: Provenance
  /** True until the first fetch settles; the setup screen uses it to decide
   *  between "checking" and a hard answer. */
  loading: boolean
  /** Fetch the whole configuration, including provenance and the edit
   *  checklist. Administrator screens call this. */
  loadFull: () => Promise<InstitutionConfig>
  /** Re-read the file on the server, then re-fetch. */
  reload: () => Promise<{ changed_sections: string[]; warnings: string[] }>
  /** The institution's own short name, resolved once with a safe fallback. */
  shortName: string
  monogram: string
  supportLine: string
  /** Word for a piece of campus structure, in this institution's vocabulary. */
  word: (key: string, options?: { plural?: boolean; fallback?: string }) => string
}

const InstitutionContext = createContext<InstitutionValue | null>(null)

export function InstitutionProvider({ children }: { children: ReactNode }) {
  const cached = useMemo(() => loadCachedInstitution(), [])
  const [config, setConfig] = useState<InstitutionConfig>(cached ?? DEFAULT_INSTITUTION)
  const [provenance, setProvenance] = useState<Provenance>(cached ? 'cache' : 'default')
  const [loading, setLoading] = useState(true)

  const loadFull = useCallback(async () => {
    const full = mergeInstitution(await institutionApi.full())
    setConfig(full)
    setProvenance('server')
    return full
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    institutionApi
      .public()
      .then((payload) => {
        if (cancelled) return
        const next = mergeInstitution(payload)
        setConfig(next)
        setProvenance('server')
        saveCachedInstitution(next)
      })
      .catch(() => {
        // Offline, or the API is not up yet. The cached or default value stays
        // on screen and the setup screen will say which one it is showing.
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // A skin the browser stored before the institution changed it would otherwise
  // win over the configured one for the rest of the device's life.
  useEffect(() => {
    const root = document.documentElement
    if (!root.dataset.skin) root.dataset.skin = config.appearance.skin
  }, [config.appearance.skin])

  const reload = useCallback(async () => {
    const result = await institutionApi.reload()
    await loadFull()
    // The reload may have changed the file's branding, so the cache is refreshed
    // too; otherwise the next offline load would show the previous college.
    const fresh = mergeInstitution(await institutionApi.public())
    setConfig(fresh)
    saveCachedInstitution(fresh)
    return { changed_sections: result.changed_sections, warnings: result.warnings }
  }, [loadFull])

  const value = useMemo<InstitutionValue>(
    () => ({
      config,
      provenance,
      loading,
      loadFull,
      reload,
      shortName: displayName(config),
      monogram: monogram(config),
      supportLine: supportLine(config),
      word: (key, options) => vocab(config, key, options),
    }),
    [config, provenance, loading, loadFull, reload],
  )

  return <InstitutionContext.Provider value={value}>{children}</InstitutionContext.Provider>
}

export function useInstitution(): InstitutionValue {
  const value = useContext(InstitutionContext)
  if (!value) throw new Error('useInstitution must be used inside InstitutionProvider')
  return value
}
