/** The assistant panel.
 *
 *  Two design decisions worth stating:
 *   - every answer shows its evidence: which tool ran, and whether it worked.
 *     If the tool failed, the UI says so rather than inventing an answer.
 *   - anything that would write shows as a *proposal* with a Confirm button.
 *     The agent never writes on its own.
 */

import { useState } from 'react'
import { ApiError, api } from '../lib/api'
import type { AssistantAnswer } from '../lib/types'
import { Badge, Button, Card, Field, TextArea } from './ui'
import { useSession } from '../state/session'

const STARTERS = [
  'Where is my complaint right now?',
  'Show me my open requests',
  'What are my unpaid dues?',
  'When does the library close today?',
  'I need a bonafide certificate',
]

export function AssistantPanel({ compact }: { compact?: boolean }) {
  const { profile } = useSession()
  const [question, setQuestion] = useState('')
  const [thread, setThread] = useState<{ role: 'you' | 'assistant'; answer?: AssistantAnswer; text?: string }[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmed, setConfirmed] = useState<string | null>(null)

  const ask = async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed) return
    setBusy(true)
    setError(null)
    setThread((current) => [...current, { role: 'you', text: trimmed }])
    setQuestion('')
    try {
      const answer = await api.post<AssistantAnswer>('/agents/assistant/ask', { question: trimmed })
      setThread((current) => [...current, { role: 'assistant', answer }])
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : 'The assistant could not be reached. Your question was not sent.',
      )
    } finally {
      setBusy(false)
    }
  }

  const confirm = async (answer: AssistantAnswer) => {
    if (!answer.proposed_action) return
    setBusy(true)
    setError(null)
    try {
      const result = await api.post<AssistantAnswer>('/agents/assistant/confirm', {
        proposed_action: answer.proposed_action,
      })
      setConfirmed(result.answer)
      setThread((current) => [...current, { role: 'assistant', answer: result }])
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : 'Could not apply that action.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="stack">
      {!compact ? (
        <Card>
          <div className="row-between">
            <div>
              <h2>Ask the campus assistant</h2>
              <p className="small muted" style={{ marginBottom: 0 }}>
                Signed in as {profile?.full_name} ({profile?.role.replaceAll('_', ' ').toLowerCase()})
              </p>
            </div>
            <Badge tone="agent">Assisted</Badge>
          </div>
        </Card>
      ) : null}

      {thread.length === 0 ? (
        <Card>
          <div className="section-title">Try one of these</div>
          <div className="stack" style={{ gap: 8 }}>
            {STARTERS.map((starter) => (
              <Button key={starter} variant="ghost" onClick={() => void ask(starter)}>
                {starter}
              </Button>
            ))}
          </div>
        </Card>
      ) : null}

      {thread.map((entry, index) =>
        entry.role === 'you' ? (
          <Card key={index} accent="signal" className="card-flat">
            <div className="stencil" style={{ color: 'var(--signal)', marginBottom: 4 }}>You</div>
            <div>{entry.text}</div>
          </Card>
        ) : (
          <AssistantAnswerCard
            key={index}
            answer={entry.answer as AssistantAnswer}
            busy={busy}
            onConfirm={() => void confirm(entry.answer as AssistantAnswer)}
          />
        ),
      )}

      {confirmed ? (
        <div className="banner banner-info" role="status">
          {confirmed}
        </div>
      ) : null}
      {error ? (
        <div className="banner banner-error" role="alert">
          {error}
        </div>
      ) : null}

      <Card>
        <Field label="Your question" hint="Answers come from your own data, not from guesses.">
          <TextArea
            value={question}
            onChange={setQuestion}
            rows={3}
            placeholder="e.g. Why has my hostel complaint not been fixed yet?"
          />
        </Field>
        <Button variant="agent" block busy={busy} onClick={() => void ask(question)} disabled={!question.trim()}>
          Ask
        </Button>
      </Card>
    </div>
  )
}

function AssistantAnswerCard({
  answer,
  busy,
  onConfirm,
}: {
  answer: AssistantAnswer
  busy: boolean
  onConfirm: () => void
}) {
  return (
    <Card className="card-accent-agent">
      <div className="row wrap" style={{ gap: 6 }}>
        <Badge tone="agent">Assistant</Badge>
        <Badge tone="ghost">intent: {answer.intent}</Badge>
        {answer.fallback_reason ? <Badge tone="warn">rules fallback</Badge> : null}
      </div>
      <p style={{ marginTop: 8, whiteSpace: 'pre-wrap' }}>{answer.answer}</p>

      {answer.evidence?.length ? (
        <details className="small">
          <summary>Where this came from ({answer.evidence.length} lookup(s))</summary>
          <ul className="list-reset stack" style={{ marginTop: 6, gap: 6 }}>
            {answer.evidence.map((item, index) => (
              <li key={index}>
                <span className="mono">{item.tool}</span>{' '}
                {item.ok ? <Badge tone="done">ok</Badge> : <Badge tone="urgent">failed</Badge>}
                {item.error ? <div className="field-error small">{item.error}</div> : null}
                {item.ok ? (
                  <pre className="mono tiny" style={{ whiteSpace: 'pre-wrap', margin: '4px 0 0' }}>
                    {JSON.stringify(item.data, null, 1).slice(0, 900)}
                  </pre>
                ) : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {answer.proposed_action ? (
        <div className="banner banner-agent" style={{ marginTop: 10 }}>
          <div className="grow">
            <div className="bold">Proposed action: {answer.proposed_action.type.replaceAll('_', ' ').toLowerCase()}</div>
            <div className="small">Nothing has been saved yet. Confirm to apply it.</div>
          </div>
          <Button variant="primary" busy={busy} onClick={onConfirm}>
            Confirm
          </Button>
        </div>
      ) : null}

      {answer.suggestions?.length ? (
        <div className="pill-row" style={{ marginTop: 10 }}>
          {answer.suggestions.map((suggestion) => (
            <Badge key={suggestion} tone="ghost">
              {suggestion}
            </Badge>
          ))}
        </div>
      ) : null}
    </Card>
  )
}
