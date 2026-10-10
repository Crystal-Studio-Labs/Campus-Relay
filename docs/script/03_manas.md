# Speaker Script: Manas Kumar Mallick
**Role**: Case Lifecycle Engine & Verification  
**Assigned Slides**: Slide 5 & Slide 6  
**Speaking Time**: ~1.5 to 2 Minutes  

---

## 🎙️ YOUR PRESENTATION SCRIPT

### Slide 5: Workflow 1 — Hostel Maintenance Lifecycle
*(Start talking right after Snehal says "Manas, show them the maintenance workflow")*

> "Thank you, Snehal!
> 
> Let's see how Campus Relay transforms everyday hostel maintenance:
> 
> **Step 1: The Room QR Code**:  
> In every hostel room, washroom, and lab, we place a simple QR sticker.  
> When a student opens their camera and scans it, the room details—like *'Aryabhatta Hostel, Room 101'*—are filled in automatically.  
> The student doesn't need to type their hostel address or personal phone number. They simply write *'washroom tap is leaking'*, snap a quick photo, and tap Submit.  
> Also, if their roommate has already reported the same leaking tap 10 minutes ago, the system warns them immediately so technicians don't get duplicate tickets!
> 
> **Step 2: Instant Technician Dispatch**:  
> The assigned plumber immediately receives a mobile notification with the exact room number and photo.  
> The plumber taps **'Start Work'**—which changes the status to *In Progress*. Once fixed, the plumber takes a photo of the repaired tap as proof of work and marks it **'Resolved'**.
> 
> But here is where Campus Relay does something no other college software does.  
> Look at Slide 6."

---

### Slide 6: The Requester Verification Guard & SLA Sweep
*(Move to Slide 6, speak with extra emphasis on the words 'Verify' and 'Reopen')*

> "We call this our **Requester Verification Guard**, and it stops the #1 problem in colleges: **Fake Ticket Closures**.
> 
> In traditional portals, technicians quietly mark complaints as 'Closed' just to show good numbers on paper, even when the tap is still dripping!  
> 
> In **Campus Relay, staff are physically BLOCKED from closing a ticket**.  
> When the plumber finishes, the ticket only moves to **'Resolved'**, not 'Closed'.  
> 
> The student immediately gets a prompt on their phone or hostel kiosk:  
> - If the tap is truly fixed, the student clicks **'Verify & Close'**. The ticket is officially completed.  
> - But if the tap is STILL leaking, the student clicks **'Reopen Issue'**!  
> 
> The moment a student reopens an issue, it resets into an escalated state, alerts the Department Head, and records a penalty against that department's SLA score.
> 
> At the same time, our **Automated SLA Timer** runs in the background. If a ticket takes more than 75% of its allowed time, it turns yellow (*At Risk*). If time runs out, it turns red (*Breached*), alerting the Principal and Warden directly.
> 
> Now, what happens if the hostel Wi-Fi completely dies?  
> **Pruthiraj** will demonstrate our offline engine."

*(Handover cue: Look at Pruthiraj and nod)*  
> *"Pruthiraj, show them how we work offline."*

---

## 🧠 Manas's Q&A Cheat Sheet (Top Tough Questions)

### Q1: "What if a student forgets to verify the ticket? Will it stay in 'Resolved' forever?"
**Your Simple Answer**:  
"No. We have an auto-closure policy timer (e.g., 48 hours). If a student doesn't confirm or reopen within 48 hours, the system marks it as auto-closed. However, the student can still reopen it within 7 days if the problem returns, and our audit ledger clearly notes that it was closed by timeout, not by student verification."

### Q2: "Can a student misuse the 'Reopen' button just to harass the staff?"
**Your Simple Answer**:  
"Every reopen event requires entering a reason and is permanently recorded in our append-only audit trail with the student's ID. If a ticket is reopened multiple times, it is escalated to the supervisor and Warden for physical inspection, preventing any misuse by either side."

### Q3: "What happens if a technician doesn't have a smartphone or data pack?"
**Your Simple Answer**:  
"Technicians can view their daily task board on any desktop in the maintenance office or on a department tablet. They can also use our offline PWA: they can take photos and mark tasks without internet, and the app will sync the moment they connect to office Wi-Fi."

### Q4: "How does the system prevent two students in the same room from filing the same complaint?"
**Your Simple Answer**:  
"When a student scans the room QR code, Agent 1 (our Intake Agent) checks for active open tickets with the same location code (`location_id`) and category. If an active ticket exists, it shows an alert saying: *'A plumbing complaint for Room 101 was already reported 2 hours ago. Would you like to track that case instead?'*"
