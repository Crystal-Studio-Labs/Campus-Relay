# Speaker Script: Pruthiraj Lenka
**Role**: Frontend Engineering & Local-First PWA  
**Assigned Slides**: Slide 7 & Slide 8  
**Speaking Time**: ~1.5 to 2 Minutes  

---

## 🎙️ YOUR PRESENTATION SCRIPT

### Slide 7: Local-First Offline Resilience
*(Start talking right after Manas says "Pruthiraj, show them how we work offline")*

> "Thank you, Manas!
> 
> We all know the biggest pain point in our colleges: **Wi-Fi dead zones**.  
> In hostel basements, during heavy rains, or in rural areas, internet connectivity completely disappears.  
> If you open almost any college website or app when offline, what happens?  
> It spins, crashes, and shows: *'Error: No Internet Connection'*.
> 
> In **Campus Relay**, we engineered a **true Local-First Architecture**.
> 
> Instead of sending every button click straight to a cloud server, our Progressive Web App (PWA) has its own local storage vault right inside the browser using **IndexedDB**.
> 
> - If a student submits a complaint with **Zero Wi-Fi**, the app doesn't crash! It saves the ticket immediately in their phone's local **Outbox** with an amber badge saying *'Pending Sync'*.
> - The ticket gets a unique, tamper-proof ID (an idempotency key) created on the phone itself.
> - The student can even refresh or close their browser—**nothing is lost**.
> - The second the phone catches a faint 2G signal or Wi-Fi reconnects, our background sync engine pushes the outbox to our server.
> 
> It never duplicates a ticket, never drops a photo, and never shows an error screen to the student.  
> It just works!"

---

### Slide 8: Digital Equity — Corridor Kiosk & Trilingual UI
*(Move to Slide 8, point to the Kiosk mockup and language pills)*

> "Now, look at Slide 8: **What about students who don't have a smartphone or whose phone battery died?**
> 
> A college system must be fair to every single student. That's why we created the **Corridor Touch Kiosk Mode**.
> 
> Using an inexpensive Android tablet mounted on the hostel lobby or mess wall:
> - A student simply walks up, types their **Roll Number** (like `CS2026-001`), enters their 4-digit PIN, and can file or check their complaint in 15 seconds.
> - To protect their privacy, the kiosk has a **90-second automatic logout timer** if the student walks away.
> - For campus staff and non-English speakers, the kiosk supports full **Trilingual Switching**: English, native **Odia (ଓଡ଼ିଆ)**, and **Hindi (हिन्दी)** with a single tap!
> - And if a student has forgotten their PIN, our **Helpdesk Operators** can securely file requests on their behalf.
> 
> Whether a student uses an expensive iPhone, a lobby touch screen, or an assisted desk, **every student gets the exact same first-class treatment**.
> 
> **Bibhu** will now demonstrate our gate pass and security system."

*(Handover cue: Look at Bibhu and nod)*  
> *"Bibhu, show them our gate pass and security engine."*

---

## 🧠 Pruthiraj's Q&A Cheat Sheet (Top Tough Questions)

### Q1: "What technology are you using for the frontend, and how does the offline database work?"
**Your Simple Answer**:  
"Our frontend is built with **React 18, TypeScript, and Vite**, packaged as a Progressive Web App (PWA) with service workers. For local storage, we use **IndexedDB** wrapped in promise-based transactions (`db.ts`). It maintains four separate local stores: Outbox, Response Cache, Form Drafts, and System Meta."

### Q2: "What prevents the same ticket from being created twice if a student taps 'Submit' five times while offline?"
**Your Simple Answer**:  
"We use client-side UUID idempotency keys. When the student clicks submit, the phone generates a unique ID like `op-timestamp-random`. When the device reconnects to Wi-Fi, the server checks that key in the `sync_operations` table. If it receives that key more than once, it returns the existing record without creating a duplicate."

### Q3: "Can a student leave their account logged in on the public kiosk?"
**Your Simple Answer**:  
"No. The kiosk has an active user session timeout of 90 seconds. After 60 seconds of inactivity, a warning prompt appears, and at 90 seconds, it automatically wipes the student session and returns to the safe welcome screen."

### Q4: "How does the Supervisor PIN protect the kiosk terminal?"
**Your Simple Answer**:  
"Corridor kiosks are locked into continuous full-screen kiosk mode. A walk-up user cannot access browser settings or exit to personal accounts without entering the supervisor passcode (`1947`). Only authorized staff can decommission the terminal."
