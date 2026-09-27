/** Onboarding wizard — describe your college without touching a file.
 *
 *  A college adopting Campus Relay should not have to find
 *  `config/institution.json` on a server. This panel writes the same file
 *  through the API: name, monogram, city, crest and colours, applied to the
 *  running deployment the moment Save is pressed. It is the "within an hour"
 *  step of onboarding.
 *
 *  Only whitelisted fields are accepted server-side, so a typo here cannot
 *  corrupt the template.
 */

import { useState } from 'react'
import { ApiError, api } from '../lib/api'
import { useInstitution } from '../state/institution'
import { useSession } from '../state/session'
import { SKINS } from '../theme/registry'
import { Badge, Button, Card, Field, Select, SectionTitle, TextInput } from './ui'

interface IdentityForm {
  name: string
  short_name: string
  monogram: string
  code: string
  kind: string
  city: string
  region: string
  support_email: string
  support_phone: string
  tagline: string
}

interface AppearanceForm {
  skin: string
  default_theme: string
  accent: string
  crest_url: string
  direction: string
}

function fromConfig(identity: Record<string, string>, appearance: Record<string, unknown>) {
  return {
    identity: {
      name: identity.name ?? '',
      short_name: identity.short_name ?? '',
      monogram: identity.monogram ?? '',
      code: identity.code ?? '',
      kind: identity.kind ?? '',
      city: identity.city ?? '',
      region: identity.region ?? '',
      support_email: identity.support_email ?? '',
      support_phone: identity.support_phone ?? '',
      tagline: identity.tagline ?? '',
    } as IdentityForm,
    appearance: {
      skin: String(appearance.skin ?? 'modern'),
      default_theme: String(appearance.default_theme ?? 'device'),
      accent: String(appearance.accent ?? ''),
      crest_url: String(appearance.crest_url ?? ''),
      direction: String(appearance.direction ?? 'ltr'),
    } as AppearanceForm,
  }
}

