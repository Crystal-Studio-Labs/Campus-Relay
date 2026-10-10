/** Guided tours, the feature catalogue and the device support matrix.
 *
 *  A tour is a sequence of steps, and a step is "look at this element, here is
 *  why it exists and what to do with it". The tutorial prose is the product
 *  documentation for the people who never read documentation: every step says
 *  what the screen is for, then what to tap.
 *
 *  WHO GETS A GUIDE
 *  ----------------
 *  Tours are written for the two roles who arrive without training: students
 *  and teachers. The operations screens (command centre, gate desk,
 *  kiosk, notice studio) are staffed desks with their own onboarding, so they
 *  deliberately carry no guide - a tour of a screen nobody needs a tour of is
 *  noise. `roles` is enforced in the shell, the overlay and the guide page.
 *
 *  STEPS MAY LIVE ON ANOTHER SCREEN
 *  --------------------------------
 *  A step may name the `route` it belongs to. If the target element is not on
 *  the current screen, the overlay opens that route and measures again, so one
 *  tour can walk a person from "raise a request" through to "read the case
 *  timeline" instead of stopping at the edge of a page.
 *
 *  Selectors point at `[data-guide="..."]` attributes. A step whose element
 *  cannot be found - the wrong role, a module switched off, a device that shows
 *  a different control - is dropped, never stalled on: an empty step teaches
 *  nothing and a guide that breaks is worse than no guide.
 */

/** The roles offered a guided tour. Everything else is deliberately excluded. */
export const GUIDE_ROLES = ['STUDENT', 'TEACHER'] as const

export interface TourStep {
  /** CSS selector for the element to spotlight. */
  target: string
  title: string
  body: string
  placement?: 'bottom' | 'top' | 'auto'
  /** The screen this step belongs to, when it is not the tour's own route. */
  route?: string
}

export interface Tour {
  id: string
  name: string
  /** Human label for the audience chip. */
  audience: string
  summary: string
  /** Route to open before starting, so the tour always starts where it should. */
  route: string
  /** Roles offered this tour, from GUIDE_ROLES. */
  roles: string[]
  steps: TourStep[]
}

/** The seeded demo request used by the case steps. The demo seed is
 *  deterministic, so a student always has this case; if it is ever absent the
 *  step is dropped rather than stalling the tour. */
const DEMO_CASE = '/cases/23'

