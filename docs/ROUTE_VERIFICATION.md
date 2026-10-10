# 🧭 Route Verification — Page-by-Page Reconstruction

> **Vertical page flow, selective Bento Grid, full-width operational workspaces.**
> *Authored by **Crystal Studio Labs** for BPUT Hackathon 2026 — Problem Statement 07 (Fretbox)*

This document is the route checklist for the ERP frontend reconstruction. It records
what each page is for, how its layout was rebuilt, and exactly what was verified —
including the checks that could **not** be completed.

---

## 1. Reconstruction rules applied

Every route in `frontend/src/App.tsx` was inspected and rebuilt against the shared
design system using these rules:

1. **One vertical reading order.** Page header → context/filters → summary (only
   where useful) → primary working area → supporting sections → pagination →
   contextual notes. Content is never split into unrelated side-by-side columns to
   fill space.
2. **Bento Grid is selective.** It is used for dashboard metrics, status summaries,
   quick actions and related information groups — not for tables, forms or
   workflows. Operational pages get full-width tables and vertically grouped forms.
3. **Full-width operational workspaces.** Queue, audit, analytics, directory and
   setup give the table/primary workspace the full page width.
4. **Forms are vertical.** `Field` stacks label → control → hint → error; only
   closely-related field pairs sit side by side (date ranges, contact details).
5. **One interface per route.** No "Design A / Design B" alternatives anywhere.
6. **Nothing below the fold removed.** Lower sections, pagination, dialogs and
   empty/error states are part of the reconstruction.

### Side-by-side layouts that were deliberately converted

| Route | Before | After |
| :-- | :-- | :-- |
| `/` (student home) | attention band 7/5, requests + shortcuts 8/4 | stacked full-width bands |
| `/operations` | SLA ∥ categories, ageing ∥ status mix (7/5) | four stacked full-width panels |
| `/analytics` | two analysis panels side by side | stacked full-width panels |
| `/setup` | config ∥ identity (7/5), vocabulary ∥ stations (6/6) | stacked full-width panels |
| `/cases/:caseId` | detail ∥ timeline rail (8/4) | stacked vertical flow |
| `/leave` | two counts split inside a card | one summary band above the register |

Field pairs left as two columns (allowed by the vertical-form rule): `/career`,
`/leave`, `/library`, `/feedback`, `/notifications`, `/attendance/mark`, `/marks/entry`.

---

## 2. Per-route checklist

Legend — **Desktop** = 1440 px, **Tablet** = 820 px, **Mobile** = 390 px.
`✅` verified rendering, `✅ovf` verified with zero horizontal overflow,
`—` not individually run at that width.

### Shell routes

