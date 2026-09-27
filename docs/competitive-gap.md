# Competitive Gap

This document is deliberately conservative. It does **not** claim Campus Relay
is first, unique or revolutionary, and it does **not** assert what Fretbox can or
cannot do unless that is independently verified. Fretbox is an established
campus operations product with real capability; the honest framing is that
Campus Relay is a different *shape* of system, not a claim that Fretbox is
missing features.

## What the problem statement highlights

BPUT Problem Statement 07 (Fretbox) describes fragmentation: registers, notice
boards, WhatsApp groups, printed forms and disconnected applications. The
required outcomes are end-to-end workflows, admin visibility (pending items,
ageing, resolution time, recurring issues), a tracked communication layer,
low-bandwidth/offline operation, a no-smartphone fallback, and an adoption and
migration strategy.

## Where Campus Relay overlaps

These are table stakes, and Fretbox covers them too:

- Digital complaint/request intake and tracking.
- Notices and announcements, targeted at audiences.
- Leave and gate-pass flows with approval.
- Basic dashboards and reports.

Overlap is expected. It is not where the differentiation is claimed.

## Where a generic CRUD implementation is not enough

A conventional campus-management product tends to be **a set of screens over a
database per department**. That shape struggles with:

- adding a new service without a new module,
- the same request arriving from a phone, a kiosk, a helpdesk and an agent,
- operating with no network,
- proving six months later who did what.

## Campus Relay's architectural differentiation

| Dimension | Typical implementation | Campus Relay |
| :-- | :-- | :-- |
| New service | New module / new tables | Config: catalogue + workflow + policy |
| Request model | Per-department forms | One universal CampusCase |
| Offline | Read-only cache or nothing | Local-first outbox, idempotent replay, explicit conflicts |
| Audit | Timestamp columns | Append-only event stream, DB-trigger enforced |
| Access | One responsive web app | Channel-independent: PWA, kiosk, helpdesk, gate, agents |
| Automation | External chatbot | Four controlled agents behind auth + policy, with deterministic fallback |
| Documents | Static PDF | Verifiable PDF with serial + public zero-trust check |

The pipeline — `REQUEST → CASE → POLICY → WORKFLOW → APPROVAL → SLA →
ASSIGNMENT → NOTIFICATION → RESOLUTION → VERIFICATION → AUDIT` — is the product.
The interfaces are clients of it.

## Why this is more than another CRUD app

1. **The engine is the product.** Services are configuration; the same state
   machine, policy engine and SLA engine serve them all.
2. **Offline is real.** Requests are created on the device with idempotency
   keys, queued, and replayed without duplicates — demonstrated, not asserted.
3. **The audit trail is provable.** Immutability is enforced by the database, so
   it survives future code changes.
4. **Every channel reaches the same case.** A kiosk request is a normal case with
   `source_channel = KIOSK`, not a second-class workflow.
5. **Intelligence is controlled.** Agents propose with tool evidence; humans
   confirm; nothing degrades if the model is unavailable.

## Explicit non-claims

- No claim that Fretbox lacks any specific feature.
- No fabricated adoption, accuracy or performance numbers.
- Telegram and WhatsApp are implemented as real adapters, but no provider is
  configured by default: the deployment reports them as unconfigured and sends
  nothing until credentials are supplied. Read receipts are never claimed.
- Push/SMS/email are unconfigured adapter slots and reported as such.

See `README.md` for the full feature list.