export const TOURS: Tour[] = [
  {
    id: 'orientation',
    name: 'Getting around Campus Relay',
    audience: 'Student · Teacher',
    summary:
      'Every control on the screen, then the home screen: what to tap to raise something, what is waiting for you, and where your numbers live.',
    route: '/',
    roles: ['STUDENT', 'TEACHER'],
    steps: [
      {
        target: '[data-guide="shell-nav"]',
        route: '/',
        title: 'The rail is the whole application',
        body: 'Every screen is grouped here by module: Home, Academics, Fees, Services, Requests, Announcements, then the desks. Only the parts your role can use are shown - a student never sees the fee counter, a teacher never sees the hostel desk.',
      },
      {
        target: '[data-guide="shell-nav-toggle"]',
        route: '/',
        title: 'On a phone, tap ☰',
        body: 'The same rail slides in from the ☰ button in the top bar, and closes when you pick a destination or tap the dimmed area. Same destinations, same order as the desktop.',
      },
      {
        target: '[data-guide="shell-search"]',
        route: '/',
        title: 'Jump straight to a screen',
        body: 'Type what you remember. On a keyboard press Ctrl K or ⌘ K. It searches screens, not data, so it is a fast way around rather than a slow way to search.',
      },
      {
        target: '[data-guide="shell-context"]',
        route: '/',
        title: 'Where you are, always stated',
        body: 'Institution, campus, term, role and channel, once, under the top bar. The breadcrumb below names the module and the screen, so a deep page never leaves you wondering which area you are in.',
      },
      {
        target: '[data-guide="shell-account"]',
        route: '/',
        title: 'Your account lives here',
        body: 'Your name opens the account panel: your identity, text size and spacing, this device, and Sign out. Everything personal is behind this one button.',
      },
      {
        target: '[data-guide="shell-theme"]',
        route: '/',
        title: 'Comfort controls',
        body: 'Light and dark, chosen by you and remembered on this device, next to the language picker. Text size, spacing and a high-contrast switch are in the account panel.',
      },
      {
        target: '[data-guide="home-greeting"]',
        route: '/',
        title: 'This is your own record',
        body: 'Your name, roll number and hostel room - read straight from the campus register. Nothing else about you is exposed on a screen anyone else can open.',
      },
      {
        target: '[data-guide="home-new-request"]',
        route: '/',
        title: 'One button raises anything',
        body: 'Repairs, certificates, leave, mess complaints: the same button. Describe the problem and the system works out which desk owns it.',
      },
      {
        target: '[data-guide="home-waiting"]',
        route: '/',
        title: 'What is waiting on you',
        body: 'When work is marked done you are asked to confirm it, and when a notice needs your acknowledgement it appears here. That confirmation is what closes a request honestly - ignoring it leaves the request unresolved.',
      },
      {
        target: '[data-guide="home-metrics"]',
        route: '/',
        title: 'Your numbers',
        body: 'Open requests, unread alerts, notices that need you. Each tile is a live count, not decoration.',
      },
      {
        target: '[data-guide="home-shortcuts"]',
        route: '/',
        title: 'Common requests, two taps',
        body: 'The requests students raise most often, as shortcuts with prefilled categories. Settings, language and the offline queue are under your account panel.',
      },
    ],
  },
  {
    id: 'requests',
    name: 'File a request and follow it to the end',
    audience: 'Student',
    summary:
      'Describe a problem in your own words, file it even with no signal, then track it, read the timeline and confirm the fix.',
    route: '/report',
    roles: ['STUDENT'],
    steps: [
      {
        target: '[data-guide="report-describe"]',
        route: '/report',
        title: 'Describe it the way you would tell a friend',
        body: 'Write the problem in plain language. "Suggest category" reads it and proposes the service, urgency and location, which fills the form for you. You can always correct it before submitting.',
      },
      {
        target: '[data-guide="report-services"]',
        route: '/report',
        title: 'Or pick the service yourself',
        body: 'Every service you are allowed to raise, with the institution\'s own response target shown on the case once it is filed. Certificate requests check your dues automatically and say so if a balance blocks them.',
      },
      {
        target: '[data-guide="report-offline"]',
        route: '/report',
        title: 'No signal? File it anyway',
        body: 'Submit with no network and the request is stored on this device with a reference you can read. It is sent automatically - exactly once - when the connection returns. A photo needs the server, so the app tells you that the text will go and the photo will wait.',
      },
      {
        target: '[data-guide="cases-head"]',
        route: '/cases',
        title: 'Every request you filed',
        body: 'This is the list to check first. The number on the right is how many match the current filter; if something is not here, it is not filed.',
      },
      {
        target: '[data-guide="cases-tabs"]',
        route: '/cases',
        title: 'Filters that answer questions',
        body: 'Open for work in progress, "Needs your action" for anything waiting on you, "Past its deadline" for work past its promised time, and awaiting verification for fixes you have not confirmed yet.',
      },
      {
        target: '[data-guide="cases-list"]',
        route: '/cases',
        title: 'Read the status before opening',
        body: 'Each row carries status, priority and the response target. Search by case number, title or words you wrote, and order by urgency or by how close a case is to its target.',
      },
      {
        target: '[data-guide="case-header"]',
        route: DEMO_CASE,
        title: 'The case, in one block',
        body: 'Status, urgency and how much of the service target is left, counted by the institution\'s own clock - not a vendor benchmark. The location and room are carried from what you reported.',
      },
      {
        target: '[data-guide="case-actions"]',
        route: DEMO_CASE,
        title: 'Only what you are allowed to do',
        body: 'These buttons come from the permissions the server issued for your account, so a student sees Verify and Reopen, while staff see the workflow actions. Nothing offered here can fail with a permission error.',
      },
      {
        target: '[data-guide="case-timeline"]',
        route: DEMO_CASE,
        title: 'Nothing is summarised away',
        body: 'Every status change, assignment, escalation and comment, with who did it and when. This trail cannot be edited on the server: it is the record that settles "when was it reported" and "who had it".',
      },
    ],
  },
  {
    id: 'records',
    name: 'Your records: attendance, marks, timetable, fees',
    audience: 'Student',
    summary:
      'Where the numbers come from, what the percentages mean, and how to read a week of classes and a fee balance at a glance.',
    route: '/attendance',
    roles: ['STUDENT'],
    steps: [
      {
        target: '[data-guide="attendance-head"]',
        route: '/attendance',
        title: 'Attendance is marked by your teachers',
        body: 'Your teachers mark each class; the server decides which rows are yours to read, so the record you see is always your own.',
      },
      {
        target: '[data-guide="attendance-summary"]',
        route: '/attendance',
        title: 'The percentage that matters',
        body: 'Present plus late over total classes marked. The badge says whether this copy is live or the last one saved on the device, so an offline view is never mistaken for a fresh one.',
      },
      {
        target: '[data-guide="attendance-subjects"]',
        route: '/attendance',
        title: 'Per subject, because one number hides a shortage',
        body: 'A subject under 75% is flagged urgently while your overall figure still looks healthy. The breakdown underneath says exactly how many present, late and absent.',
      },
      {
        target: '[data-guide="marks-head"]',
        route: '/marks',
        title: 'Marks, as the teacher entered them',
        body: 'Results appear here as soon as they are recorded, with the assessment and term named so a score can always be traced to one test.',
      },
      {
        target: '[data-guide="marks-summary"]',
        route: '/marks',
        title: 'Overall performance',
        body: 'Marks obtained over the maximum available, across every assessment published so far.',
      },
      {
        target: '[data-guide="marks-subjects"]',
        route: '/marks',
        title: 'Check the subject, not just the total',
        body: 'A weak subject disappears inside a good average. Each row shows the assessments counted, so you can see whether a percentage is one test or five.',
      },
      {
        target: '[data-guide="timetable-head"]',
        route: '/timetable',
        title: 'The week ahead',
        body: 'Your classes for the whole week, with period times, subject and room. This is the published timetable, so it matches what the department office holds.',
      },
      {
        target: '[data-guide="timetable-week"]',
        route: '/timetable',
        title: 'Read it as a week',
        body: 'Periods run down the side and days run across, so a free gap is visible without reading every row. Today is marked, and the room is named in each class.',
      },
      {
        target: '[data-guide="fees-head"]',
        route: '/fees',
        title: 'Fees and dues',
        body: 'What the office has published for you: the records, the payments received and anything still outstanding.',
      },
      {
        target: '[data-guide="fees-summary"]',
        route: '/fees',
        title: 'The outstanding figure first',
        body: 'Paid against total, with the balance called out. This is the number a certificate request is checked against.',
      },
      {
        target: '[data-guide="fees-records"]',
        route: '/fees',
        title: 'Every payment, with its reference',
        body: 'Date, method and receipt reference for each payment, so a query at the counter has the documentation attached.',
      },
    ],
  },
  {
    id: 'services',
    name: 'Campus services: library, leave, clearance, activities, feedback, careers',
    audience: 'Student',
    summary:
      'The everyday services, in the order a term uses them: books, leave and gate passes, no-dues, clubs, complaints, and placement applications.',
    route: '/library',
    roles: ['STUDENT'],
    steps: [
      {
        target: '[data-guide="library-head"]',
        route: '/library',
        title: 'Library',
        body: 'Your loans, fines and the catalogue in one screen. Search the catalogue by title or author; availability is on each book.',
      },
      {
        target: '[data-guide="library-metrics"]',
        route: '/library',
        title: 'Loans, fines, titles',
        body: 'Titles on loan, any fine outstanding, and how many the catalogue search currently matches.',
      },
      {
        target: '[data-guide="library-catalogue"]',
        route: '/library',
        title: 'Issuing and returning is a desk action',
        body: 'You search and reserve; the librarian issues and returns. The loan record and due date appear back on this screen.',
      },
      {
        target: '[data-guide="leave-head"]',
        route: '/leave',
        title: 'Leave and the gate pass',
        body: 'Apply here and the whole chain runs from it: policy check, warden approval, a digital gate pass, verification at the gate, and automatic closure when you return.',
      },
      {
        target: '[data-guide="leave-apply"]',
        route: '/leave',
        title: 'The application, with a reason that is checked',
        body: 'Dates must run forwards and the reason must be real - the server rejects a one-letter answer. Destination and guardian contact are part of the pass, so security can act on them.',
      },
      {
        target: '[data-guide="leave-summary"]',
        route: '/leave',
        title: 'Where each application stands',
        body: 'Pending, approved and rejected counts, with each application\'s own status and the decision note once the warden has ruled.',
      },
      {
        target: '[data-guide="clearance-head"]',
        route: '/clearance',
        title: 'Clearance and no-dues',
        body: 'Used for hostel vacate, migration, transfer and graduation. Each request collects the approvals it needs, and the hostel desk sees the same case.',
      },
      {
        target: '[data-guide="clearance-request"]',
        route: '/clearance',
        title: 'Raise one in two fields',
        body: 'Pick the kind, write the purpose, send. Track it on the same screen - there is no separate counter queue to visit.',
      },
      {
        target: '[data-guide="activities-head"]',
        route: '/activities',
        title: 'Clubs, sports and events',
        body: 'Everything open on campus, with the seat count. Register from here; a full event puts you on the waitlist rather than turning you away.',
      },
      {
        target: '[data-guide="activities-list"]',
        route: '/activities',
        title: 'Capacity is live',
        body: 'Seats fill as people register, and the badge says whether you are registered, waitlisted or done with the event.',
      },
      {
        target: '[data-guide="feedback-head"]',
        route: '/feedback',
        title: 'Feedback that reaches a desk',
        body: 'Academic, faculty, facility, mess, hostel or administration. Choose the topic, rate it, and it lands in the inbox of the office responsible.',
      },
      {
        target: '[data-guide="feedback-give"]',
        route: '/feedback',
        title: 'Say it with a rating, or anonymously',
        body: 'A rating makes trends visible; anonymous keeps the author out of the record while still being actionable. Your submitted feedback and its status are listed below the form.',
      },
      {
        target: '[data-guide="career-head"]',
        route: '/career',
        title: 'Placements',
        body: 'Postings from the placement cell with eligibility, package and deadline, plus your own applications and where each one stands.',
      },
      {
        target: '[data-guide="career-postings"]',
        route: '/career',
        title: 'Apply, and watch the pipeline',
        body: 'Apply from the posting. The stage - applied, shortlisted, interview, selected - is set by the cell and appears on your application list.',
      },
    ],
  },
  {
    id: 'notices',
    name: 'Notices and alerts',
    audience: 'Student · Teacher',
    summary:
      'Announcements addressed to you, how to acknowledge one that needs it, and the alert feed that tracks your own cases.',
    route: '/notices',
    roles: ['STUDENT', 'TEACHER'],
    steps: [
      {
        target: '[data-guide="notices-tabs"]',
        route: '/notices',
        title: 'Addressed to you, not shouted at everyone',
        body: 'Notices are matched to your hostel, branch, year, batch or role. "Needs action" holds anything requiring acknowledgement, a form or a registration - open it there rather than scrolling everything.',
      },
      {
        target: '[data-guide="notices-list"]',
        route: '/notices',
        title: 'Read state is recorded',
        body: 'Opening a notice records the read, which is how an office can prove that a warning reached 12 of 300 people instead of guessing. Anything you have acknowledged is marked on the row.',
      },
      {
        target: '[data-guide="notifications-head"]',
        route: '/notifications',
        title: 'Alerts are about your own work',
        body: 'A notice is a broadcast; an alert is about your cases, approvals, leave and fees. This is the list that tells you work has moved without you having to look.',
      },
      {
        target: '[data-guide="notifications-tabs"]',
        route: '/notifications',
        title: 'Unread first, preferences second',
        body: 'Filter to unread, or open Preferences to choose which categories reach you on the device and how. "Mark all read" clears the badge once you have gone through them.',
      },
      {
        target: '[data-guide="notifications-list"]',
        route: '/notifications',
        title: 'Each alert opens the thing it is about',
        body: 'Tapping an alert takes you to the case or the notice behind it. If you are offline it says so rather than pretending the action went through.',
      },
    ],
  },
  {
    id: 'settings',
    name: 'Make it yours: language, display, and working offline',
    audience: 'Student · Teacher',
    summary:
      'Profile, language, text size, and what actually happens when the network drops - the queue, retries and conflicts.',
    route: '/profile',
    roles: ['STUDENT', 'TEACHER'],
    steps: [
      {
        target: '[data-guide="profile-head"]',
        route: '/profile',
        title: 'Your account, stated plainly',
        body: 'The profile screen is also the honest description of the deployment: what this campus really has configured, rather than what a brochure claims.',
      },
      {
        target: '[data-guide="profile-account"]',
        route: '/profile',
        title: 'Identity',
        body: 'Name, email, phone, campus and the channel this device uses. A student record and work details (for staff) follow underneath.',
      },
      {
        target: '[data-guide="profile-language"]',
        route: '/profile',
        title: 'Language',
        body: 'English, Hindi or Odia. The change applies immediately across the navigation and screens, and is stored on your account so the next device opens in the same language.',
      },
      {
        target: '[data-guide="profile-sync"]',
        route: '/profile',
        title: 'Offline is a state, not an error',
        body: 'This block shows the connection, what is waiting to send, and anything needing your attention - the same numbers the sync centre reports.',
      },
      {
        target: '[data-guide="sync-metrics"]',
        route: '/sync',
        title: 'The honest scoreboard',
        body: 'Waiting, retrying, conflicts, synced. If something has not reached the server, this screen says so instead of showing a screen that looks saved.',
      },
      {
        target: '[data-guide="sync-tabs"]',
        route: '/sync',
        title: 'Both sides of the story',
        body: 'This device\'s queue beside the server\'s own operation record, so a disagreement can be seen from either end. Each queued action carries a key that makes a double tap harmless.',
      },
    ],
  },
  {
    id: 'teaching',
    name: 'The teaching day',
    audience: 'Teacher',
    summary:
      'Your own queue ordered by what will breach first, marking attendance and marks with an offline-safe class list, and the approvals waiting on you.',
    route: '/tasks',
    roles: ['TEACHER'],
    steps: [
      {
        target: '[data-guide="tasks-tabs"]',
        route: '/tasks',
        title: 'Only your work, sorted by consequence',
        body: 'Needs attention first - breached and at-risk cases - then what is in progress, then what you closed recently. You never see the campus queue here.',
      },
      {
        target: '[data-guide="tasks-card"]',
        route: '/tasks',
        title: 'Enough to act, and nothing more',
        body: 'Location, room, the person waiting and how long it has been open. Starting, resolving and commenting all work with no signal; the note you write survives and syncs later.',
      },
      {
        target: '[data-guide="mark-head"]',
        route: '/attendance/mark',
        title: 'Marking attendance',
        body: 'Only subjects assigned to you appear. Pick the subject, date and period - the roster then loads from the register, so a new admission is present in the list without any import.',
      },
      {
        target: '[data-guide="mark-setup"]',
        route: '/attendance/mark',
        title: 'One class at a time',
        body: 'A future date is refused and a period already marked is reported rather than silently overwritten. A note on a correction is what keeps a register defensible.',
      },
      {
        target: '[data-guide="mark-roster"]',
        route: '/attendance/mark',
        title: 'The class list, thumb-sized',
        body: 'Present, absent, late or excused, with "All present" for the common case. Save once for the whole class; each student\'s percentage updates immediately.',
      },
      {
        target: '[data-guide="entry-head"]',
        route: '/marks/entry',
        title: 'Entering marks',
        body: 'Name the assessment and the term and set the maximum; the class list then takes a score per student.',
      },
      {
        target: '[data-guide="entry-setup"]',
        route: '/marks/entry',
        title: 'Assessment, term, maximum',
        body: 'These three fields are what make a score traceable. "Internal 1, 2026-ODD, out of 30" is a result anyone can check; a bare percentage is not.',
      },
      {
        target: '[data-guide="entry-roster"]',
        route: '/marks/entry',
        title: 'Scores are validated against the maximum',
        body: 'A score above the maximum is rejected on the server, so a mistyped 300 against a maximum of 30 cannot reach a report card.',
      },
      {
        target: '[data-guide="teaching-head"]',
        route: '/timetable/teaching',
        title: 'Your teaching week',
        body: 'Only the periods you teach, laid out across the week with room and subject - the reference for planning a class or a substitution.',
      },
      {
        target: '[data-guide="teaching-week"]',
        route: '/timetable/teaching',
        title: 'Read it as a week',
        body: 'Periods down, days across, with today marked. If a period is missing here it has not been scheduled, not merely hidden.',
      },
      {
        target: '[data-guide="approvals-head"]',
        route: '/approvals',
        title: 'Decisions waiting on you',
        body: 'Longest wait first, because the person at the top has been waiting longest. Requests routed to your role appear here with the requester and the service.',
      },
      {
        target: '[data-guide="approvals-list"]',
        route: '/approvals',
        title: 'Decide with a note',
        body: 'Approve or reject with a reason: the note goes to the requester and stays on the case record. An approval without a note is the audit gap this desk exists to close.',
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
    feature: 'Attendance & marks',
    mobile: 'yes',
    tablet: 'yes',
    desktop: 'yes',
    kiosk: 'no',
    offline: 'reads yes — marking queue is refused offline',
    note: 'A register correction needs the live roster, so it is not offered in a dead zone.',
  },
  {
    feature: 'Triage queue & bulk hand-off',
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
    note: 'Slide-out navigation, single column, thumb-reachable primary action, fileable offline.',
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

/** Does a tour (or a step) belong to the path currently open? */
export function matchesRoute(pathname: string, route: string): boolean {
  if (route === '/') return pathname === '/'
  return pathname === route || pathname.startsWith(`${route}/`)
}

/** The tours this role is offered, in catalogue order. */
export function toursForRole(role: string | null | undefined): Tour[] {
  if (!role) return []
  return TOURS.filter((tour) => tour.roles.includes(role))
}
