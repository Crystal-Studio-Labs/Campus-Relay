/** Assistant page (student-facing and staff-facing variants). */

import { api } from '../lib/api'
import { useRemote } from '../state/hooks'
import { AssistantPanel } from '../components/Assistant'
import { Badge, Card, SectionTitle } from '../components/ui'

interface Capabilities {
  tools: { name: string; description: string; mutating: boolean; requires_confirmation: boolean }[]
  blocked: string[]
}

export function AssistantPage() {
  const { data } = useRemote<Capabilities>('agent-capabilities', () => api.get<Capabilities>('/agents/capabilities'))

  return (
    <div className="stack-lg">
      <div className="split">
        <AssistantPanel />

        <div className="stack">
          <Card>
            <SectionTitle right={<Badge tone="ghost">guardrails</Badge>}>What the assistant may do</SectionTitle>
            <ul className="list-reset stack" style={{ gap: 6 }}>
              {(data?.tools ?? []).map((tool) => (
                <li key={tool.name}>
                  <div className="bold small">{tool.name.replaceAll('_', ' ').toLowerCase()}</div>
                  <div className="tiny muted">{tool.description}</div>
                  {tool.mutating ? (
                    <Badge tone="warn">requires your confirmation</Badge>
                  ) : (
                    <Badge tone="ghost">read only</Badge>
                  )}
                </li>
              ))}
            </ul>
            {data?.blocked?.length ? (
              <p className="small muted" style={{ marginTop: 8 }}>
                Not permitted for your role: {data.blocked.map((item) => item.replaceAll('_', ' ').toLowerCase()).join(', ')}.
              </p>
            ) : null}
          </Card>

          <Card className="card-flat">
            <SectionTitle>Rules this assistant follows</SectionTitle>
            <ul className="small">
              <li>It never writes to the database on its own — it proposes, you confirm.</li>
              <li>It cannot bypass permissions, policy checks or the workflow.</li>
              <li>Every answer lists the lookups it used, including failed ones.</li>
              <li>If it cannot answer, it says so instead of inventing a case status.</li>
              <li>When no language model is configured, deterministic rules answer instead — the product still works.</li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  )
}
