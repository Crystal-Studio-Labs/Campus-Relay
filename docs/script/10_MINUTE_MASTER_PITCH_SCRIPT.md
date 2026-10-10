# 🎙️ CAMPUS RELAY — 10-MINUTE MASTER HACKATHON PITCH SCRIPT
**BPUT Hackathon 2026 · Problem Statement 07 (Fretbox)**  
**Team**: Crystal Studio Labs (Team ID: BH26PS07T065)  
**Total Time Limit**: Exactly 10 Minutes (Strictly timed)  
**Speaking Setup**: 4 Stage Speakers + 2 Technical Q&A Defense Leads

---

## ⏱️ Master 10-Minute Run Sheet

| Timecode | Role & Speaker | Core Topic & Deliverable | Stage Cue / Visual |
| :--- | :--- | :--- | :--- |
| **0:00 – 2:00** | **Speaker 1: Shuvransu Sekhar Sahoo** *(Captain)* | **Hook, Problem Statement & System Vision** | Slides 1 & 2 (Crisis & Operating Layer) |
| **2:00 – 4:15** | **Speaker 2: Snehal Kumar Moharana** | **Architecture, Core Case Engine & Data Integrity** | Slides 3 & 4 (Engine Architecture & State Machine) |
| **4:15 – 6:30** | **Speaker 3: Manas Kumar Mallick** | **Hostel Maintenance, SLAs & Gate Pass Anti-Passback** | Slides 5 & 6 (Room QR, Requester Guard, Pass) |
| **6:30 – 8:45** | **Speaker 4: Nandita Das** | **Digital Equity (Kiosk), Notice Studio & Management ROI** | Slides 7 & 8 (Kiosks, Notices, NAAC Readiness) |
| **8:45 – 10:00** | **Speaker 1: Shuvransu Sekhar Sahoo** *(Captain)* | **60-Min Adoption, Honesty Split (Done vs Next) & Q&A Launch** | Slide 8 (Takeaway & Call to Action) |
| **10:00+** | **Technical Leads: Pruthiraj Lenka & Bibhu Bhushan Giri** | **Technical Defense, Deep-Dive Explanations & Live Q&A** | Q&A Session (Code, Tests, Security, Sync) |

---

## 🎭 Detailed Speaker Scripts

---

### PART 1: THE OPENING (0:00 – 2:00)
**Speaker 1: Shuvransu Sekhar Sahoo (Captain & Anchor)**  
*Objective: Hook the jury in 15 seconds, define the real problem, and position Campus Relay as an operating layer, not just another app.*

*(Walk to center stage, stand tall, make direct eye contact with the jury)*

> **[0:00 – 0:30] Introduction & The Hook**  
> "Respected judges, faculty members, and fellow builders, good morning.  
> We are **Crystal Studio Labs**, and we are presenting **Campus Relay** for Problem Statement 07.
> 
> Let’s start with a real scenario that happens across every Indian college campus tonight:  
> A water pipe bursts in Hostel Block B, or a student needs an urgent bonafide certificate for an education loan tomorrow morning.  
> 
> What actually happens on campus right now?  
> The student writes in a dusty paper register that gets misplaced. They send desperate WhatsApp messages to a 500-student group. Maintenance takes nine days to show up. Staff mark tickets 'closed' on paper without fixing anything. And at the campus gate, security guards scribble student names in physical paper logs where signatures are easily forged."

> **[0:30 – 1:30] The 3 Core Institutional Failures**  
> "When we studied Problem Statement 07, we realized colleges don’t need another generic form website. They are struggling with three deep operational failures:  
> 
> **First, Ghost Resolutions**: Technicians and contractors mark complaints as 'Closed' just to clean up their queues, while the student’s tap is still leaking.  
> **Second, Porous Perimeter Security**: Physical gate registers cannot stop students from sharing passes or sneaking out twice on the same paper slip.  
> **Third, The Network Dead Zone**: Hostels and basements have zero Wi-Fi or mobile data. When internet drops, traditional web portals crash and lock students out. And students without smartphones are completely ignored."

> **[1:30 – 2:00] The Core Idea & Transition**  
> "We built **Campus Relay** to fix this permanently.  
> Campus Relay is **a resilient, offline-first operating layer for everyday campus operations**. It unites hostel maintenance, leave approvals, anti-passback gate security, verifiable certificates, and official circulars into a single, deterministic workflow engine.
> 
> To explain how our universal architecture powers this, I hand over to our Backend Systems Engineer, **Snehal**."

*(Handover gesture: Step aside slightly, nod to Snehal)*  
> *"Snehal, over to you."*

---