export function OnboardingWizard() {
  const institution = useInstitution()
  const { can } = useSession()
  const seed = fromConfig(institution.config.identity as unknown as Record<string, string>, institution.config.appearance as unknown as Record<string, unknown>)
  const [identity, setIdentity] = useState<IdentityForm>(seed.identity)
  const [appearance, setAppearance] = useState<AppearanceForm>(seed.appearance)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (!can('config:manage')) return null

  const setI = (key: keyof IdentityForm, value: string) => setIdentity((prev) => ({ ...prev, [key]: value }))
  const setA = (key: keyof AppearanceForm, value: string) => setAppearance((prev) => ({ ...prev, [key]: value }))

  const save = async () => {
    setBusy(true)
    setMessage(null)
    setError(null)
    try {
      const result = await api.post<{ sections: string[]; warnings: string[] }>('/admin/institution/identity', {
        identity,
        appearance: {
          ...appearance,
          accent: appearance.accent.trim() || null,
        },
      })
      await institution.reload()
      setMessage(
        `Saved ${result.sections.join(', ')} to the institution file and reloaded the running deployment.` +
          (result.warnings.length ? ` ${result.warnings.length} warning(s); see Setup.` : ''),
      )
    } catch (problem) {
      setError(problem instanceof ApiError ? problem.message : 'The configuration could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <SectionTitle right={<Badge tone="ghost">step 1 · describe your college</Badge>}>
        Onboarding — your college
      </SectionTitle>
      <p className="small muted" style={{ marginTop: 0 }}>
        Fill this in and press Save: the running deployment picks up your name, monogram, crest and colours
        immediately — no rebuild, no restart, no file to find.
      </p>

      {message ? (
        <div className="banner banner-info" role="status">
          {message}
        </div>
      ) : null}
      {error ? (
        <div className="banner banner-error" role="alert">
          {error}
        </div>
      ) : null}

      <div className="grid-2">
        <div>
          <div className="section-title">Identity</div>
          <Field label="Institution name" htmlFor="wiz-name">
            <TextInput id="wiz-name" value={identity.name} onChange={(v) => setI('name', v)} />
          </Field>
          <Field label="Short name" hint="Shown in the navigation and headers." htmlFor="wiz-short">
            <TextInput id="wiz-short" value={identity.short_name} onChange={(v) => setI('short_name', v)} />
          </Field>
          <Field label="Monogram" hint="Up to four characters, used on the brand plate." htmlFor="wiz-mono">
            <TextInput id="wiz-mono" value={identity.monogram} onChange={(v) => setI('monogram', v)} maxLength={4} />
          </Field>
          <Field label="Institution kind" htmlFor="wiz-kind">
            <TextInput id="wiz-kind" value={identity.kind} onChange={(v) => setI('kind', v)} />
          </Field>
          <Field label="Tagline" htmlFor="wiz-tagline">
            <TextInput id="wiz-tagline" value={identity.tagline} onChange={(v) => setI('tagline', v)} />
          </Field>
          <div className="row" style={{ gap: 'var(--sp-3)', flexWrap: 'wrap' }}>
            <div className="grow">
              <Field label="City" htmlFor="wiz-city">
                <TextInput id="wiz-city" value={identity.city} onChange={(v) => setI('city', v)} />
              </Field>
            </div>
            <div className="grow">
              <Field label="Region / state" htmlFor="wiz-region">
                <TextInput id="wiz-region" value={identity.region} onChange={(v) => setI('region', v)} />
              </Field>
            </div>
          </div>
          <div className="row" style={{ gap: 'var(--sp-3)', flexWrap: 'wrap' }}>
            <div className="grow">
              <Field label="Support email" htmlFor="wiz-email">
                <TextInput id="wiz-email" value={identity.support_email} onChange={(v) => setI('support_email', v)} type="email" inputMode="email" />
              </Field>
            </div>
            <div className="grow">
              <Field label="Support phone" htmlFor="wiz-phone">
                <TextInput id="wiz-phone" value={identity.support_phone} onChange={(v) => setI('support_phone', v)} inputMode="tel" />
              </Field>
            </div>
          </div>
        </div>

        <div>
          <div className="section-title">Branding &amp; appearance</div>
          <Field label="Design language" hint="A skin is a token set, not a fork." htmlFor="wiz-skin">
            <Select
              id="wiz-skin"
              value={appearance.skin}
              onChange={(v) => setA('skin', v)}
              options={SKINS.filter((s) => s.status === 'shipped').map((s) => ({ value: s.id, label: s.name }))}
            />
          </Field>
          <Field label="Default theme" hint="People can still switch unless you lock it." htmlFor="wiz-theme">
            <Select
              id="wiz-theme"
              value={appearance.default_theme}
              onChange={(v) => setA('default_theme', v)}
              options={[
                { value: 'device', label: 'Follow the device' },
                { value: 'light', label: 'Light' },
                { value: 'dark', label: 'Dark' },
              ]}
            />
          </Field>
          <Field
            label="Accent colour"
            hint="Hex, e.g. #0b5cad. Ignored automatically if it fails button contrast."
            htmlFor="wiz-accent"
          >
            <TextInput id="wiz-accent" value={appearance.accent} onChange={(v) => setA('accent', v)} placeholder="#0b5cad" />
          </Field>
          <Field label="Crest / logo URL" hint="Empty shows the monogram wordmark alone." htmlFor="wiz-crest">
            <TextInput id="wiz-crest" value={appearance.crest_url} onChange={(v) => setA('crest_url', v)} placeholder="/icons/crest.svg" />
          </Field>
          <Field label="Reading direction" htmlFor="wiz-direction">
            <Select
              id="wiz-direction"
              value={appearance.direction}
              onChange={(v) => setA('direction', v)}
              options={[
                { value: 'ltr', label: 'Left to right' },
                { value: 'rtl', label: 'Right to left (RTL)' },
              ]}
            />
          </Field>

          <div className="card-sunken" style={{ marginTop: 'var(--sp-3)' }}>
            <div className="tiny muted" style={{ marginBottom: 6 }}>
              Preview
            </div>
            <div className="row" style={{ gap: 'var(--sp-2)' }}>
              {appearance.crest_url ? (
                <img src={appearance.crest_url} alt="" aria-hidden="true" style={{ width: 24, height: 24, objectFit: 'contain' }} />
              ) : (
                <span className="brand-mark" aria-hidden="true" />
              )}
              <strong>{(identity.monogram || identity.code || 'CR').slice(0, 4)} · {identity.short_name || identity.name || 'Campus Relay'}</strong>
            </div>
          </div>
        </div>
      </div>

      <div className="row wrap" style={{ marginTop: 'var(--sp-4)' }}>
        <Button variant="primary" onClick={save} busy={busy}>
          Save and apply
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            const fresh = fromConfig(
              institution.config.identity as unknown as Record<string, string>,
              institution.config.appearance as unknown as Record<string, unknown>,
            )
            setIdentity(fresh.identity)
            setAppearance(fresh.appearance)
          }}
        >
          Reset fields
        </Button>
      </div>
    </Card>
  )
}
