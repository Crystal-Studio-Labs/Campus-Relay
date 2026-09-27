/** Institution setup - the screen that makes the template legible.
 *
 *  Every school that adopts Campus Relay asks the same two questions: "what can
 *  I change?" and "what did you build that I have to live with?". This screen
 *  answers both from the running server rather than from a document: the values
 *  below are the values the API is actually serving, along with the file they
 *  came from and any warnings the loader raised.
 *
 *  It is also where the design-language roadmap lives, because the most common
 *  follow-up request is not a bug: it is "our college wants it to look like our
 *  website / like the government portal". That request has an answer, and the
 *  answer is on this page.
 */

import { useCallback, useEffect, useState } from 'react'
import {
  availableFeatures,
  type EditableKey,
  type InstitutionConfig,
} from '../../lib/institution'
import { useInstitution } from '../../state/institution'
import { useTheme } from '../../state/theme'
import { DESIGN_ROADMAP, SKINS, roadmapCount, shippedSkins } from '../../theme/registry'
import { DataTransferPanel } from '../../components/DataTransfer'
import { OnboardingWizard } from '../../components/OnboardingWizard'
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  KV,
  LoadingState,
  Metric,
  PageHeader,
  Panel,
} from '../../components/ui'

export function InstitutionSetup() {
  const institution = useInstitution()
  const [full, setFull] = useState<InstitutionConfig | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [reloaded, setReloaded] = useState<{ changed_sections: string[]; warnings: string[] } | null>(null)

  const loadFull = useCallback(async () => {
    setError(null)
    try {
      setFull(await institution.loadFull())
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'The configuration could not be read.')
    }
  }, [institution])

  useEffect(() => {
    void loadFull()
  }, [loadFull])

  const onReload = async () => {
    setBusy(true)
    setError(null)
    try {
      setReloaded(await institution.reload())
      await loadFull()
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'The configuration could not be reloaded.')
    } finally {
      setBusy(false)
    }
  }

  const config = full ?? institution.config
  const source = full?.source

  return (
    <div className="stack-lg">
      <PageHeader
        kicker="Administrator · deployment"
        title="Institution setup"
        subtitle="Everything that differs between one college and the next lives in one file. This screen shows what the running server is serving right now, where it read it from, and what the template can do next."
        actions={
          <>
            <Badge tone={institution.provenance === 'server' ? 'done' : 'warn'}>
              On screen: {institution.provenance}
            </Badge>
            <Button variant="primary" onClick={onReload} busy={busy}>
              Reload from disk
            </Button>
          </>
        }
      />

      {error ? <ErrorState message={error} onRetry={loadFull} /> : null}

      {reloaded ? (
        <div className="banner banner-info" role="status">
          Configuration reloaded.
          {reloaded.changed_sections.length
            ? ` Changed: ${reloaded.changed_sections.join(', ')}.`
            : ' No values changed.'}
          {reloaded.warnings.length ? ` ${reloaded.warnings.length} warning(s) below.` : ''}
        </div>
      ) : null}

      {!full && institution.loading ? <LoadingState label="Reading the institution configuration" /> : null}

      <OnboardingWizard />

      <DataTransferPanel />

      <div className="board">
        <div className="board-7">
          <Panel
            title="Where this configuration comes from"
            subtitle="A file, not a build. Editing it and pressing reload changes the running deployment - no rebuild, no restart, no code change."
          >
            <KV
              items={[
                { label: 'Configuration file', value: <span className="ident">{source?.file ?? '—'}</span> },
                {
                  label: 'File found',
                  value: source ? (
                    <Badge tone={source.found ? 'done' : 'warn'}>{source.found ? 'yes' : 'no — defaults in use'}</Badge>
                  ) : (
                    '—'
                  ),
                },
                { label: 'Loaded at', value: source?.loaded_at ? new Date(source.loaded_at).toLocaleString() : '—' },
                {
                  label: 'Path override',
                  value: source?.env_override ? (
                    <Badge tone="warn">INSTITUTION_CONFIG_PATH is set</Badge>
                  ) : (
                    'default location'
                  ),
                },
                {
                  label: 'Warnings',
                  value: source?.warnings?.length ? (
                    <ul className="list-reset stack" style={{ gap: 4 }}>
                      {source.warnings.map((warning) => (
                        <li key={warning} className="small">
                          {warning}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    'none'
                  ),
                },
              ]}
            />
          </Panel>
        </div>

        <div className="board-5">
          <Panel
            title="Identity"
            subtitle="What every screen calls this deployment."
          >
            <KV
              items={[
                { label: 'Name', value: config.identity.name },
                { label: 'Short name', value: config.identity.short_name },
                { label: 'Monogram', value: <span className="ident">{config.identity.monogram}</span> },
                { label: 'Code', value: <span className="ident">{config.identity.code}</span> },
                { label: 'Kind', value: config.identity.kind },
                { label: 'City', value: [config.identity.city, config.identity.region].filter(Boolean).join(', ') || '—' },
                { label: 'Support', value: institution.supportLine || '—' },
                { label: 'Term', value: config.academics.term_label },
              ]}
            />
          </Panel>
        </div>
      </div>

      <AppearancePanel config={config} />

      <div className="board">
        <div className="board-6">
          <Panel
            title={`Vocabulary — the words this institution uses`}
            subtitle="Used in place of hardcoded words, so an institute that calls hostels 'residences' reads correctly everywhere."
          >
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
              {Object.entries(config.vocabulary).map(([key, entry]) => (
                <div key={key} className="card card-flat" style={{ padding: 'var(--sp-3)' }}>
                  <div className="stencil muted">{key}</div>
                  <div className="bold">{entry.singular}</div>
                  <div className="small muted">{entry.plural}</div>
                </div>
              ))}
            </div>
          </Panel>
        </div>
        <div className="board-6">
          <Panel title="Stations and modules" subtitle="What this deployment switches on, and how shared devices behave.">
            <KV
              items={[
                { label: 'Kiosk idle timeout', value: `${config.stations.kiosk_idle_seconds} seconds` },
                { label: 'Kiosk theme', value: config.stations.kiosk_default_theme },
                { label: 'Helpdesk channel', value: <span className="ident">{config.stations.helpdesk_channel}</span> },
                { label: 'Default channel', value: <span className="ident">{config.stations.default_channel}</span> },
              ]}
            />
            <hr className="divider" />
            <div className="pill-row">
              {availableFeatures(config).map((feature) => (
                <Badge key={feature.id} tone={feature.enabled ? 'done' : 'dead'}>
                  {feature.id.replaceAll('_', ' ')}: {feature.enabled ? 'on' : 'off'}
                </Badge>
              ))}
            </div>
            <p className="hint" style={{ marginTop: 'var(--sp-3)' }}>
              A module switched off here removes its navigation and its screens. The server still
              enforces the underlying permission, so this is a product decision, never a security
              boundary.
            </p>
          </Panel>
        </div>
      </div>

      <Panel
        title="Accessibility floor this build holds itself to"
        subtitle="Stated as numbers, because 'accessible' on its own is not something an administrator can check."
      >
        <div className="grid-metrics">
          <Metric label="Standard" value={`WCAG ${config.guardrails.wcag_level}`} hint="Applies to both themes" />
          <Metric
            label="Body contrast"
            value={`${config.guardrails.min_body_contrast}:1`}
            hint="Measured, not estimated"
          />
          <Metric
            label="Minimum target"
            value={`${config.guardrails.min_touch_target_px}px`}
            hint="For an operator wearing gloves"
          />
          <Metric
            label="Status chips"
            value={config.guardrails.status_always_carries_word ? 'Word + colour' : 'Colour only'}
            hint="Never colour alone"
          />
          <Metric
            label="Audit reasons"
            value={config.guardrails.require_audit_reason ? 'Required' : 'Optional'}
            hint="Every override is explained"
          />
        </div>
      </Panel>

      <EditableKeysPanel keys={full?.editable_keys ?? []} />

      <DesignLanguagesPanel />

      <Panel
        title="Roadmap — themes and design languages"
        subtitle={`${roadmapCount().total} planned changes to how this product looks, grouped by what they cost to adopt.`}
        hazard
      >
        <div className="stack-lg">
          {DESIGN_ROADMAP.map((group) => (
            <div key={group.group} className="stack">
              <h3 className="stencil">{group.group}</h3>
              <div className="card-columns">
                {group.items.map((item) => (
                  <article key={item.title} className="card">
                    <div className="card-head">
                      <h4 className="card-title">{item.title}</h4>
                      <Badge tone={item.effort === 'config only' ? 'done' : item.effort === 'new skin' ? 'blocked' : 'open'}>
                        {item.effort}
                      </Badge>
                    </div>
                    <p className="small muted">{item.detail}</p>
                  </article>
                ))}
              </div>
            </div>
          ))}
        </div>
        <hr className="divider" />
        <div className="stack">
          <h3 className="stencil">What a new design language costs</h3>
          <ol className="stack small" style={{ paddingInlineStart: 'var(--sp-5)' }}>
            <li>Copy the `[data-skin='modern']` block in `src/styles/tokens.css` and change its values.</li>
            <li>Register the new skin in `src/theme/registry.ts` with its name, status and characteristics.</li>
            <li>Point `appearance.skin` at it in `config/institution.json`.</li>
            <li>
              Check both themes at 390 / 768 / 1280 pixels. The palettes and the contrast floor come from
              the theme layer, so they carry over untouched — that is the entire reason a skin is a token
              set and not a fork.
            </li>
          </ol>
          <p className="note">
            Nothing in the application branches on the skin name. A new design language therefore cannot
            silently lose an accessibility guarantee, a permission check or an offline behaviour that a
            shipped one has.
          </p>
        </div>
      </Panel>
    </div>
  )
}

/** The current design language, plus the ones the registry already names. A
 *  planned skin is listed honestly as planned: an adopting college should be
 *  able to see the cost before they ask for it. */
function AppearancePanel({ config }: { config: InstitutionConfig }) {
  const { skin, setSkin, theme } = useTheme()
  return (
    <Panel
      title="Design language"
      subtitle="The look of the deployment, separate from light and dark. A skin is a token set: choosing another one changes shape, weight, density and structure without touching a component."
      actions={
        <>
          <Badge tone="ghost">theme: {theme}</Badge>
          <Badge tone="open">skin: {skin}</Badge>
        </>
      }
    >
      <KV
        items={[
          { label: 'Configured skin', value: config.appearance.skin },
          { label: 'Default theme', value: config.appearance.default_theme },
          {
            label: 'People may choose a theme',
            value: config.appearance.allow_user_theme_override ? 'yes' : 'no — fixed for all devices',
          },
          {
            label: 'Institution accent',
            value: config.appearance.accent ? (
              <span className="ident">{config.appearance.accent}</span>
            ) : (
              'shipped palette'
            ),
          },
        ]}
      />
      <hr className="divider" />
      <div className="card-columns">
        {SKINS.map((entry) => (
          <article key={entry.id} className="card">
            <div className="card-head">
              <h3 className="card-title">{entry.name}</h3>
              <Badge tone={entry.status === 'shipped' ? 'done' : 'blocked'}>{entry.status}</Badge>
            </div>
            <p className="small">{entry.summary}</p>
            <ul className="stack small muted" style={{ paddingInlineStart: 'var(--sp-5)', listStyle: 'disc' }}>
              {entry.characteristics.map((characteristic) => (
                <li key={characteristic}>{characteristic}</li>
              ))}
            </ul>
            {entry.requestedBy ? <p className="hint">Requested by: {entry.requestedBy}</p> : null}
            <div className="card-actions">
              {entry.status === 'shipped' ? (
                <Button
                  size="sm"
                  variant={skin === entry.id ? 'ghost' : 'primary'}
                  onClick={() => setSkin(entry.id)}
                  disabled={skin === entry.id}
                >
                  {skin === entry.id ? 'In use on this device' : 'Preview on this device'}
                </Button>
              ) : (
                <span className="hint">Not selectable yet — listed so the cost is visible.</span>
              )}
            </div>
          </article>
        ))}
      </div>
      <p className="hint" style={{ marginTop: 'var(--sp-3)' }}>
        {shippedSkins().length} of {SKINS.length} registered design languages are implemented. Previewing
        one here changes this device only, which is what makes evaluating a new look safe.
      </p>
    </Panel>
  )
}

/** Every knob the server reports, grouped. Rendered from the server's own list
 *  rather than a hand-written table, so it cannot drift out of date. */
function EditableKeysPanel({ keys }: { keys: EditableKey[] }) {
  if (!keys.length) {
    return (
      <Panel title="Every setting the template exposes">
        <EmptyState
          title="The edit checklist needs an administrator session"
          detail="Reload the page while signed in as an administrator to see the full list of settings and their current values."
        />
      </Panel>
    )
  }
  const groups = new Map<string, EditableKey[]>()
  keys.forEach((key) => {
    groups.set(key.group, [...(groups.get(key.group) ?? []), key])
  })
  return (
    <Panel
      title="Every setting the template exposes"
      subtitle="Grouped by what it affects. The path column is the JSON key in config/institution.json."
      flush
    >
      <div className="table-wrap become-cards" style={{ border: 'none', boxShadow: 'none' }}>
        <table className="data">
          <thead>
            <tr>
              <th scope="col">Group</th>
              <th scope="col">Setting</th>
              <th scope="col">Key</th>
              <th scope="col">Current value</th>
            </tr>
          </thead>
          <tbody>
            {[...groups.entries()].map(([group, entries]) =>
              entries.map((entry, index) => (
                <tr key={entry.path}>
                  <td data-label="Group">{index === 0 ? <span className="stencil">{group}</span> : ''}</td>
                  <td data-label="Setting">{entry.label}</td>
                  <td data-label="Key">
                    <span className="ident">{entry.path}</span>
                  </td>
                  <td data-label="Current value">
                    <span className="mono">{String(entry.current) || '—'}</span>
                  </td>
                </tr>
              )),
            )}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}

/** The design-language roadmap, kept next to the settings because it is the
 *  answer to the question this page is asked most often. */
function DesignLanguagesPanel() {
  return (
    <Panel
      title="Adding a design language"
      subtitle="What it takes, in the order it happens."
    >
      <div className="grid">
        {[
          {
            step: '1',
            title: 'A token block',
            body: 'Shape, borders, type treatment, density and surface treatment are tokens. A new look is a block of values, usually 15 to 25 lines.',
          },
          {
            step: '2',
            title: 'A registry entry',
            body: 'The skin is named and described in src/theme/registry.ts, with what changes and who asked for it, so it can be evaluated rather than guessed at.',
          },
          {
            step: '3',
            title: 'A configuration line',
            body: 'appearance.skin in config/institution.json points the deployment at it. No component, page or API call is touched.',
          },
          {
            step: '4',
            title: 'A four-width check',
            body: 'Both themes at 390, 768, 1280 and 1600 pixels. The palettes come from the theme layer, so contrast is already solved before the check begins.',
          },
        ].map((item) => (
          <article key={item.step} className="card">
            <div className="card-head">
              <Badge tone="progress">Step {item.step}</Badge>
            </div>
            <h3 className="card-title">{item.title}</h3>
            <p className="small muted">{item.body}</p>
          </article>
        ))}
      </div>
    </Panel>
  )
}