### PART 2: ARCHITECTURE & CASE ENGINE (2:00 – 4:15)
**Speaker 2: Snehal Kumar Moharana (Backend & Systems Architecture)**  
*Objective: Prove technical rigor—explain the single unified case engine, state machines, and tamper-proof database ledger.*

*(Step forward confidently, point to the Architecture Diagram on the screen)*

> **[2:00 – 2:45] The Universal Engine vs Fragmented Silos**  
> "Thank you, Shuvransu.  
> Most software attempts to build separate applications: one for complaints, one for gate passes, one for certificates. This creates fragmented databases and broken workflows.  
> 
> In Campus Relay, **we engineered a Universal Case Engine**.  
> Every interaction—whether it is a leaking hostel geyser, a 3-day leave request, or a semester fee inquiry—is handled by the exact same deterministic engine:  
> **Request → Policy Check → Workflow State Machine → Approval → SLA Countdown → Field Assignment → Requester Verification → Immutable Audit**.  
> 
> A new campus service is simply a configuration in our database, requiring zero custom coding."

> **[2:45 – 3:30] High-Concurrency Tech Stack**  
> "To guarantee sub-second speed across thousands of concurrent campus users, we built our backend with:  
> • **Python 3.12 and FastAPI**: Providing async, high-throughput REST endpoints.  
> • **SQLAlchemy 2.0 ORM & Pydantic v2**: Enforcing strict schema validation and data integrity on every payload.  
> • **PostgreSQL 16 Engine**: Operating with automated Alembic database migrations.  
> 
> We also eliminated role confusion by consolidating RBAC into **three clear system roles**: Student, Teacher, and Management. Specific stations like Gate Security, Residential Warden, and Helpdesk Kiosks operate securely under scoped permissions."

> **[3:30 – 4:15] The Append-Only Audit Ledger**  
> "The heart of our institutional trust is our **Append-Only Audit Ledger**.  
> In traditional ERPs, a database administrator or disgruntled staff member can edit or delete logs to hide delays.  
> In Campus Relay, PostgreSQL schema triggers and ORM listener guards physically block `UPDATE` and `DELETE` operations on historical event logs.  
> Every single status transition, technician dispatch, photo proof, and approval decision is immutably recorded forever.  
> 
> Now, my teammate **Manas** will walk you through how this engine executes real hostel maintenance and gate security workflows."

*(Handover gesture: Nod to Manas)*  
> *"Manas, take us through the field workflows."*

---

### PART 3: HOSTEL MAINTENANCE & GATE SECURITY (4:15 – 6:30)
**Speaker 3: Manas Kumar Mallick (Case Lifecycle & Field Verification)**  
*Objective: Deliver the two most impressive operational workflows—Hostel Room QR with Requester Verification, and Anti-Passback Gate Security.*

*(Step forward with energy, speak with clarity)*

> **[4:15 – 5:00] Workflow 1: Room-Level QR Maintenance & Active SLAs**  
> "Thank you, Snehal!  
> Let’s see what happens when a student walks into their hostel room and finds a broken ceiling fan.  
> 
> 1. The student scans the unique **Room QR code** attached to their wall using their phone camera.  
> 2. The app instantly binds their room number, hostel block, and department without them typing a single address.  
> 3. The request is submitted in two taps. Our intelligent routing engine evaluates technician workloads and skills, auto-assigning the task to the available electrical technician.  
> 4. An active **SLA countdown** starts immediately. If the ticket is not resolved within the institutional target—say 4 hours—it escalates automatically to the Hostel Warden's priority dashboard."

> **[5:00 – 5:45] The Requester Verification Guard (Ending Ghost Resolutions)**  
> "Now comes our biggest operational innovation: **The Requester Verification Guard**.  
> When the technician finishes the repair, they take a photo proof and click 'Resolve'.  
> But the case **DOES NOT CLOSE**.  
> 
> Staff can only mark a case as `RESOLVED`. The case **CANNOT** reach `CLOSED` status until the student confirms on their phone: *'Yes, my fan is working.'*  
> If the fan is still broken, the student clicks 'Reopen'. The case immediately bounces back into the department head's escalation queue with complete historical penalties. This guarantees zero ghost resolutions."

> **[5:45 – 6:30] Workflow 2: Digital Gate Pass & Anti-Passback Security**  
> "Next, look at campus perimeter safety.  
> When a student applies for weekend leave:  
> 1. The Hostel Warden verifies guardian contact and clicks 'Approve'.  
> 2. A secure, cryptographic **Digital Gate Pass** is generated in under 1 second.  
> 3. At the campus gate, the security guard scans the pass on their tablet. Verification completes in **under 150 milliseconds**.  
> 
> Crucially, we enforce strict **Anti-Passback Logic**:  
> Once a student exits through the gate, the pass is locked in an `OUT_OF_CAMPUS` state. A friend cannot reuse the QR code, and a student cannot exit twice on the same pass.  
> The Principal’s dashboard displays a real-time, live headcount of exactly how many students are outside the campus boundary at this exact second.  
> 
> To show how we bring digital equity to students without smartphones, here is **Nandita**."

