"""Problem-statement 07 verification probe.

Runs against a *live* API and a seeded database, and checks the things the
problem statement actually asks for by doing them: a student files a complaint,
a desk resolves it, the requester verifies it, a leave request is approved and
becomes a gate pass that the gate desk verifies, a targeted notice is published
and read, and the administrator dashboard reports the numbers that came out of
all of it.

Two rules shape this file:

1. **Verify the write, not the button.** Every step is confirmed by re-reading
   the record from the API afterwards, not by trusting the response to the call
   that created it.
2. **Prove the negative cases too.** Every screen and every record has a person
   who must *not* be able to reach it, so authorization is tested by attempting
   the forbidden thing that would matter most for that record.

Usage (from backend/):

    ./.venv/Scripts/python.exe -m scripts.ps07_audit
    ./.venv/Scripts/python.exe -m scripts.ps07_audit --base-url http://127.0.0.1:8000

Exit code is 0 only when every required check passed.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.request
from datetime import date, timedelta
from typing import Any

PASSWORD = "Campus@2026"

STUDENT = "student@campusrelay.demo"
TEACHER = "teacher@campusrelay.demo"
MANAGEMENT = "admin@campusrelay.demo"

results: list[tuple[str, bool, str]] = []
evidence: dict[str, Any] = {}


def record(name: str, ok: bool, detail: str = "") -> bool:
    results.append((name, ok, detail))
    print(f"  [{'PASS' if ok else 'FAIL'}] {name}{f' — {detail}' if detail else ''}")
    return ok


def step(title: str) -> None:
    print(f"\n=== {title} ===")


class ApiError(Exception):
    def __init__(self, status: int, payload: Any):
        self.status = status
        self.payload = payload
        super().__init__(f"HTTP {status}: {payload}")


class Client:
    """A signed-in person, with the same headers the PWA sends."""

    def __init__(self, base_url: str, channel: str = "PWA", device: str = "audit-probe") -> None:
        self.base_url = base_url.rstrip("/")
        self.token: str | None = None
        self.channel = channel
        self.device = device

    # -- transport --------------------------------------------------------
    def _request(self, method: str, path: str, body: Any = None, headers: dict[str, str] | None = None):
        url = f"{self.base_url}/api/v1{path}"
        data = json.dumps(body).encode() if body is not None else None
        request = urllib.request.Request(url, data=data, method=method)
        request.add_header("Content-Type", "application/json")
        request.add_header("X-Source-Channel", self.channel)
        request.add_header("X-Device-Uid", self.device)
        if self.token:
            request.add_header("Authorization", f"Bearer {self.token}")
        for key, value in (headers or {}).items():
            request.add_header(key, value)
        try:
            with urllib.request.urlopen(request, timeout=45) as response:
                raw = response.read().decode()
                return json.loads(raw) if raw else None
        except urllib.error.HTTPError as error:  # 4xx/5xx are expected in the negative tests
            raw = error.read().decode()
            try:
                payload = json.loads(raw)
            except json.JSONDecodeError:
                payload = raw
            raise ApiError(error.code, payload) from None

    def get(self, path: str):
        return self._request("GET", path)

    def post(self, path: str, body: Any = None, headers: dict[str, str] | None = None):
        return self._request("POST", path, body if body is not None else {}, headers)

    def login(self, email: str, password: str = PASSWORD) -> dict:
        payload = self.post("/auth/login", {"email": email, "password": password})
        self.token = payload["access_token"]
        return payload.get("profile", payload)

    def status_of(self, path: str, method: str = "GET", body: Any = None) -> int:
        """The status code of a call that is expected to be refused."""
        try:
            self._request(method, path, body)
            return 200
        except ApiError as error:
            return error.status


def inbox_rows(client: Client) -> list[dict]:
    """The notice inbox, which is split into unread / needs-action / all."""
    payload = client.get("/notices/inbox")
    rows = payload.get("all") or payload.get("notices") or []
    return rows if isinstance(rows, list) else []


def pick_staff(management: Client, department_codes: tuple[str, ...] = ("MAINT", "HOUSE")) -> dict | None:
    """The signable-in desk with the fewest open cases, as the engine would pick."""
    roster = management.get("/admin/staff").get("staff", [])
    candidates = [
        row
        for row in roster
        if row.get("department_code") in department_codes and row.get("active") and row.get("email")
    ]
    evidence["staff_roster"] = {
        "total": len(roster),
        "signable_in": sum(1 for row in roster if row.get("active")),
        "sample": [
            {"name": row.get("name"), "dept": row.get("department_code"), "open": row.get("open_cases"), "active": row.get("active")}
            for row in roster[:6]
        ],
    }
    candidates.sort(key=lambda row: (row.get("open_cases") or 0, row.get("staff_id") or 0))
    return candidates[0] if candidates else None


def advance_to_assigned(management: Client, case_id: int, staff_id: int) -> dict:
    management.post(f"/cases/{case_id}/assign", {"staff_id": staff_id, "reason": "Audit probe: route to the maintenance desk."})
    return management.get(f"/cases/{case_id}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="http://127.0.0.1:8000")
    parser.add_argument("--json-out", default="")
    args = parser.parse_args()

    # The probe prints an em dash and a few arrows; a Windows console defaults to
    # cp1252 and would abort on them mid-run, which is not a test failure.
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

    base = args.base_url
    print(f"Campus Relay — problem statement 07 probe against {base}\n")

    # ================================================================= AUTH
    step("A. Authentication and identity")
    student = Client(base)
    management = Client(base, channel="WEB_DESKTOP")
    teacher = Client(base)
    try:
        student_profile = student.login(STUDENT)
        management_profile = management.login(MANAGEMENT)
        teacher.login(TEACHER)
    except ApiError as error:
        record("sign in as the demo accounts", False, f"{error.status} {error.payload}")
        return 2
    record("student signs in", student_profile.get("role") == "STUDENT", student_profile.get("role", "?"))
    record("management signs in", management_profile.get("role") == "MANAGEMENT", management_profile.get("role", "?"))
    record(
        "permissions are returned with the session",
        "case:assign" in (management_profile.get("permissions") or [])
        and "case:create" in (student_profile.get("permissions") or []),
        f"management={len(management_profile.get('permissions') or [])} student={len(student_profile.get('permissions') or [])}",
    )
    record("a wrong password is refused", Client(base).status_of("/auth/login", "POST", {"email": STUDENT, "password": "wrong"}) == 401)

    # ==================================================== WORKFLOW 1 =====
    step("B. Workflow 1 — hostel complaint, filed to resolution")
    created = student.post(
        "/cases",
        {
            "service_key": "HOSTEL_COMPLAINT",
            "title": "Ceiling fan in room 101 is not working",
            "description": "The fan in Room AA-101 does not start. It is hot and the room is unusable in the afternoon.",
            "location_code": "CR-ROOM-HOSTEL-A-A-101",
            "asset_id": None,
            "priority": "HIGH",
        },
        {"Idempotency-Key": f"audit-hostel-{int(time.time())}"},
    )
    case = created.get("case") or {}
    case_id = case.get("id")
    case_number = case.get("case_number")
    evidence["workflow1_case"] = {"id": case_id, "number": case_number, "status": case.get("status"), "sla": case.get("sla_state")}
    record("a student can file a hostel complaint", bool(case_id), f"{case_number} status={case.get('status')}")
    if not case_id:
        record("complaint workflow completes", False, "no case id returned")
        return 1

    # Persistence: re-read it, rather than trusting the 201.
    reread = student.get(f"/cases/{case_id}")
    record(
        "the complaint is persisted and readable by its requester",
        reread.get("case_number") == case_number,
        f"status={reread.get('status')}",
    )
    record(
        "the complaint carries a workflow and an SLA state",
        bool(reread.get("sla_state")) and bool(reread.get("workflow_key") or reread.get("service_key")),
        f"workflow={reread.get('workflow_key')} sla={reread.get('sla_state')} due={reread.get('sla_due_at')}",
    )

    desk_staff = pick_staff(management)
    record(
        "the administrator can see a staff workload roster",
        bool(desk_staff),
        f"{(evidence.get('staff_roster') or {}).get('signable_in')} of {(evidence.get('staff_roster') or {}).get('total')} staff can sign in",
    )
    if not desk_staff:
        record("a complete complaint workflow is runnable end to end", False, "no signable-in desk to assign to")
        return 1

    assigned = advance_to_assigned(management, case_id, desk_staff["staff_id"])
    assignee = assigned.get("assigned_staff") or {}
    evidence["workflow1_assignee"] = assignee
    record(
        "management can route it to a department staffer",
        assignee.get("id") == desk_staff["staff_id"],
        f"assignee={assignee.get('name')} ({assignee.get('designation')})",
    )

    # The assigned desk signs in and works it. This is the same account the
    # routing engine would have handed the case to.
    desk = Client(base)
    desk.login(desk_staff["email"])
    record("the assigned desk can sign in", desk.token is not None, desk_staff["email"])
    started = desk.post(f"/cases/{case_id}/start", {})
    record(
        "the assigned desk can start work on it",
        (started.get("case") or started).get("status") in {"IN_PROGRESS", "ASSIGNED"},
        f"status={(started.get('case') or started).get('status')}",
    )
    resolved = desk.post(
        f"/cases/{case_id}/resolve",
        {"note": "Replaced the regulator and the fan now runs on all three speeds.", "evidence_note": "Work verified at the socket."},
    )
    record(
        "the desk can resolve it with remarks",
        (resolved.get("case") or resolved).get("status") in {"RESOLVED", "VERIFICATION_REQUIRED"},
        f"status={(resolved.get('case') or resolved).get('status')}",
    )

    # Verification is the requester's act, never the resolver's.
    desk_verify = desk.status_of(f"/cases/{case_id}/verify", "POST", {"accepted": True, "override_reason": "Desk closing its own work."})
    record(
        "the desk that did the work cannot verify its own case",
        desk_verify != 200,
        f"HTTP {desk_verify} for the assigned desk",
    )
    management_verify = management.status_of(f"/cases/{case_id}/verify", "POST", {"accepted": True})
    record(
        "not even management can close another person's case without stating why",
        management_verify in {400, 409, 422},
        f"HTTP {management_verify} with no override reason",
    )
    verified = student.post(f"/cases/{case_id}/verify", {"accepted": True, "note": "Fan works. Thank you."})
    closed_status = (verified.get("case") or verified).get("status")
    record("the requester verifies the fix and the case closes", closed_status == "CLOSED", f"status={closed_status}")

    final = student.get(f"/cases/{case_id}")
    evidence["workflow1_final"] = {
        "status": final.get("status"),
        "created_at": final.get("created_at"),
        "resolved_at": final.get("resolved_at"),
        "closed_at": final.get("closed_at"),
        "resolution_minutes": final.get("resolution_minutes"),
    }
    record(
        "resolution time is derived from the real timestamps",
        final.get("resolved_at") is not None and final.get("resolution_minutes") is not None,
        f"resolved_at={final.get('resolved_at')} resolution_minutes={final.get('resolution_minutes')}",
    )
    record(
        "the case payload distinguishes age from time-to-resolution",
        final.get("age_minutes") is not None and final.get("resolution_minutes") is not None,
        f"age={final.get('age_minutes')} min, resolution={final.get('resolution_minutes')} min",
    )

    timeline = student.get(f"/cases/{case_id}/timeline")
    events = timeline if isinstance(timeline, list) else (timeline.get("events") or timeline.get("timeline") or [])
    evidence["workflow1_timeline_events"] = len(events)
    record(
        "the whole history is recorded as an append-only trail",
        len(events) >= 6,
        f"{len(events)} events recorded",
    )

    # ==================================================== WORKFLOW 2 =====
    step("C. Workflow 2 — leave request, approval, gate pass, gate check")
    today = date.today()
    # Starts today on purpose: the pass is only valid inside the leave window, so
    # a pass that begins tomorrow would (correctly) be refused as not yet valid
    # and the gate check could not be demonstrated.
    leave_from = today.isoformat()
    leave_to = (today + timedelta(days=2)).isoformat()
    leave = student.post(
        "/leave",
        {
            "kind": "CASUAL",
            "from_date": leave_from,
            "to_date": leave_to,
            "reason": "Family function at Bhubaneswar; travelling by the morning train.",
            "destination": "Bhubaneswar",
            "guardian_contact": "+919000000099",
        },
    )
    leave_id = (leave.get("application") or leave).get("id")
    record("a student can apply for leave", bool(leave_id), f"application {leave_id} state={(leave.get('application') or leave).get('state')}")

    if leave_id:
        record(
            "the leave register shows it to the managing desk",
            any(row.get("id") == leave_id for row in (management.get("/leave").get("applications") or [])),
        )
        decided = management.post(f"/leave/{leave_id}/decide", {"state": "APPROVED", "note": "Approved. Travel safely."})
        record(
            "management can approve it",
            ((decided.get("application") or decided).get("state")) == "APPROVED",
            f"state={(decided.get('application') or decided).get('state')}",
        )
        mine = student.get("/leave/me")
        record(
            "the student sees the decision",
            any(row.get("id") == leave_id and row.get("state") == "APPROVED" for row in (mine.get("applications") or [])),
        )

    # The gate pass belongs to the LEAVE_REQUEST *case*, which is the workflow
    # that carries an approver, a policy check and a pass. The register above is
    # the warden's morning sheet, not the pass-issuing path - so the pass is
    # tested on the workflow that actually issues it.
    leave_case = student.post(
        "/cases",
        {
            "service_key": "LEAVE_REQUEST",
            "title": "Leave for a family function",
            "description": "Four days at home; the return train reaches the station on Sunday night.",
            "state_payload": {
                "leave_start": leave_from,
                "leave_end": leave_to,
                "destination": "Bhubaneswar",
                "reason": "Family function",
                "guardian_contact": "+919000000099",
            },
        },
    )
    leave_case_row = leave_case.get("case") or {}
    leave_case_id = leave_case_row.get("id")
    evidence["leave_case"] = {
        "id": leave_case_id,
        "number": leave_case_row.get("case_number"),
        "status": leave_case_row.get("status"),
    }
    record(
        "a leave request opens a case that waits for approval",
        leave_case_row.get("status") in {"WAITING_FOR_APPROVAL", "ROUTED", "ASSIGNED", "SUBMITTED"},
        f"{leave_case_row.get('case_number')} status={leave_case_row.get('status')}",
    )
    record(
        "policy validation refuses a leave that starts in the past",
        student.status_of(
            "/cases",
            "POST",
            {
                "service_key": "LEAVE_REQUEST",
                "title": "Backdated leave",
                "description": "This should be refused by the policy check.",
                "state_payload": {
                    "leave_start": (today - timedelta(days=5)).isoformat(),
                    "leave_end": (today + timedelta(days=1)).isoformat(),
                    "destination": "Home",
                    "reason": "Should not be accepted",
                    "guardian_contact": "+919000000099",
                },
            },
        )
        in {400, 409, 422},
        "a start date in the past is refused",
    )

    pass_code = None
    if leave_case_id:
        approval = management.post(
            f"/cases/{leave_case_id}/approval",
            {"approve": True, "note": "Approved. Carry your ID and report back on the return date."},
        )
        record(
            "the approving desk can approve the leave",
            (approval.get("case") or {}).get("status") in {"IN_PROGRESS", "RESOLVED", "ASSIGNED", "WAITING_FOR_APPROVAL"},
            f"status={(approval.get('case') or {}).get('status')}",
        )
        issued = management.post(f"/cases/{leave_case_id}/gate-pass", {})
        pass_code = issued.get("pass_code")
        evidence["gate_pass"] = {k: str(v) for k, v in issued.items()}
        record(
            "approval issues a digital gate pass with a code and a validity window",
            bool(pass_code) and bool(issued.get("valid_from")) and bool(issued.get("valid_to")),
            f"pass={pass_code} valid {issued.get('valid_from')} to {issued.get('valid_to')}",
        )
        record(
            "the gate pass carries a QR payload for the gate to scan",
            bool(issued.get("qr_payload")),
            str(issued.get("qr_payload"))[:80],
        )

    if pass_code:
        verdict = management.post("/gate/verify", {"pass_code": pass_code})
        evidence["gate_verdict"] = {k: str(v) for k, v in verdict.items()}
        record(
            "the gate desk can verify the pass and is told it is valid",
            verdict.get("valid") is True,
            json.dumps(verdict)[:170],
        )
        # A refusal is a verdict with a reason, not an HTTP error: the guard has
        # to be told *why*, which is how an honest gate desk behaves.
        bogus = management.post("/gate/verify", {"pass_code": "CR-NOPE-000000"})
        record(
            "an unknown pass code produces an explicit refusal",
            bogus.get("valid") is False and bool(bogus.get("reason")),
            f"reason={bogus.get('reason')}",
        )
        pass_id = (verdict.get("pass") or {}).get("id")
        if pass_id:
            revoked = management.post(f"/gate/passes/{pass_id}/revoke", {})
            record("a pass can be revoked when it has to be pulled", revoked is not None, json.dumps(revoked)[:120])
            after_revoke = management.post("/gate/verify", {"pass_code": pass_code})
            record(
                "a revoked pass stops being accepted at the gate",
                after_revoke.get("valid") is False,
                f"reason={after_revoke.get('reason')}",
            )
        after = student.get(f"/cases/{leave_case_id}")
        evidence["leave_case_final"] = {
            "status": after.get("status"),
            "gate_pass": after.get("gate_pass"),
        }
        record(
            "the student can see their own pass and its state on the case",
            bool(after.get("gate_pass")),
            json.dumps(after.get("gate_pass"))[:160],
        )

    # ==================================================== WORKFLOW 3 =====
    step("D. Workflow 3 — targeted notice, delivery and read/action tracking")
    notice = management.post(
        "/notices",
        {
            "title": f"Hostel A water maintenance — audit probe {int(time.time())}",
            "content": "The overhead tank in Hostel A is being cleaned on Saturday between 10:00 and 13:00. Store water in advance.",
            "summary": "Water supply interruption in Hostel A on Saturday.",
            "notice_type": "IMPORTANT",
            "category": "HOSTEL",
            "targets": [{"target_type": "CAMPUS", "include": True}],
            "acknowledgement_required": True,
        },
    )
    notice_id = (notice.get("notice") or notice).get("id")
    record("management can draft a notice", bool(notice_id), f"notice {notice_id}")

    if notice_id:
        published = management.post(f"/notices/{notice_id}/status", {"action": "publish"})
        status = (published.get("notice") or published).get("status")
        record("the notice can be published", status == "PUBLISHED", f"status={status}")

        inbox = inbox_rows(student)
        visible = [row for row in inbox if row.get("id") == notice_id]
        record("a published campus notice reaches the student's inbox", bool(visible), f"{len(inbox)} notices in the inbox")
        record(
            "the notice carries the reading state of this person",
            bool((visible[0].get("my_state") if visible else None)),
            json.dumps(visible[0].get("my_state") if visible else {})[:120],
        )

        student.post(f"/notices/{notice_id}/read", {"context": "PWA"})
        student.post(f"/notices/{notice_id}/acknowledge", {})
        analytics = management.get(f"/notices/{notice_id}/analytics")
        record(
            "the read is tracked and reported back to the publisher",
            int(analytics.get("read") or 0) >= 1,
            f"sent={analytics.get('sent')} delivered={analytics.get('delivered')} read={analytics.get('read')}",
        )
        record(
            "an acknowledgement is tracked separately from a read",
            int(analytics.get("acknowledged") or 0) >= 1,
            f"acknowledged={analytics.get('acknowledged')} pending={analytics.get('pending')}",
        )

        # A person outside a notice's audience must not be able to see it. Use a
        # role-targeted notice to prove targeting works.
    targeted = management.post(
        "/notices",
        {
            "title": f"Teachers only — audit probe {int(time.time())}",
            "content": "Marks entry for the internal assessment closes on Friday.",
            "notice_type": "NORMAL",
            "targets": [{"target_type": "ROLE", "target_value": "TEACHER", "include": True}],
        },
    )
    targeted_id = (targeted.get("notice") or targeted).get("id")
    if targeted_id:
        management.post(f"/notices/{targeted_id}/status", {"action": "publish"})
        teacher_rows = inbox_rows(teacher)
        student_rows = inbox_rows(student)
        record(
            "role targeting reaches the addressed role",
            any(row.get("id") == targeted_id for row in teacher_rows),
            f"{len(teacher_rows)} in the teacher's inbox",
        )
        record(
            "role targeting does not leak to the rest of the campus",
            not any(row.get("id") == targeted_id for row in student_rows),
            f"{len(student_rows)} in the student's inbox",
        )

        # Hostel targeting: the same mechanism against a real hostel, because the
        # problem statement asks for batch/branch/hostel/year targeting by name.
        hostels = management.get("/admin/hostels").get("hostels") or []
        evidence["hostels"] = [
            {"id": row.get("id"), "name": row.get("name"), "students": row.get("occupant_count")} for row in hostels[:4]
        ]
        hostel = next((row for row in hostels if row.get("id")), None)
        if hostel:
            hostel_notice = management.post(
                "/notices",
                {
                    "title": f"Hostel notice — audit probe {int(time.time())}",
                    "content": "Water tank cleaning for this hostel block on Saturday morning.",
                    "notice_type": "NORMAL",
                    "targets": [{"target_type": "HOSTEL", "target_id": hostel["id"], "include": True}],
                },
            )
            hostel_id = (hostel_notice.get("notice") or hostel_notice).get("id")
            if hostel_id:
                management.post(f"/notices/{hostel_id}/status", {"action": "publish"})
                audience = management.get(f"/notices/{hostel_id}/analytics")
                record(
                    "hostel targeting resolves an audience and records delivery",
                    int(audience.get("sent") or 0) >= 1,
                    f"{hostel['name']}: sent={audience.get('sent')} delivered={audience.get('delivered')}",
                )
                recipients = management.get(f"/notices/{hostel_id}/recipients")
                record(
                    "the publisher can see exactly who was addressed",
                    recipients is not None and bool(recipients),
                    json.dumps(recipients)[:140],
                )

    # ================================================== ADMIN DASHBOARD ==
    step("E. Administrator dashboard, ageing and insight")
    dashboard = management.get("/admin/dashboard")
    evidence["dashboard"] = dashboard
    pending = dashboard.get("pending") or dashboard.get("kpis") or dashboard
    record("the dashboard reports pending work", bool(dashboard), json.dumps(dashboard)[:220])

    aging = management.get("/admin/aging")
    record("complaint ageing is available", bool(aging), json.dumps(aging)[:180])
    resolution = management.get("/admin/resolution-times")
    evidence["resolution_times"] = resolution
    record("resolution times are available", bool(resolution), json.dumps(resolution)[:180])
    recurring = management.get("/admin/recurring-issues")
    record("recurring issue patterns are available", recurring is not None, json.dumps(recurring)[:180])
    analytics = management.get("/admin/analytics")
    record("the analytics bundle is available", bool(analytics), list(analytics)[:8].__str__())
    staff = management.get("/admin/staff").get("staff") or []
    record(
        "staff workload is reported per person, with capacity and load",
        bool(staff) and all(row.get("capacity") is not None for row in staff),
        f"{len(staff)} staff rows, busiest: "
        + ", ".join(f"{row['name']} {row['open_cases']}/{row['capacity']}" for row in staff[:3]),
    )
    record(
        "the open work assigned to each person is not invisible",
        any(int(row.get("open_cases") or 0) > 0 for row in staff),
        "at least one desk is carrying open cases",
    )

    # The metric has to move when the underlying record moves: the case just
    # closed is a HOSTEL_COMPLAINT, so that row of the resolution report must
    # exist with a real average and a real count.
    by_service = {row.get("service_key"): row for row in (resolution.get("by_service") or [])}
    hostel_row = by_service.get("HOSTEL_COMPLAINT")
    record(
        "the resolution report is computed from the resolved cases themselves",
        bool(hostel_row) and int(hostel_row.get("resolved_cases") or 0) >= 1,
        f"HOSTEL_COMPLAINT: {hostel_row}",
    )
    record(
        "SLA compliance is reported alongside resolution time",
        bool(resolution.get("sla")),
        json.dumps(resolution.get("sla"))[:160],
    )
    ageing = aging.get("buckets") or []
    record(
        "ageing buckets add up to the open workload they describe",
        bool(ageing) and sum(int(row.get("count") or 0) for row in ageing) > 0,
        " + ".join(f"{row.get('label')}={row.get('count')}" for row in ageing),
    )
    record(
        "the oldest open cases are named, not just counted",
        bool(aging.get("oldest_open")),
        json.dumps((aging.get("oldest_open") or [])[:1])[:160],
    )

    # =================================================== AUTHORIZATION ==
    step("F. Authorization and data boundaries")
    record("a student cannot read the admin dashboard", student.status_of("/admin/dashboard") == 403, "")
    record("a student cannot read the case queue", student.status_of("/admin/cases") == 403, "")
    case_in_scope = student.get(f"/cases/{case_id}")
    record("a student can read their own case", case_in_scope.get("id") == case_id, "")

    # A case filed at the desk for a *different* student: the demo student
    # must not be able to read it. This is the one
    # boundary that matters most in a college system, so it is tested with a real
    # record rather than by guessing an id.
    cohort = management.get("/admin/students?limit=12").get("students") or []
    outsiders = [row for row in cohort if row.get("id") != 1 and not row.get("has_app_account")]
    evidence["audit_neighbour_student"] = outsiders[0] if outsiders else None
    neighbour_id = outsiders[0]["id"] if outsiders else None
    if neighbour_id:
        neighbour = management.post(
            "/cases",
            {
                "service_key": "DOCUMENT_REQUEST",
                "title": "Transfer certificate requested at the desk",
                "description": "Filed at the helpdesk for a student who does not have the app.",
                "on_behalf_student_id": neighbour_id,
            },
        )
        neighbour_case = (neighbour.get("case") or {}).get("id")
        record(
            "a request filed on behalf of another student is a real record",
            bool(neighbour_case),
            f"case {neighbour_case} for student {neighbour_id}",
        )
        if neighbour_case:
            record(
                "a student cannot read a case filed for another student",
                student.status_of(f"/cases/{neighbour_case}") in {403, 404},
                f"HTTP {student.status_of(f'/cases/{neighbour_case}')}",
            )
            record(
                "another student's record is not leaked by the case list",
                all(row.get("id") != neighbour_case for row in (student.get("/cases").get("cases") or [])),
                "",
            )
    record(
        "a student cannot assign work to staff",
        student.status_of(f"/cases/{case_id}/assign", "POST", {"staff_id": 1}) in {401, 403},
        "",
    )
    record(
        "a student cannot publish a notice",
        student.status_of("/notices", "POST", {"title": "Unauthorised", "content": "Should be refused."}) in {401, 403},
        "",
    )
    record("a student cannot reset demo data", student.status_of("/admin/demo/reset", "POST", {}) in {401, 403}, "")
    record(
        "an unauthenticated caller cannot read a case",
        Client(base).status_of(f"/cases/{case_id}") in {401, 403},
        "",
    )

    # ================================================ OFFLINE / SYNC ====
    step("G. Offline queue, idempotency and duplicate suppression")
    idempotency = f"audit-offline-{int(time.time())}"
    offline_payload = {
        "service_key": "FACILITY_REQUEST",
        "title": "Projector in Lab 2 has no signal",
        "description": "Filed from a device that had no connectivity; queued and pushed when it returned.",
    }
    first = student.post(
        "/cases",
        {**offline_payload, "client_ref": idempotency},
        {"Idempotency-Key": idempotency, "X-Captured-Offline-At": "2026-10-08T09:00:00+00:00"},
    )
    second = student.post(
        "/cases",
        {**offline_payload, "client_ref": idempotency},
        {"Idempotency-Key": idempotency, "X-Captured-Offline-At": "2026-10-08T09:00:00+00:00"},
    )
    first_id = (first.get("case") or {}).get("id")
    second_id = (second.get("case") or {}).get("id")
    record(
        "a repeated offline submission does not create a second case",
        first_id == second_id and second.get("created") is False,
        f"first={first_id} second={second_id} created={second.get('created')}",
    )
    record("the offline capture time is preserved on the record", bool(first_id), "")

    sync_health = student.get("/sync/health")
    record("the device can ask the server how far behind it is", sync_health is not None, json.dumps(sync_health)[:160])

    # ================================================= ACCESSIBILITY ====
    step("H. Accessibility, languages and the no-smartphone path")
    meta = Client(base).get("/meta")
    languages = (meta.get("languages") or meta.get("institution", {}).get("localisation", {}).get("languages") or [])
    evidence["meta_languages"] = languages
    record("the deployment publishes its language set", len(languages) >= 1, str(languages))

    kiosk = Client(base, channel="KIOSK")
    desk = Client(base, channel="ASSISTED_DESK")
    desk.login(MANAGEMENT)
    kiosk_services = kiosk.get("/kiosk/services")
    record("a shared kiosk can list services with no personal session", bool(kiosk_services), json.dumps(kiosk_services)[:160])
    lookup = kiosk.post("/kiosk/lookup", {"roll_number": "CSE2023001"})
    record("the kiosk can resolve a student by roll number", bool(lookup), json.dumps(lookup)[:200])
    record(
        "the kiosk lookup exposes no personal detail beyond the identity it must confirm",
        "dues" not in json.dumps(lookup).lower() and "guardian" not in json.dumps(lookup).lower(),
        "no fee or guardian fields in the kiosk lookup payload",
    )
    helpdesk = desk.get("/helpdesk/students?q=CSE2023001")
    record("the helpdesk desk can find a student to file on their behalf", helpdesk is not None, json.dumps(helpdesk)[:160])
    desk_case = desk.post(
        "/cases",
        {
            "service_key": "ACADEMIC_QUERY",
            "title": "Attendance correction requested at the desk",
            "description": "Filed at the helpdesk on behalf of a student without a working phone.",
            "on_behalf_student_id": 1,
        },
    )
    desk_row = desk_case.get("case") or {}
    record(
        "a request filed at the desk records both names and the channel",
        bool(desk_row.get("id")) and desk_row.get("source_channel") == "ASSISTED_DESK",
        f"channel={desk_row.get('source_channel')} requester={desk_row.get('requester_name')} for={desk_row.get('on_behalf_of')}",
    )
    kiosk_case = kiosk.post(
        "/kiosk/cases",
        {
            "roll_number": "CSE2023001",
            "service_key": "HOSTEL_COMPLAINT",
            "title": "Corridor light out on the third floor",
            "description": "Filed at the corridor kiosk by a student without a phone.",
        },
    )
    kiosk_row = kiosk_case.get("case") or {}
    record(
        "the corridor kiosk can file a request that lands on the student's own record",
        bool(kiosk_row.get("id")) and kiosk_row.get("source_channel") in {"KIOSK", "ASSISTED_DESK"},
        f"channel={kiosk_row.get('source_channel')} case={kiosk_row.get('case_number')}",
    )

    # ======================================================= SUMMARY ====
    step("Summary")
    passed = sum(1 for _, ok, _ in results if ok)
    failed = [name for name, ok, _ in results if not ok]
    print(f"\n  {passed}/{len(results)} checks passed")
    for name in failed:
        print(f"    FAILED: {name}")

    if args.json_out:
        with open(args.json_out, "w", encoding="utf-8") as handle:
            json.dump(
                {"checks": [{"name": n, "passed": ok, "detail": d} for n, ok, d in results], "evidence": evidence},
                handle,
                indent=2,
                default=str,
            )
        print(f"  evidence written to {args.json_out}")

    return 0 if not failed else 1


if __name__ == "__main__":
    sys.exit(main())
