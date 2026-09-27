/** Guided tours, the feature catalogue and the device support matrix.
 *
 *  All three live in data, not in components, for one reason: the guide must be
 *  able to describe the product without the product being rewritten every time a
 *  screen moves. A step is "look at this element, here is why it exists".
 *
 *  Selectors point at `[data-guide="..."]` attributes. If an element is missing
 *  (wrong role, wrong device), the tour skips that step instead of stalling -
 *  a guide that breaks on an admin's phone is worse than no guide.
 */

export interface TourStep {
  /** CSS selector for the element to spotlight. */
  target: string
  title: string
  body: string
  placement?: 'bottom' | 'top' | 'auto'
}

export interface Tour {
  id: string
  name: string
  audience: string
  summary: string
  /** Route to open before starting, so the tour always starts where it should. */
  route: string
  steps: TourStep[]
}

export const TOURS: Tour[] = [
  {
    id: 'student-home',
    name: 'Student: from problem to proof',
    audience: 'Student',
    summary: 'File a request, watch it move, and confirm the fix. Includes the offline path.',
    route: '/',
    steps: [
      {
        target: '[data-guide="home-greeting"]',
        title: 'Your own record',
        body: 'Your name, roll number and hostel room are shown here. Nothing else about you is exposed on this screen.',
      },
      {
        target: '[data-guide="home-new-request"]',
        title: 'One button to raise anything',
        body: 'Complaints, certificates, leave — same button. You describe the problem; the system works out who owns it.',
      },
      {
        target: '[data-guide="home-waiting"]',
        title: 'What is waiting on you',
        body: 'When work is marked done, you are asked to confirm it. That verification step is what closes a case honestly.',
      },
      {
        target: '[data-guide="home-metrics"]',
        title: 'Your numbers',
        body: 'How many requests are open, how many alerts are unread, and which notices need your acknowledgement.',
      },
      {
        target: '[data-guide="home-shortcuts"]',
        title: 'Common requests',
        body: 'Shortcuts to the three requests students raise most. Two taps instead of six.',
      },
    ],
  },
  {
    id: 'student-report',
    name: 'Filing a request (and filing one offline)',
    audience: 'Student',
    summary: 'Free text in, routed case out. Then the same request filed with no network at all.',
    route: '/report',
    steps: [
      {
        target: '[data-guide="report-describe"]',
        title: 'Describe it in your words',
        body: 'Write it the way you would tell a friend. "Suggest category" reads it and proposes a service, urgency and location.',
      },
      {
        target: '[data-guide="report-services"]',
        title: 'Or choose it yourself',
        body: 'Every service you are allowed to raise, with the institution\'s own response target shown later on the case.',
      },
      {
        target: '[data-guide="report-offline"]',
        title: 'No signal? Keep going.',
        body: 'Submit anyway. The request is stored on this device with a reference you can see, then filed automatically — exactly once — when the network returns.',
      },
    ],
  },
  {
    id: 'student-case',
    name: 'Following a case',
    audience: 'Student, staff, admin',
    summary: 'The same case screen for everyone, with only the permitted actions shown.',
    route: '/cases',
    steps: [
      {
        target: '[data-guide="case-header"]',
        title: 'Status, urgency and the clock',
        body: 'The service target is the institution\'s own number. This bar shows how much of it is left, not a vendor benchmark.',
      },
      {
        target: '[data-guide="case-actions"]',
        title: 'Only what you are allowed to do',
        body: 'This list is built from the permissions the server issued — not from a role name hardcoded in the app.',
      },
      {
        target: '[data-guide="case-timeline"]',
        title: 'Nothing is summarised away',
        body: 'Every status change, escalation, assignment and verification, with who did it and when. Append-only, on the server.',
      },
    ],
  },
  {
    id: 'admin-command',
    name: 'Admin: the command centre',
    audience: 'Admin, warden, department head',
    summary: 'What is broken, who is overloaded, what is about to breach, and what keeps coming back.',
    route: '/operations',
    steps: [
      {
        target: '[data-guide="admin-metrics"]',
        title: 'The morning read',
        body: 'Open, breached, at risk, unassigned, waiting on an approval. Each tile is a filter, not a decoration — tap it to work the list.',
      },
      {
        target: '[data-guide="admin-tabs"]',
        title: 'Three questions, three views',
        body: 'Overview for the numbers, Teams & load for capacity, Recurring problems for the root cause nobody has fixed.',
      },
      {
        target: '[data-guide="admin-briefing"]',
        title: 'Agent briefing — advisory only',
        body: 'Written from the same tables you are looking at, with its findings listed. It recommends; it never writes. Every recommendation states why.',
      },
    ],
  },
  {
    id: 'staff-tasks',
    name: 'Staff: the working day',
    audience: 'Staff, technician',
    summary: 'Only your cases, ordered by what will breach first, usable in a basement.',
    route: '/tasks',
    steps: [
      {
        target: '[data-guide="tasks-tabs"]',
        title: 'Sorted by consequence',
        body: 'Needs attention first — breached and at-risk work — then what is in progress, then what you closed recently.',
      },
      {
        target: '[data-guide="tasks-card"]',
        title: 'Enough to act, no more',
        body: 'Location, room, the person waiting and how long it has been open. Both actions here work with no signal; the note you write survives too.',
      },
    ],
  },
  {
    id: 'security-gate',
    name: 'Security: the gate',
    audience: 'Security',
    summary: 'One input, one enormous verdict, and a register that stays true even offline.',
    route: '/gate',
    steps: [
      {
        target: '[data-guide="gate-input"]',
        title: 'Verify, do not guess',
        body: 'Type the pass code or scan the QR. Offline, verification is refused rather than assumed — admitting on an unverifiable pass is the one mistake a gate cannot undo.',
      },
      {
        target: '[data-guide="gate-tabs"]',
        title: 'Who is out right now',
        body: 'The figure the desk actually watches, built from real movements. Refused movements are recorded too, with the reason.',
      },
    ],
  },
  {
    id: 'kiosk',
    name: 'Kiosk: no phone required',
    audience: 'Everyone (public tablet)',
    summary: 'Assisted access for a student with no working device — three taps deep.',
    route: '/kiosk',
    steps: [
      {
        target: '[data-guide="kiosk-id"]',
        title: 'Roll number only',
        body: 'No app, no login, no data pack. The kiosk identifies the student, files on their behalf and prints a receipt.',
      },
      {
        target: '[data-guide="kiosk-tiles"]',
        title: 'The same services, bigger',
        body: 'Giant targets for a cheap tablet with a cracked screen and a queue behind you. The case is an ordinary case — only the recorded channel differs.',
      },
    ],
  },
  {
    id: 'offline',
    name: 'Offline: what really happens',
    audience: 'Everyone',
    summary: 'The queue, the idempotency key, and why a double tap cannot create two cases.',
    route: '/sync',
    steps: [
      {
        target: '[data-guide="sync-metrics"]',
        title: 'The honest scoreboard',
        body: 'Waiting, retrying, conflicts, synced. If something has not reached the server, this screen says so instead of pretending.',
      },
      {
        target: '[data-guide="sync-tabs"]',
        title: 'Both sides of the story',
        body: 'This device\'s queue next to the server\'s own operation record, so a disagreement can be seen from either end.',
      },
    ],
  },
  {
    id: 'notices',
    name: 'Notices that can be proven read',
    audience: 'Everyone',
    summary: 'Targeted announcements with a lifecycle and per-person tracking.',
    route: '/notices',
    steps: [
      {
        target: '[data-guide="notices-tabs"]',
        title: 'Addressed to you, not shouted at everyone',
        body: 'Notices are matched to your hostel, branch, year or role. "Needs action" holds anything requiring acknowledgement or a follow-up.',
      },
      {
        target: '[data-guide="notices-list"]',
        title: 'Read rates are real',
        body: 'Every open is recorded. If a notice was seen by 12 of 300 people, that is the number you get — and a reason to change the channel.',
      },
    ],
  },
]