*(Handover gesture: Nod to Nandita)*  
> *"Nandita, over to you."*

---

### PART 4: EQUITY, NOTICES & INSTITUTIONAL VALUE (6:30 – 8:45)
**Speaker 4: Nandita Das (Digital Equity, Comms & Institutional ROI)**  
*Objective: Prove inclusivity (kiosk mode for students without phones), official notices, and accreditation readiness (NAAC/NIRF value).*

*(Step forward with a warm, confident demeanor)*

> **[6:30 – 7:15] Digital Equity & Self-Service Kiosks**  
> "Thank you, Manas.  
> A critical failure of modern college apps is that they assume every student owns an expensive smartphone and high-speed 5G. What about students whose phones are broken, or who come from underprivileged backgrounds?  
> 
> Campus Relay solves this with our **Touch-First Self-Service Kiosks** deployed in academic lobbies:  
> A student simply approaches the kiosk, enters their university Roll Number, and can:  
> • Look up their ongoing complaints and leave approvals without any smartphone.  
> • File new hostel and academic requests with assisted staff proxy.  
> • Check class notices and examination circulars.  
> Furthermore, our user interface is **fully trilingual**, supporting English, Odia, and Hindi, ensuring no student or security staff is alienated by language."

> **[7:15 – 8:00] Targeted Notice Studio & Zero WhatsApp Spam**  
> "Next, we replaced noisy, unofficial WhatsApp groups with the **Targeted Notice Studio**:  
> When the Dean of Students issues a circular, they select targeted recipients—such as 'Hostel Block A only' or '3rd Year Mechanical Engineering'.  
> The system tracks every notice through a strict recipient state machine:  
> **Sent → Delivered to Device → Read → Acknowledged with Digital Signature**.  
> For emergency alerts—like cyclone warnings or water shutdowns—the administration gets real-time analytics on exactly who has acknowledged the notice and who hasn't."

> **[8:00 – 8:45] Institutional Value & NAAC Accreditation**  
> "Finally, let’s talk about institutional return on investment.  
> Every college faces intense pressure during NAAC, NBA, and NIRF accreditation. Under NAAC Criteria 4 and 5, colleges must produce proof of grievance redressal, infrastructure maintenance, and student support.  
> With paper registers, this requires weeks of fabricated manual paperwork.  
> 
> With Campus Relay, the Principal clicks one button to generate **NAAC-compliant SLA and grievance audit reports**, backed by tamper-proof database logs and cryptographic certificate verification.  
> 
> I now invite our team captain, **Shuvransu**, to conclude our presentation."

*(Handover gesture: Smile and welcome Shuvransu back to the center)*  
> *"Shuvransu, please lead our conclusion."*

---

### PART 5: THE CLOSE & Q&A INVITATION (8:45 – 10:00)
**Speaker 1: Shuvransu Sekhar Sahoo (Captain & Anchor)**  
*Objective: Deliver the 60-minute deployment guarantee, show radical transparency (Done vs Next), and transition smoothly to Pruthiraj and Bibhu for technical Q&A.*

*(Return to center stage, confident and composed)*

> **[8:45 – 9:15] The 60-Minute Rapid Adoption Guarantee**  
> "Thank you, Nandita!  
> Distinguished jury members, when college directors see our demo, their first question is:  
> *'This is powerful, but will it take six months of painful IT migration to adopt?'*  
> 
> Our answer is an absolute **NO. We offer a 60-minute adoption guarantee.**  
> Campus Relay is not custom code that needs to be rewritten per college. It is a configuration-driven platform:  
> Give us your college's basic CSV exports—hostel blocks, staff lists, and student rosters—and the system is seeded, calibrated, and operational on your campus within one hour."

> **[9:15 – 9:45] Radical Transparency: What is Done vs What is Next**  
> "Unlike prototype projects, Campus Relay is thoroughly engineered today:  
> **What is Done and Verified in our repository**:  
> • All 4 core PS07 problem areas are completely built.  
> • **145 automated test cases pass** across 16 test suites.  
> • Clean TypeScript build with zero compilation errors.  
> • Full AST-level RBAC audit enforcing all 62 system permissions.  
> • Complete working PWA with local-first IndexedDB outbox queue.  
> 
> **What is Next in our production roadmap**:  
> • Expanding native hardware barcode scanner integrations for ultra-high-volume gate lanes.  
> • Integrating direct automated SMS gateway fallbacks for offline parent alerts."