| Route | Purpose | Role(s) | Desktop | Mobile/Tablet |
| :-- | :-- | :-- | :--: | :--: |
| `/` | Role home dashboard | all | ✅ovf | ✅ovf (390, stud) |
| `/report` | File a personal request | student | ✅ovf | ✅ovf (390) |
| `/attendance` | My attendance | student | ✅ovf | ✅ovf (390) |
| `/attendance/mark` | Mark attendance | teacher | ✅ovf | — |
| `/marks` | My marks | student | ✅ovf | ✅ovf (390) |
| `/marks/entry` | Enter marks | teacher | ✅ovf | — |
| `/timetable` | My timetable | student | ✅ovf | — |
| `/timetable/teaching` | Teaching timetable | teacher, mgmt | ✅ovf | — |
| `/fees` | Fees & dues | student | ✅ovf | ✅ovf (390) |
| `/fees/collection` | Fee collection desk | management | ✅ovf | — |
| `/clearance` | Clearance & no-dues | student | ✅ovf | — |
| `/clearance/desk` | Clearance desk | management | ✅ovf | — |
| `/library` | Library | student | ✅ovf | — |
| `/library/desk` | Library desk | management | ✅ovf | — |
| `/leave` | Leave register | student | ✅ovf | ✅ovf (390) |
| `/leave/desk` | Leave approvals | management | ✅ovf | — |
| `/feedback` | Give feedback, and answer a request from the office | student, teacher | ✅ovf | — |
| `/feedback/inbox` | Feedback inbox: read, respond, ask for feedback | management, teacher | ✅ovf | — |
| `/activities` | Activities | all | ✅ovf | — |
| `/activities/manage` | Activities desk | management | ✅ovf | — |
| `/career` | Careers & placements | all | ✅ovf | — |
| `/career/manage` | Placements desk | management | ✅ovf | — |
| `/employment` | My employment / payroll desk | staff, mgmt | ✅ovf (mgmt) · ✅ denied screen (student) | — |
| `/hrms` | HR & payroll | management | ✅ovf | — |
| `/cases` | Request list | all | ✅ovf | ✅ovf (390) |
| `/cases/:id` | Case detail | all | ✅ovf | — |
| `/notices` | Notices | all | ✅ovf | ✅ovf (390) |
| `/notices/studio` | Notice Studio | management | ✅ovf | — |
| `/notices/:id` | Notice detail | all | ✅ovf | — |
| `/notifications` | Alerts | all | ✅ovf | — |
| `/profile` | Profile | all | ✅ovf | — |
| `/assistant` | Campus assistant | management | ✅ovf | — |
| `/sync` | Offline & sync | all | ✅ovf | — |
| `/guide` | Guide & devices | all | ✅ovf | — |
| `/queue` | Case queue | staff, mgmt | ✅ovf | ✅ovf (390 admin) · ✅ (820) |
| `/approvals` | Approvals | staff, mgmt | ✅ovf | — |
| `/operations` | Command centre | management | ✅ovf | ✅ovf (390) |
| `/analytics` | Analytics | management | ✅ovf | — |
| `/audit` | Audit trail | management | ✅ovf | ✅ (820) |
| `/directory` | Directory & config | management | ✅ovf | ✅ovf (390) |
| `/setup` | Institution setup | management | ✅ovf | ✅ovf (390) · ✅ (820) |
| `/tasks` | My tasks | staff, mgmt | ✅ovf | — |
| `/gate` | Gate desk | security, mgmt | ✅ovf | — |
| `/helpdesk` | Helpdesk desk | management | ✅ovf | — |
| `*` | Not found | all | ✅ | — |

### Station routes (outside the shell)

| Route | Purpose | Notes |
| :-- | :-- | :-- |
| `/kiosk` | No-smartphone kiosk | renders the kiosk sign-in for an unsigned tablet |
| `/login` | Sign-in | verified rendering, light + dark |
| `/` (anonymous) | Public landing page | verified rendering |

### Access control

| Check | Result |
| :-- | :-- |
| Student opening `/employment` (needs `hrms:read`) | ✅ refused with a proper page heading — no blank screen |
| Management opening `/attendance` (student-only) | ✅ refused by the role guard |
| Teacher navigation vs student navigation | ✅ different item sets (27 vs 18 links) |

---

## 3. Verification method

A temporary same-origin harness (`public/__audit.html`, removed after the audit)
loaded each route in an iframe and reported, for the **full page including below the
fold**:

- the page `<h1>`, presence of the breadcrumb and the page header;
- the ordered section sequence (header → filters → summary → panels → table → state);
- counts of panels, `table.data`, forms, `.field`s, inputs, empty states, skeletons;
- total document height (proving content below the first viewport was measured);
- **accidental horizontal overflow** (`scrollWidth − clientWidth`);
- whether an error state or the sign-in screen rendered instead of the page.

`npx tsc --noEmit` and `npm run build` were run after the changes.

---

## 4. Limitations — read this honestly

1. **Not every route × role × width combination was executed.** The combination
   matrix is roughly 45 routes × 4 roles × 3 widths. Desktop (1440 px) was run for
   the management, student and teacher role sets, plus targeted tablet/mobile
   widths on the table-heavy and dashboard routes. The remainder of the
   narrow-width matrix is unverified.
2. **A headless measurement artifact exists.** Chrome's `--virtual-time-budget`
   advances client timers faster than real network latency, so the app's session
   probe can resolve as anonymous before `/auth/me` answers. This intermittently
   produced a sign-in snapshot for some narrow-width runs. The affected routes were
   re-checked by a direct (non-iframe) load at the same width and rendered
   correctly, so the snapshot was a harness race, not an application defect. Any
   route marked `—` above simply was not individually run at that width.
3. **No pixel-level visual review.** The captured screenshots could not be viewed
   in this environment; verification is structural (DOM, headings, section order,
   overflow, error states), not visual.
4. **Empty-data paths were exercised naturally** (the seeded campus has data in
   most services); a deliberate empty-database pass was not run for every route.
5. No global toast primitive was added; `Modal` and `Sheet` cover dialogs.
