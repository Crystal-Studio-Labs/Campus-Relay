# ⚙️ Workflow, Policy & SLA Engines

> **The Configurable State Machine, Declarative Rules & Service Level Agreements**  
> *Authored by **Crystal Studio Labs** for BPUT Hackathon 2026 — Problem Statement 07 (Fretbox)*

[![Engines](https://img.shields.io/badge/Engines-State_Machine_%26_SLA-2563eb.svg?style=flat-square)](#case-state-machine)
[![Policy](https://img.shields.io/badge/Validation-Declarative_Clauses-10b981.svg?style=flat-square)](#policy-engine)
[![SLA](https://img.shields.io/badge/Compliance-Deterministic_SLA-f59e0b.svg?style=flat-square)](#sla-engine)
[![Contact](https://img.shields.io/badge/Support-connect.crystalstudio%40gmail.com-amber.svg?style=flat-square)](#-contact--institutional-support)

---

## 🧭 Navigation
[Root README](../../README.md) • [Documentation Hub](../README.md) • [Architecture](./architecture.md) • [Data Model](./data-model.md) • [Offline Sync](./offline-sync.md)

---

Campus Relay decouples domain logic into three interoperable engines: the **Workflow Engine**, the **Policy Engine**, and the **SLA Engine**. This modular design transforms the addition of new campus services from a software development task into a declarative configuration exercise.

---

## 🔄 Case State Machine

The case state machine is strictly governed by `app/models/enums.py::CaseStatus` and implemented in `app/services/case_engine.py`. Invalid state transitions are rejected with HTTP 400 at the service layer, guaranteeing that the database can never be coerced into an inconsistent operational state.

```mermaid
stateDiagram-v2
    [*] --> DRAFT
    DRAFT --> SUBMITTED : Submit
    SUBMITTED --> VALIDATING : System Intake
    VALIDATING --> CANCELLED : Policy Fails
    VALIDATING --> ROUTED : Policy Passes

    ROUTED --> ASSIGNED : Assign Staff
    ASSIGNED --> IN_PROGRESS : Technician Starts
    ASSIGNED --> WAITING_FOR_USER : Missing Info Needed
    ASSIGNED --> WAITING_FOR_APPROVAL : Formal Approval Required
    ASSIGNED --> ESCALATED : SLA Breached / Manager Step

    WAITING_FOR_USER --> IN_PROGRESS : User Responds
    WAITING_FOR_APPROVAL --> IN_PROGRESS : Approved
    ESCALATED --> IN_PROGRESS : Reallocated

    IN_PROGRESS --> RESOLVED : Work Completed
    RESOLVED --> VERIFICATION_REQUIRED : Notify Student

    VERIFICATION_REQUIRED --> CLOSED : Student Verified
    VERIFICATION_REQUIRED --> REOPENED : Issue Persists

    REOPENED --> IN_PROGRESS : Re-investigate
    CLOSED --> [*]
    CANCELLED --> [*]
```

### Derived Status Classifications
- **`OPEN_STATUSES`**: Cases actively in flight (`SUBMITTED`, `VALIDATING`, `ROUTED`, `ASSIGNED`, `IN_PROGRESS`, `WAITING_FOR_USER`, `WAITING_FOR_APPROVAL`, `ESCALATED`, `REOPENED`).
- **`PENDING_HUMAN_STATUSES`**: Cases currently blocked on human action (`WAITING_FOR_APPROVAL`, `WAITING_FOR_USER`, `VERIFICATION_REQUIRED`).
- **`CLOSED_STATUSES`**: Terminal states (`CLOSED`, `CANCELLED`).

> [!IMPORTANT]
> **Two Ironclad Behavioral Guarantees:**
> 1. **Requester Verification Guard**: A technician or supervisor cannot unilaterally mark a case permanently closed. The student who raised the ticket must verify the work, with the explicit option to reopen if the defect persists.
> 2. **Immutable Append-Only Audit Trail**: Every single transition emits a `CaseEvent` and `AuditLog` row. Both tables are protected by PostgreSQL triggers that reject all update and delete queries.

---

## 📋 Workflow Engine (`app/services/workflow.py`)

A `Workflow` represents an ordered series of `WorkflowStep` records. Each step declares a distinct `WorkflowStepType`:

| Step Type | Description & Behavior |
| :-- | :-- |
| `APPROVAL` | Pauses progress until authorized by a specific role (Warden, HOD, Registrar). |
| `ASSIGNMENT` | Routes the ticket to a designated department and technician queue. |
| `ACTION` | Requires physical or administrative task execution. |
| `RESOLUTION` | Technician marks the work complete and submits photographic evidence. |
| `VERIFICATION` | The requester inspects and confirms the resolution. |
| `NOTIFICATION` | Triggers targeted in-app and external delivery alerts. |

The workflow engine evaluates: *"Which step is this case currently on, which role is authorized to act next, and what fields are required?"* This state is exposed via `GET /cases/{id}/workflow`, enabling dynamic frontend button rendering without hardcoded business rules on the client.

---

## 🛡️ Policy Engine (`app/services/policy.py`)

The Policy Engine evaluates declarative rule sets against case parameters **prior to routing**. Each clause specifies a `field`, an operator (`op`), and an explanatory `message`.

### Supported Operators
- `required` / `truthy` / `falsy`
- `equals` / `not_equals`
- `gte` / `lte` / `in` / `not_in`

### Production Examples Shipped in Seed:
1. **Hostel Leave Policy**:
   - `leave_start` and `leave_end` must be valid timestamps.
   - `leave_end` must not precede `leave_start`.
   - `leave_start` cannot be in the past.
2. **Bonafide Certificate Policy**:
   - Student academic record must include registered branch and year.
   - Purpose string is mandatory.
   - Student dues balance must be zero; if non-zero, the policy halts generation and dispatches an alert to Accounts.
3. **Digital Gate Pass Policy**:
   - A valid, approved leave record must exist.
   - Anti-passback validation: passes cannot be scanned for duplicate exits without a verified intermediate entry.

> [!TIP]
> Because policy evaluations occur before routing, non-compliant requests fail fast with clear, human-readable explanations (e.g. *"Your academic year is missing in registrar records"*) rather than vague system errors.

---

## ⏱️ SLA Engine (`app/services/sla.py`)

The SLA Engine calculates deterministic due dates (`due_at`) based on the case's assigned `Service` and `Priority`.

```mermaid
flowchart LR
    Start([Ticket Created]) --> OnTime[ON_TIME: Under 75% Window]
    OnTime --> AtRisk[AT_RISK: Last 25% Window]
    AtRisk --> Breached[BREACHED: Past Target Window]

    OnTime -- "Resolved within target" --> Met([MET])
    AtRisk -- "Resolved within target" --> Met
    Breached -- "Resolved after target" --> Missed([MISSED])

    style Start fill:#2563eb,stroke:#1d4ed8,color:#ffffff
    style OnTime fill:#10b981,stroke:#047857,color:#ffffff
    style AtRisk fill:#f59e0b,stroke:#b45309,color:#ffffff
    style Breached fill:#ef4444,stroke:#b91c1c,color:#ffffff
    style Met fill:#059669,stroke:#064e3b,color:#ffffff
    style Missed fill:#991b1b,stroke:#7f1d1d,color:#ffffff
```

### Pre-Configured Demo SLA Windows
| Priority | Target Resolution Time | At-Risk Threshold |
| :-- | :-- | :-- |
| `CRITICAL` | 2 hours | Remaining time < 30 mins |
| `HIGH` | 8 hours | Remaining time < 2 hours |
| `NORMAL` | 24 hours | Remaining time < 6 hours |

- **Automated SLA Sweep**: `POST /admin/sla/sweep` crawls all open cases, calculates elapsed time against targets, and publishes `SLA_AT_RISK` and `SLA_BREACHED` audit events.
- **Time-Travel Testing**: The endpoint `POST /admin/demo/time-travel` advances the demo system clock by N days to facilitate rapid evaluation of SLA alerts during demonstrations.

---

## 📍 Putting It Together: Hostel Maintenance Walkthrough

```mermaid
flowchart TD
    Scan([Student scans room QR: CR-ROOM-AA-101]) --> Submitted[Status: SUBMITTED]
    Submitted --> PolicyCheck{Policy Check: Valid Location?}
    PolicyCheck -- "Missing" --> Fail[Reject with actionable error]
    PolicyCheck -- "Valid" --> Intake[AI Intake Agent: Plumbing • High Priority]
    Intake --> SLACalc[SLA Engine sets due_at: +8 Hours]
    SLACalc --> Routing[Routing Engine: Maintenance Dept -> Least-Loaded Tech]
    Routing --> Assigned[Status: ASSIGNED]
    Assigned --> TechStart[Technician clicks Start -> IN_PROGRESS]
    TechStart --> TechResolve[Technician fixes tap, uploads photo -> RESOLVED]
    TechResolve --> StudentCheck{Student checks resolution}
    StudentCheck -- "Tap works" --> Closed([Status: CLOSED])
    StudentCheck -- "Still leaking" --> Reopen[Status: REOPENED -> IN_PROGRESS]
    Reopen --> TechStart

    style Scan fill:#2563eb,stroke:#1d4ed8,color:#ffffff
    style Assigned fill:#0284c7,stroke:#0369a1,color:#ffffff
    style TechResolve fill:#f59e0b,stroke:#b45309,color:#ffffff
    style Closed fill:#10b981,stroke:#047857,color:#ffffff
    style Reopen fill:#ef4444,stroke:#b91c1c,color:#ffffff
```

---

### 📬 Contact & Institutional Support
- **Lead Organization**: **Crystal Studio Labs**
- **Direct Technical Inquiries**: [`connect.crystalstudio@gmail.com`](mailto:connect.crystalstudio@gmail.com)
- **Competition Track**: BPUT Hackathon 2026 — Problem Statement 07 (Fretbox)
- **Main Repository**: [GitHub: Crystal-Studio-Labs/Campus-Relay](https://github.com/Crystal-Studio-Labs/Campus-Relay)