> **[9:45 – 10:00] Closing & Floor Open for Questions**  
> "Campus Relay is not an idea on paper. It is a built, tested, and resilient operating system ready to transform Indian campuses today.  
> 
> Thank you for your time.  
> Our technical leads—**Pruthiraj Lenka** for frontend and offline synchronization, and **Bibhu Bhushan Giri** for gate security and audit infrastructure—are here with us, and we are ready to take your questions!"

*(Step together as a team, smile, and look at the jury)*

---

## 🛡️ Technical Defense & Q&A Playbook (Pruthiraj & Bibhu)

The two technical leads do **not** wait or fumble when judges ask technical questions. They step up immediately and deliver crisp, 30-to-45-second answers:

### Question 1: "How does your offline mode work when Wi-Fi drops in a hostel basement?"
**Answer by: Pruthiraj Lenka (Frontend & Local-First Lead)**  
> "Judges, we implemented a true **Local-First PWA architecture using IndexedDB and Service Workers**.  
> When a student submits a complaint in a Wi-Fi dead zone:  
> 1. The client immediately assigns a cryptographically unique `idempotency_key` (UUID v4) and saves the mutation to an IndexedDB outbox queue.  
> 2. The UI renders the pending ticket with an optimistic state so the student knows it was captured.  
> 3. As soon as the device reconnects to network, our background sync worker drains the outbox to `/api/v1/sync/push`.  
> 4. If network glitches replay the request twice, the backend idempotency engine recognizes the UUID and returns the cached result without creating duplicate tickets."

---

### Question 2: "What if the security guard’s tablet is offline at the gate? Can a student forge a pass?"
**Answer by: Bibhu Bhushan Giri (Security & Infrastructure Lead)**  
> "Judges, gate passes use **self-contained signed verification payloads**.  
> The QR code on the student's phone encodes the pass code, validity window, and a cryptographic HMAC signature generated by our server.  
> The guard's tablet caches the active pass manifest in local encrypted storage. Even if campus internet completely dies, the scanner verifies the signature locally in sub-150ms.  
> To prevent anti-passback violations, local scans record an offline movement ledger that syncs back to the central database the instant connectivity resumes, immediately flagging any attempt to reuse an expired or duplicate pass."

---

### Question 3: "Is this actually AI, or just marketing hype?"
**Answer by: Pruthiraj Lenka & Snehal Kumar Moharana**  
> "We intentionally chose **controlled, deterministic intelligence over ungrounded generative LLMs**.  
> For critical campus operations like water leaks or medical gate passes, you cannot risk an external chatbot hallucinating.  
> Our default engine uses **4 sandboxed rule-based agents** running 100% locally with zero external API dependencies, zero latency, and zero token costs.  
> We also support an optional OpenAI/Gemini provider interface with strict JSON schema tool validation for automated query assistance, ensuring the AI can never execute an unauthorized database write without human-in-the-loop confirmation."

---

### Question 4: "What prevents forged certificates from being accepted by banks or visa offices?"
**Answer by: Bibhu Bhushan Giri (Security & Infrastructure Lead)**  
> "Every bonafide certificate is generated as a secure PDF via ReportLab with a high-density QR code and a unique cryptographic serial number.  
> Any bank loan officer or embassy can scan the printed QR code using any smartphone camera.  
> The QR links to our public verification endpoint (`/api/v1/documents/verify/{code}`).  
> The server verifies the document hash and confirms student enrollment, purpose, and issue date—**without exposing private student records or requiring bank login credentials**."

---

### Question 5: "Can a student see other students' complaints or complaints from other hostels?"
**Answer by: Pruthiraj Lenka & Shuvransu Sekhar Sahoo**  
> "No, we enforce **strict multi-tenant organizational scoping and AST-verified RBAC**.  
> Every database query in `cases.py` filters by `campus_id` and the caller's scoped user/student ID.  
> In our automated test suite (`backend/scripts/audit_authz.py`), we ran an abstract syntax tree analyzer across all 62 permissions and verified that unauthenticated or cross-tenant access returns an immediate HTTP 403 Forbidden. A student can only ever query their own requests."

---

## 📌 Rules for Staying Strictly Under 10 Minutes
1. **Never read slides**: The slides have bullet points; you speak the narrative.
2. **Watch the handoff cues**: The next speaker starts speaking the second the previous speaker finishes their last sentence. Zero dead air.
3. **If running behind schedule**: Skip the second example in Slide 5 or 6—**never** skip the Done vs Next transparency slide or Q&A handover.
4. **Calm, conversational speed**: Aim for 130 words per minute. Clear diction wins over rushing.
