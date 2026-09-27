# Controlled Agent System

Campus Relay does **not** ship a general-purpose chatbot. It ships four narrow,
purpose-built agents that assist an operational workflow. They are advisory:
they propose, a human confirms, and no core workflow depends on them.

## The hard rule

An agent never touches PostgreSQL. Every agent action goes through the same
path as a human action:

```
User → Agent → Structured tool → Authorization → Policy engine
     → Application service → Database → Audit event
```

Every step verifies actor, role, permission, target, current state and policy.

## The four agents

| Agent | File | Job |
| :-- | :-- | :-- |
| **Intake** | `agents/intake.py` | Classify service/category, extract location, detect urgency, flag missing info and possible duplicates |
| **Routing** | `agents/routing_agent.py` | Recommend department + staff, determine SLA, explain the routing |
| **Operations** | `agents/ops.py` | Summarise pending cases, find SLA breaches, detect recurring problems, spot workload concentration, recommend escalation |
| **Student Assistant** | `agents/assistant.py` | Answer questions using real backend tools ("where is my certificate?", "why is my leave pending?") and propose actions for confirmation |

Output is always structured; narrative is written around structured facts rather
than invented.

## Tool sandbox

`agents/tools.py` is the only way an agent can read or act. Each tool:

- checks the caller's permission and data scope,
- returns a typed result or a safe error,
- records an `AGENT_QUERY` / `AGENT_ACTION` audit event.

The assistant's `POST /agents/assistant/ask` returns proposed actions with
evidence; `POST /agents/assistant/confirm` is required before any write happens.

## Dual engine

| Provider | When | Behaviour |
| :-- | :-- | :-- |
| `rules` (default) | Always available | Deterministic pattern matchers, force striping and domain heuristics. No network, no key, no cost. |
| `openai_compatible` | Configured | Any OpenAI-compatible endpoint (OpenAI, Groq, Ollama, vLLM) with structured tool calls. |

Selection is in `agents/provider.py`. If a remote model fails for **any**
reason, the caller falls back to the deterministic path and **records why** —
the feature never appears to have worked when it did not.

## Deterministic fallbacks

- Classification: keyword/force rules in `services/routing.py`.
- Duplicate detection: category + location + time heuristics (structured
  historical queries), not embeddings.
- Assistant: intent matching over real tools when no model is configured.

## Honesty

- Agent answers are marked as recommendations, with a disclaimer from
  `provider_status()`.
- `GET /meta` reports the active provider so the UI can state whether a model is
  configured ("deterministic rules" vs "remote model").
- No accuracy or prediction metrics are fabricated. Recurring-issue detection is
  reported as observed counts ("4 cases in 30 days"), never as a prediction.

## Endpoints

`GET /agents/status`, `POST /agents/intake`, `GET /agents/routing/{case_id}`,
`POST /agents/routing/preview`, `GET /agents/operations/briefing`,
`GET /agents/operations/recurring`, `POST /agents/assistant/ask`,
`POST /agents/assistant/confirm`, `GET /agents/capabilities`,
`GET /agents/case-summary/{case_id}`.
