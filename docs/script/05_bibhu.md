# Speaker Script: Bibhu Bhusan Giri
**Role**: Perimeter Security & Station Infrastructure  
**Assigned Slides**: Slide 9 & Slide 10  
**Speaking Time**: ~1.5 to 2 Minutes  

---

## 🎙️ YOUR PRESENTATION SCRIPT

### Slide 9: Digital Gate Pass & Anti-Passback Security
*(Start talking right after Pruthiraj says "Bibhu, show them our gate pass and security engine")*

> "Thank you, Pruthiraj!
> 
> Let's talk about **Campus Safety and the Security Gate**.  
> In almost every college today, security guards write student names in physical paper diaries.  
> What happens? Students forge signatures, take screenshots of someone else's leave pass, or leave the gate multiple times on one slip. And when parents call at 10 PM asking if their child is inside the hostel, the college has no quick way to verify.
> 
> In **Campus Relay**, we built an integrated **Digital Gate Pass with Anti-Passback**:
> 
> 1. When a student applies for leave, the Warden approves it on their mobile phone, and the system automatically generates a dynamic, encrypted **QR Gate Pass**.
> 2. At the gate, the security guard scans the QR code using any basic tablet or phone camera in **under 150 milliseconds**. The guard immediately sees the student's photo, room number, and curfew time.
> 3. **The Anti-Passback Guard**:  
> Here is the magic: A student **cannot** take a screenshot of the pass and send it to a friend inside!  
> If someone tries to scan an exit pass a second time, the guard's tablet **flashes bright red** and sounds an alert: **'ANTI-PASSBACK VIOLATION: PASS ALREADY EXITED'**!
> 4. When the student returns, the guard scans them in, and the leave ticket closes automatically.
> 
> The Principal and Chief Warden have a **Live Outside Headcount** counter showing exactly how many students are currently outside the campus boundary at any given minute."

---

### Slide 10: Zero-Trust Verifiable Document Engine
*(Move to Slide 10, point to the certificate card and phone scanner)*

> "Now look at Slide 10: **Academic Certificates & Forgery Prevention**.
> 
> Today, students wait **four to seven days** outside the admin office for a simple Bonafide Certificate needed for a bank education loan, scholarship, or passport.  
> Even worse, colleges face massive legal trouble when fake certificates with counterfeit rubber stamps are circulated.
> 
> In **Campus Relay**:
> - The student applies online. Once approved by the registrar, our backend uses **ReportLab** to generate a clean, official PDF in **under 3 seconds**!
> - Every certificate has a unique serial number and an **official encrypted QR code**.
> - When an external bank officer or visa embassy scans that QR code with their ordinary phone camera, it takes them to our public verification page.
> - The bank can immediately see: *'This certificate was officially issued by CIT to Shuvransu on Oct 7, 2026'*, **WITHOUT exposing the student's private grades or personal financial details**!
> 
> That means **zero waiting days for students**, and **zero forgery risk for the university**.
> 
> **Nandita** will now show how we manage college-wide announcements and return on investment."

*(Handover cue: Look at Nandita and nod)*  
> *"Nandita, show them our notice studio and institutional value."*

---

## 🧠 Bibhu's Q&A Cheat Sheet (Top Tough Questions)

### Q1: "What does Anti-Passback mean in simple terms?"
**Your Simple Answer**:  
"Anti-passback is a security rule that prevents the same pass from being used twice in the same direction. Once a student scans their pass to exit, that pass cannot be used for another exit until an entry is recorded. If a student tries to send a screenshot of their pass back to a friend inside the hostel, the system rejects it immediately."

### Q2: "Can a security guard scan passes if the gate Wi-Fi stops working?"
**Your Simple Answer**:  
"Yes! Our Security Gate Desk runs on the same local-first PWA architecture. The guard can scan student passes offline; movements are stored with client timestamps in the tablet's IndexedDB outbox and are synced to the central database the moment the connection restores."

### Q3: "How do you protect student privacy on the public certificate verification page?"
**Your Simple Answer**:  
"We follow Zero-Trust privacy principles. The public verification endpoint (`/api/v1/documents/verify/{code}`) only displays the document type, serial number, issue date, student roll number, and validity status. It never reveals sensitive personal data like exam marks, home address, or fee dues."

### Q4: "What libraries are used to generate the PDF and QR code?"
**Your Simple Answer**:  
"We use Python's **ReportLab** library to build dynamic, vector-sharp PDF certificates programmatically with institutional seals and watermarks, and the Python **qrcode** library to render dynamic encrypted QR codes directly onto the document."
