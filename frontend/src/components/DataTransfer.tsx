/** Data import & export — the onboarding flow.
 *
 *  A college brings its own departments, hostels, rooms, staff and students as
 *  CSV. The templates and the live export share one column shape, so an export
 *  can be edited and re-imported. Import never hides a bad row: failures are
 *  listed with their line number and reason, and a partial file never reads as
 *  a clean import.
 */

import { useState } from 'react'
import { ApiError, api, apiUrl, tokenStore } from '../lib/api'
import { useRemote } from '../state/hooks'
import { useSession } from '../state/session'
import { Badge, Button, Card, SectionTitle } from './ui'

interface EntityInfo {
  name: string
  columns: string[]
  required: string[]
  note: string
  dependency_order: number
}

interface ImportResult {
  entity: string
  imported: number
  failed: number
  errors: { line: number; reason: string }[]
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

async function saveCsv(path: string, filename: string) {
  const text = await api.get<string>(path)
  const blob = new Blob([typeof text === 'string' ? text : JSON.stringify(text)], { type: 'text/csv' })
  triggerDownload(blob, filename)
}

/** Binary downloads (the onboarding pack zip) bypass the JSON client, which
 *  decodes responses as text. */
async function saveBinary(path: string, filename: string) {
  const token = tokenStore.get()
  const response = await fetch(apiUrl(path), {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!response.ok) throw new ApiError(response.status, 'download_failed', `Download failed (${response.status}).`)
  triggerDownload(await response.blob(), filename)
}

export function DataTransferPanel() {
  const { can } = useSession()
  const canImport = can('data:import')
  const canExport = can('data:export')
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)

  const { data } = useRemote<{ entities: EntityInfo[] }>(
    canImport ? 'data-entities' : null,
    () => api.get('/admin/data/entities'),
  )

  const run = async (entity: string, file: File) => {
    setBusy(entity)
    setMessage(null)
    setResult(null)
    try {
      const form = new FormData()
      form.append('file', file)
      const outcome = await api.upload<ImportResult>(`/admin/data/import/${entity}`, form)
      setResult(outcome)
      setMessage(
        outcome.failed === 0
          ? `${outcome.imported} ${entity} imported.`
          : `${outcome.imported} imported, ${outcome.failed} row(s) rejected — see below.`,
      )
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : 'The import could not be completed.')
    } finally {
      setBusy(null)
    }
  }

  if (!canImport && !canExport) return null

  return (
    <Card>
      <SectionTitle right={<Badge tone="ghost">bring your own campus</Badge>}>
        Data import &amp; export
      </SectionTitle>
      <p className="small muted" style={{ marginTop: 0 }}>
        Import in this order — later files reference earlier ones. Download a template, replace the sample
        row with your data, and upload. Anything the server rejects is listed with its line number; it is
        never silently dropped.
      </p>

      {message ? (
        <div className={`banner ${result && result.failed > 0 ? 'banner-error' : 'banner-info'}`} role="status">
          {message}
        </div>
      ) : null}

      <div className="row wrap" style={{ marginBottom: 'var(--sp-3)' }}>
        <Button
          variant="attention"
          busy={busy === 'pack'}
          onClick={async () => {
            setBusy('pack')
            try {
              await saveBinary('/admin/data/onboarding-pack', 'campus-relay-onboarding-pack.zip')
            } catch (error) {
              setMessage(error instanceof ApiError ? error.message : 'Could not download the pack.')
            } finally {
              setBusy(null)
            }
          }}
        >
          Download onboarding pack (templates + checklist)
        </Button>
      </div>

      <div className="table-wrap become-cards">
        <table className="data">
          <thead>
            <tr>
              <th>#</th>
              <th>Data set</th>
              <th>Required columns</th>
              <th>Template</th>
              {canExport ? <th>Export</th> : null}
              <th>Import</th>
            </tr>
          </thead>
          <tbody>
            {(data?.entities ?? []).map((entity) => (
              <tr key={entity.name}>
                <td data-label="#">{entity.dependency_order}</td>
                <td data-label="Data set">
                  <span className="ident">{entity.name}</span>
                  {entity.note ? <div className="tiny muted">{entity.note}</div> : null}
                </td>
                <td data-label="Required columns">
                  <span className="mono tiny">{entity.required.join(', ')}</span>
                </td>
                <td data-label="Template">
                  <Button
                    size="sm"
                    variant="ghost"
                    busy={busy === `tpl-${entity.name}`}
                    onClick={async () => {
                      setBusy(`tpl-${entity.name}`)
                      try {
                        await saveCsv(`/admin/data/template/${entity.name}.csv`, `${entity.name}-template.csv`)
                      } finally {
                        setBusy(null)
                      }
                    }}
                  >
                    CSV
                  </Button>
                </td>
                {canExport ? (
                  <td data-label="Export">
                    <Button
                      size="sm"
                      variant="info"
                      busy={busy === `exp-${entity.name}`}
                      onClick={async () => {
                        setBusy(`exp-${entity.name}`)
                        try {
                          await saveCsv(`/admin/data/export/${entity.name}.csv`, `${entity.name}.csv`)
                        } catch (error) {
                          setMessage(error instanceof ApiError ? error.message : 'Export failed.')
                        } finally {
                          setBusy(null)
                        }
                      }}
                    >
                      Download
                    </Button>
                  </td>
                ) : null}
                <td data-label="Import">
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    aria-label={`Import ${entity.name} CSV`}
                    disabled={!canImport}
                    onChange={(event) => {
                      const file = event.target.files?.[0]
                      if (file) void run(entity.name, file)
                      event.target.value = ''
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {result && result.errors.length ? (
        <div style={{ marginTop: 12 }}>
          <div className="section-title">Rows that were not imported</div>
          <ul className="list-reset stack" style={{ gap: 4 }}>
            {result.errors.slice(0, 40).map((error, index) => (
              <li key={index} className="small">
                <span className="mono">line {error.line}</span> — {error.reason}
              </li>
            ))}
          </ul>
          {result.errors.length > 40 ? (
            <p className="tiny muted">…and {result.errors.length - 40} more.</p>
          ) : null}
        </div>
      ) : null}
    </Card>
  )
}