/** Feature support matrix. Honest by design: "partial" and "no" are stated. */
export interface FeatureRow {
  feature: string
  mobile: string
  tablet: string
  desktop: string
  kiosk: string
  offline: string
  note: string
}

export const FEATURE_MATRIX: FeatureRow[] = [
  {
    feature: 'Raise a request',
    mobile: 'yes',
    tablet: 'yes',
    desktop: 'yes',
    kiosk: 'yes (by roll number)',
    offline: 'yes — queued with a device reference',
    note: 'Kiosk and helpdesk file on behalf of a student; the channel is recorded.',
  },
  {
    feature: 'Attach photo evidence',
    mobile: 'yes (camera)',
    tablet: 'yes',
    desktop: 'yes',
    kiosk: 'no',
    offline: 'no — needs the server to store the file',
    note: 'Offline text still goes; the app tells you the photo has to wait.',
  },
  {
    feature: 'Follow a case timeline',
    mobile: 'yes',
    tablet: 'yes',
    desktop: 'yes',
    kiosk: 'summary only',
    offline: 'last known state, marked as cached',
    note: 'Cached screens are labelled so stale data is never mistaken for live data.',
  },
  {
    feature: 'Verify a resolution',
    mobile: 'yes',
    tablet: 'yes',
    desktop: 'yes',
    kiosk: 'no',
    offline: 'yes — sent when you reconnect',
    note: 'Verification is recorded with the time it actually happened.',
  },
  {
    feature: 'Triage queue & bulk escalate',
    mobile: 'read + single actions',
    tablet: 'yes',
    desktop: 'yes (dense table)',
    kiosk: 'no',
    offline: 'no — admin actions need the live queue',
    note: 'The same table becomes cards on a phone rather than a sideways scroll.',
  },
  {
    feature: 'Approve / reject',
    mobile: 'yes',
    tablet: 'yes',
    desktop: 'yes',
    kiosk: 'no',
    offline: 'no',
    note: 'Approvals carry a note to the requester and stay on the record.',
  },
  {
    feature: 'Publish a targeted notice',
    mobile: 'yes',
    tablet: 'yes',
    desktop: 'yes',
    kiosk: 'no',
    offline: 'no',
    note: 'The studio counts the audience before publishing.',
  },
  {
    feature: 'Gate verification & movements',
    mobile: 'yes (primary)',
    tablet: 'yes',
    desktop: 'yes',
    kiosk: 'no',
    offline: 'movements queue; verification refuses',
    note: 'Deliberate: an offline gate must not admit on an unverifiable pass.',
  },
  {
    feature: 'Assistant (tool-backed answers)',
    mobile: 'yes',
    tablet: 'yes',
    desktop: 'yes',
    kiosk: 'no',
    offline: 'no — needs the lookups',
    note: 'Every answer lists its evidence, including failed lookups.',
  },
  {
    feature: 'Audit trail',
    mobile: 'yes',
    tablet: 'yes',
    desktop: 'yes (best)',
    kiosk: 'no',
    offline: 'no',
    note: 'Append-only in the database; enforced by trigger, not application code.',
  },
]

export interface DevicePreset {
  id: string
  label: string
  width: number
  height: number
  note: string
}

/** Real device classes we actually design for. */
export const DEVICE_PRESETS: DevicePreset[] = [
  {
    id: 'phone',
    label: 'Phone — 390 × 844',
    width: 390,
    height: 844,
    note: 'Bottom tab bar, single column, thumb-reachable primary action, fileable offline.',
  },
  {
    id: 'tablet',
    label: 'Tablet — 768 × 1024',
    width: 768,
    height: 1024,
    note: 'Two-column card grid, sidebar navigation appears, kiosk-style targets stay large.',
  },
  {
    id: 'laptop',
    label: 'Laptop — 1280 × 800',
    width: 1280,
    height: 800,
    note: 'Sidebar plus dense tables; the admin queue is designed for this width.',
  },
  {
    id: 'workstation',
    label: 'Workstation — 1600 × 900',
    width: 1600,
    height: 900,
    note: 'Three-column card grid, wider page container, charts at full width.',
  },
  {
    id: 'kiosk',
    label: 'Kiosk tablet — 1080 × 720 (landscape)',
    width: 1080,
    height: 720,
    note: 'Kiosk shell: no navigation, giant targets, idle reset after 90 seconds.',
  },
]
