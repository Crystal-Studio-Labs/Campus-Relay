# Requirements Traceability

Each requirement from BPUT Problem Statement 07 (Fretbox) mapped to where it is
implemented and how it is verified.

## Student operations
| Requirement | Implementation | Verify |
| :-- | :-- | :-- |
| Leave requests | `LEAVE_REQUEST` service, warden approval workflow | e2e: leave workflow |
| Gate-pass requests | `gate_passes` issued on approval | e2e: leave → pass |
| Certificates/documents | Verifiable PDF (`services/documents.py`) | e2e: certificate |
| Fees/dues | Student `dues_balance` checked by certificate policy | Profile + policy failure message |
| Notices/announcements | Notice system with targeting | e2e: notices |
| Timetable/class updates | Notice categories + assistant intent | Assistant `TIMETABLE` |

## Hostel / facility operations
| Requirement | Implementation | Verify |
| :-- | :-- | :-- |
| Maintenance complaints | Universal case + intake classification | e2e: maintenance |
| Complaint tracking | Case timeline + status | Case detail |
| Room records | `rooms`, `locations` | Directory → Places & assets |
| Asset records | `assets` + operational history | Directory, recurring issues |
| Mess feedback | `MESS_COMPLAINT` service | Service catalogue |
| Visitor/gate logs | `gate_logs` append-only | Gate desk, e2e anti-passback |

## Communication
| Requirement | Implementation | Verify |
| :-- | :-- | :-- |
| Targeted notifications | `notice_targets` (9 target types) | Notice studio audience preview |
| Batch/branch/hostel/year targeting | Target types | e2e: multi-target |
| Delivery tracking | `notice_recipients` per person | Notice analytics |
| Read tracking | `POST /notices/{id}/read` | Analytics read count |
| Action tracking | `notice_actions` + `/action` | Analytics action count |
| Image/PDF notice (as published in practice) | `POST /notices/{id}/attachment` | Notice studio upload → student preview |
| External reach (WhatsApp / Telegram) | Delivery outbox + channel adapters | Notification channel panel (`/meta`) |

## Administration
| Requirement | Implementation | Verify |
| :-- | :-- | :-- |
| Pending requests | `/approvals`, dashboard metric | Command centre |
| Complaint ageing | `ageing` buckets (`/admin/aging`) | Command centre |
| Resolution time | `/admin/resolution-times` | Command centre metric |
| Recurring issues | `recurring_issues` detector | Command centre tab |
| Workload distribution | `staff_workload`, `by_department` | Command centre Teams tab |

## Accessibility & resilience
| Requirement | Implementation | Verify |
| :-- | :-- | :-- |
| Low-bandwidth operation | Code splitting, small payloads, pagination | `vite.config.ts` chunks |
| Low-end devices | PWA, minimal animation, reduced-motion | Styles |
| Regional languages | `lib/i18n.ts` (en, or), translation coverage | Profile screen |
| Offline alternatives | IndexedDB outbox + sync | Mandatory offline test |
| Students without smartphones | Kiosk + helpdesk, `source_channel` | e2e: kiosk |

## Optional intelligence
| Requirement | Implementation | Verify |
| :-- | :-- | :-- |
| Automatic complaint routing | Intake + routing agents | `/agents/*` |
| Recurring issue detection | Operations agent + detector | Command centre |
| Facility demand prediction | **Not implemented** — deliberately not claimed | — |
| Campus assistant/chatbot | Controlled Student Assistant | `/agents/assistant/ask` |

## Required deliverables
| Deliverable | Status |
| :-- | :-- |
| ≥3 end-to-end workflows | Built: maintenance, certificate, leave+gate |
| Administrator dashboard | Command centre + queue + analytics + audit |
| Communication layer with tracking | Notice system + notification centre |
| Low-end / poor-network demo | Offline queue, Sync Centre |
| No-smartphone fallback | Kiosk + helpdesk |
| Adoption strategy | `docs/adoption-plan.md` |
| Data migration strategy | `docs/adoption-plan.md` |

## Beyond the baseline

- **External messaging** — the Telegram and WhatsApp adapters are real and send
  images, documents and text once a provider credential is set; an async delivery
  outbox retries a failed send instead of dropping it. Until a credential exists
  the channel panel reports them honestly as *not configured* and refuses to
  queue rather than pretend.
- **Image/PDF notices** — a circular can be photographed or exported to PDF and
  uploaded; it is stored on the notice, previewed to students, and delivered as
  the media attachment external channels expect.

## Deliberately out of scope

- **Native Android app** — the spec asks for a PWA, which is what is built.
- **Facility demand prediction** — the spec marks it optional; no accuracy is
  claimed for a feature that is not implemented.
- **Push/SMS/email delivery** — adapter slots only; no provider is wired, so they
  are never reported as configured.

## Definition of done

See the checklist in section 60 of the build spec. Verified items are exercised
by `backend/scripts/e2e_demo.py` against a running instance; the remainder are
covered by manual steps in `docs/demo-script.md`.
