# Speaker Script: Snehal Kumar Moharana
**Role**: Backend Services & Database Engineering  
**Assigned Slides**: Slide 3 & Slide 4  
**Speaking Time**: ~1.5 to 2 Minutes  

---

## 🎙️ YOUR PRESENTATION SCRIPT

### Slide 3: The Universal Case Engine Architecture
*(Start talking right after Shuvransu says "Snehal, over to you")*

> "Thank you, Shuvransu!
> 
> Most college software fails because developers create **separate, disconnected tools for everything**:  
> One small database for hostel maintenance, a completely different tool for gate passes, another app for leave requests, and another for college notices.  
> Whenever a college wants to add a new service—like sports equipment booking—developers have to write new database tables and code from scratch.
> 
> In **Campus Relay**, we solved this with the **Universal Case Engine**.  
> 
> To our system, **every single request is a 'Case'**:  
> - A leaking tap is a Case.  
> - A weekend hostel leave request is a Case.  
> - An urgent bonafide certificate request is a Case.
> 
> Because they all share **one unified lifecycle**:  
> *Request ➔ Check College Rules ➔ Approvals ➔ Timer/SLA ➔ Assign Staff ➔ Work Done ➔ Student Confirms ➔ Audit Log.*
> 
> This means our college rules, timers, and notifications work automatically across the entire campus. Adding a new department takes 10 minutes by editing a simple settings file—no new programming needed."

---

### Slide 4: Controlled Operational Intelligence (4 AI Agents)
*(Move to Slide 4, point to the 4 cards on screen)*

> "Now, you might ask: *'Why do we need AI here, and won't it give wrong answers?'*
> 
> That's a great question. We do **NOT** use ungrounded chatbots that make up facts. We built **4 controlled, tool-sandboxed AI agents**:
> 
> 1. **Agent 1 - Intake Agent**:  
> When a student speaks or types a complaint in plain words like *'no water in 3rd floor washroom'*, this agent instantly classifies it as *Plumbing*, sets it to *High Priority*, and tags the room.
> 
> 2. **Agent 2 - Routing Agent**:  
> It checks which technician is free and assigns the complaint to the right person with a strict deadline (like 8 hours).
> 
> 3. **Agent 3 - Operations Agent**:  
> It alerts the Principal and Warden about recurring problems—for example, if water pumps keep failing every Monday.
> 
> 4. **Agent 4 - Student Assistant**:  
> It answers student questions like *'Where is my certificate?'* using verified data, without making up false promises.
> 
> **Best of all**: By default, these agents run on a **local rule-matching engine**. That means **zero internet cost, zero monthly API fees**, and student data never leaves the college server.
> 
> **Manas** will now show how our hostel maintenance lifecycle actually works."

*(Handover cue: Look at Manas and nod)*  
> *"Manas, show them the maintenance workflow."*

---

## 🧠 Snehal's Q&A Cheat Sheet (Top Tough Questions)

### Q1: "How does the Universal Case Engine handle completely different workflows, like a broken fan vs. a leave pass?"
**Your Simple Answer**:  
"Under the hood, all requests follow the same state machine: Submitted, Assigned, In-Progress, and Resolved. The specific differences—like leave dates or certificate reasons—are stored inside a flexible JSON payload (`state_payload`) and handled by declarative policies in `policy.py`. This gives us total flexibility without creating dozens of messy database tables."

### Q2: "What if the AI agent makes a mistake in prioritizing a complaint?"
**Your Simple Answer**:  
"Our AI agents are strictly advisory. The routing agent suggests a category, priority, and staff member, but the department supervisor can override any assignment with a single click. Furthermore, our rule-based engine has strict default fallbacks, so no request is ever lost or misrouted."

### Q3: "What database and backend framework are you using, and why?"
**Your Simple Answer**:  
"We use **FastAPI** in Python because it is asynchronous, extremely fast, and provides automatic validation with Pydantic. Our database is **PostgreSQL 16** with SQLAlchemy 2.0 ORM. We specifically chose PostgreSQL because it supports database triggers to guarantee that our audit logs can never be deleted or altered."

### Q4: "Do we need an expensive GPU or OpenAI API keys to run this AI?"
**Your Simple Answer**:  
"No, not at all! Campus Relay runs 100% offline out-of-the-box using our deterministic rule-based engine (`AGENT_PROVIDER=rules`). It requires zero GPU, costs zero rupees in API tokens, and runs smoothly on a basic college computer."
