import os
import pptx
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import PP_ALIGN

def create_presentation():
    prs = pptx.Presentation()
    # 16:9 widescreen dimensions matching existing deck (18288000 x 10287000 EMUs)
    prs.slide_width = 18288000
    prs.slide_height = 10287000

    # Palette
    C_BG = RGBColor(248, 250, 252)        # Slate-50 (#F8FAFC)
    C_WHITE = RGBColor(255, 255, 255)     # Card surface (#FFFFFF)
    C_BORDER = RGBColor(226, 232, 240)    # Slate-200 border (#E2E8F0)
    C_INK = RGBColor(15, 23, 42)          # Slate-900 (#0F172A)
    C_MUTED = RGBColor(71, 85, 105)       # Slate-600 (#475569)
    C_SUBTLE = RGBColor(148, 163, 184)    # Slate-400 (#94A3B8)
    
    C_INDIGO = RGBColor(79, 70, 229)      # Indigo-600 (#4F46E5)
    C_INDIGO_BG = RGBColor(238, 242, 255) # Indigo-50 (#EEF2FF)
    
    C_GREEN = RGBColor(5, 150, 105)       # Emerald-600 (#059669)
    C_GREEN_BG = RGBColor(236, 253, 245)  # Emerald-50 (#ECFDF5)
    
    C_AMBER = RGBColor(217, 119, 6)       # Amber-600 (#D97706)
    C_AMBER_BG = RGBColor(255, 251, 235)  # Amber-50 (#FFFBEB)
    
    C_RED = RGBColor(220, 38, 38)         # Red-600 (#DC2626)
    C_RED_BG = RGBColor(254, 242, 242)    # Red-50 (#FEF2F2)
    
    C_BLUE = RGBColor(37, 99, 235)        # Blue-600 (#2563EB)
    C_BLUE_BG = RGBColor(239, 246, 255)   # Blue-50 (#EFF6FF)

    blank_layout = prs.slide_layouts[6]

    def set_slide_background(slide):
        bg = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, prs.slide_width, prs.slide_height)
        bg.fill.solid()
        bg.fill.fore_color.rgb = C_BG
        bg.line.fill.background() # no line
        return bg

    def add_header(slide, tag_text, title_text, subtitle_text=""):
        # Tag Badge
        tag = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.8), Inches(0.5), Inches(4.5), Inches(0.35))
        tag.fill.solid()
        tag.fill.fore_color.rgb = C_INDIGO_BG
        tag.line.color.rgb = C_INDIGO
        tag.line.width = Pt(1)
        tf = tag.text_frame
        tf.word_wrap = False
        p = tf.paragraphs[0]
        p.text = tag_text.upper()
        p.font.name = 'Segoe UI'
        p.font.size = Pt(11)
        p.font.bold = True
        p.font.color.rgb = C_INDIGO
        p.alignment = PP_ALIGN.CENTER

        # Title
        tbox = slide.shapes.add_textbox(Inches(0.8), Inches(0.85), Inches(18.4), Inches(0.65))
        tf = tbox.text_frame
        tf.word_wrap = True
        p = tf.paragraphs[0]
        p.text = title_text
        p.font.name = 'Segoe UI'
        p.font.size = Pt(26)
        p.font.bold = True
        p.font.color.rgb = C_INK

        # Subtitle
        if subtitle_text:
            sbox = slide.shapes.add_textbox(Inches(0.8), Inches(1.45), Inches(18.4), Inches(0.45))
            tf = sbox.text_frame
            tf.word_wrap = True
            p = tf.paragraphs[0]
            p.text = subtitle_text
            p.font.name = 'Segoe UI'
            p.font.size = Pt(14)
            p.font.color.rgb = C_MUTED

    def add_footer(slide, current_idx, total_slides=8):
        fbox = slide.shapes.add_textbox(Inches(0.8), Inches(10.6), Inches(18.4), Inches(0.4))
        tf = fbox.text_frame
        p = tf.paragraphs[0]
        p.text = f"Campus Relay · Crystal Studio Labs · BPUT Hackathon 2026 (PS07 Fretbox)                                                                                                                   Slide {current_idx:02d} / {total_slides:02d}"
        p.font.name = 'Segoe UI'
        p.font.size = Pt(10)
        p.font.color.rgb = C_SUBTLE

    def add_card(slide, left, top, width, height, bg_color=C_WHITE, border_color=C_BORDER, line_width=Pt(1)):
        card = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, left, top, width, height)
        card.fill.solid()
        card.fill.fore_color.rgb = bg_color
        card.line.color.rgb = border_color
        card.line.width = line_width
        return card

    # =========================================================================
    # SLIDE 1: COVER & TEAM ROSTER
    # =========================================================================
    s1 = prs.slides.add_slide(blank_layout)
    set_slide_background(s1)

    # Top Tag
    t1_tag = s1.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.8), Inches(0.6), Inches(6.5), Inches(0.4))
    t1_tag.fill.solid()
    t1_tag.fill.fore_color.rgb = C_INDIGO_BG
    t1_tag.line.color.rgb = C_INDIGO
    t1_tag.line.width = Pt(1)
    tf = t1_tag.text_frame
    p = tf.paragraphs[0]
    p.text = "BPUT HACKATHON 2026 · PROBLEM STATEMENT 07 (FRETBOX) · SOFTWARE"
    p.font.name = 'Segoe UI'
    p.font.size = Pt(11)
    p.font.bold = True
    p.font.color.rgb = C_INDIGO
    p.alignment = PP_ALIGN.CENTER

    # Project Title
    t1_title = s1.shapes.add_textbox(Inches(0.8), Inches(1.1), Inches(10.0), Inches(1.0))
    tf = t1_title.text_frame
    p = tf.paragraphs[0]
    p.text = "CAMPUS RELAY"
    p.font.name = 'Segoe UI'
    p.font.size = Pt(44)
    p.font.bold = True
    p.font.color.rgb = C_INDIGO

    # Tagline
    t1_sub = s1.shapes.add_textbox(Inches(0.8), Inches(2.1), Inches(10.5), Inches(0.5))
    tf = t1_sub.text_frame
    p = tf.paragraphs[0]
    p.text = "A Resilient Operating Layer for Everyday Campus Operations"
    p.font.name = 'Segoe UI'
    p.font.size = Pt(18)
    p.font.bold = True
    p.font.color.rgb = C_INK

    # Description Card (Left)
    card_left = add_card(s1, Inches(0.8), Inches(2.8), Inches(9.0), Inches(7.4))
    tf_cl = card_left.text_frame
    tf_cl.word_wrap = True
    tf_cl.margin_left = Inches(0.4)
    tf_cl.margin_right = Inches(0.4)
    tf_cl.margin_top = Inches(0.4)

    p0 = tf_cl.paragraphs[0]
    p0.text = "THE PROBLEM WE SOLVE"
    p0.font.name = 'Segoe UI'
    p0.font.size = Pt(12)
    p0.font.bold = True
    p0.font.color.rgb = C_INDIGO

    p1 = tf_cl.add_paragraph()
    p1.text = "Colleges depend on paper registers, noisy WhatsApp groups, printed forms, and disconnected apps. Routine operations become slow, untracked, and unaccountable."
    p1.font.name = 'Segoe UI'
    p1.font.size = Pt(14)
    p1.font.color.rgb = C_MUTED
    p1.space_before = Pt(8)

    p2 = tf_cl.add_paragraph()
    p2.text = "OUR SOLUTION IN ONE LINE"
    p2.font.name = 'Segoe UI'
    p2.font.size = Pt(12)
    p2.font.bold = True
    p2.font.color.rgb = C_GREEN
    p2.space_before = Pt(16)

    p3 = tf_cl.add_paragraph()
    p3.text = "Campus Relay consolidates every campus request into ONE deterministic Case Engine—with active SLAs, anti-passback gate security, local-first offline PWA, and lobby kiosks for digital equity."
    p3.font.name = 'Segoe UI'
    p3.font.size = Pt(14)
    p3.font.color.rgb = C_MUTED
    p3.space_before = Pt(8)

    p4 = tf_cl.add_paragraph()
    p4.text = "TEAM DETAILS & IDENTIFIERS"
    p4.font.name = 'Segoe UI'
    p4.font.size = Pt(12)
    p4.font.bold = True
    p4.font.color.rgb = C_INK
    p4.space_before = Pt(20)

    p5 = tf_cl.add_paragraph()
    p5.text = "• Team Name: Crystal Studio Labs\n• Team ID: BH26PS07T065\n• Team Captain: Shuvranshu Sekhar Sahoo\n• Repository: github.com/Crystal-Studio-Labs/Campus-Relay\n• License: Open Source (MIT License)"
    p5.font.name = 'Segoe UI'
    p5.font.size = Pt(13)
    p5.font.color.rgb = C_MUTED
    p5.space_before = Pt(8)

    # Right Side: Team Roster (4 Stage Speakers + 2 Q&A Technical Leads)
    card_roster = add_card(s1, Inches(10.2), Inches(0.6), Inches(9.0), Inches(9.6))
    tf_r = card_roster.text_frame
    tf_r.word_wrap = True
    tf_r.margin_left = Inches(0.4)
    tf_r.margin_right = Inches(0.4)
    tf_r.margin_top = Inches(0.4)

    pr_title = tf_r.paragraphs[0]
    pr_title.text = "TEAM ROSTER (10-MIN PITCH STRUCTURE)"
    pr_title.font.name = 'Segoe UI'
    pr_title.font.size = Pt(13)
    pr_title.font.bold = True
    pr_title.font.color.rgb = C_INDIGO

    pr_sub = tf_r.add_paragraph()
    pr_sub.text = "4 Stage Presenters · 2 Technical Q&A Defense Leads"
    pr_sub.font.name = 'Segoe UI'
    pr_sub.font.size = Pt(11)
    pr_sub.font.color.rgb = C_MUTED
    pr_sub.space_before = Pt(2)

    roster_data = [
        ("🎤 1. Shuvransu Sekhar Sahoo (Captain)", "Intro, Core Crisis & Final Closing (Slides 1, 2 & 8)", C_INDIGO),
        ("🎤 2. Snehal Kumar Moharana", "Systems & Backend Architecture (Slides 3 & 4)", C_BLUE),
        ("🎤 3. Manas Kumar Mallick", "Case Lifecycle & Gate Security Workflows (Slides 5 & 6)", C_GREEN),
        ("🎤 4. Nandita Das", "Digital Equity, Notices & Management ROI (Slides 6 & 7)", C_AMBER),
        ("🛡️ 5. Pruthiraj Lenka (Tech Lead)", "Technical Q&A: Frontend, Offline Sync & PWA Architecture", C_INK),
        ("🛡️ 6. Bibhu Bhusan Giri (Tech Lead)", "Technical Q&A: Gate Security, Tamper-Proof Audit & RBAC", C_INK),
    ]

    for name, desc, color in roster_data:
        pn = tf_r.add_paragraph()
        pn.text = name
        pn.font.name = 'Segoe UI'
        pn.font.size = Pt(13)
        pn.font.bold = True
        pn.font.color.rgb = color
        pn.space_before = Pt(12)

        pd = tf_r.add_paragraph()
        pd.text = desc
        pd.font.name = 'Segoe UI'
        pd.font.size = Pt(11)
        pd.font.color.rgb = C_MUTED
        pd.space_before = Pt(1)

    add_footer(s1, 1)

    s1.notes_slide.notes_text_frame.text = (
        "SPEAKER 1: Shuvransu Sekhar Sahoo (Captain) — Time: 0:00 to 0:30\n\n"
        "SPOKEN SCRIPT (Keep it simple and confident):\n"
        "\"Respected judges, faculty members, and fellow builders, good morning!\n"
        "We are Crystal Studio Labs, team ID BH26PS07T065, presenting Campus Relay for Problem Statement 07.\n\n"
        "Campus Relay is a resilient operating layer for everyday college operations.\n"
        "Instead of 10 different apps, registers, and WhatsApp groups, we unite hostel maintenance, leave approvals, gate security, certificates, and official circulars into a single, reliable engine.\n\n"
        "Our team is structured for strict 10-minute delivery: myself, Snehal, Manas, and Nandita will present our core workflows, while our technical leads Pruthiraj and Bibhu are ready for deep-dive architectural Q&A.\""
    )

    # =========================================================================
    # SLIDE 2: THE CAMPUS REALITY & OPERATING LAYER SOLUTION
    # =========================================================================
    s2 = prs.slides.add_slide(blank_layout)
    set_slide_background(s2)
    add_header(s2, "Ground Reality · 3 Institutional Failures · The Solution", 
               "The Campus Reality vs The Operating Layer", 
               "Moving from 3 broken operational failures to 1 reliable, closed-loop workflow")

    # Left Column: The 3 Core Campus Failures (Red Cards)
    c_prob_hdr = add_card(s2, Inches(0.8), Inches(2.1), Inches(8.8), Inches(0.6), C_RED_BG, C_RED)
    tf = c_prob_hdr.text_frame
    p = tf.paragraphs[0]
    p.text = "⚠️ THE 3 CRITICAL CAMPUS FAILURES (TODAY)"
    p.font.name = 'Segoe UI'
    p.font.size = Pt(12)
    p.font.bold = True
    p.font.color.rgb = C_RED

    problems = [
        ("1. Ghost Resolutions", "Technicians mark paper complaints as 'Closed' just to clean up queues, while the student's bathroom tap is still leaking with zero fix."),
        ("2. Porous Perimeter Security", "Paper gate registers cannot stop students from sharing passes or sneaking out twice on the same slip. No live outside headcount."),
        ("3. The Network Dead Zone", "Hostels and basements have zero Wi-Fi or data. Web portals crash when offline, and students without smartphones are completely locked out.")
    ]

    for i, (title, desc) in enumerate(problems):
        card = add_card(s2, Inches(0.8), Inches(2.9 + i * 2.3), Inches(8.8), Inches(2.1), C_WHITE, C_BORDER)
        tf = card.text_frame
        tf.word_wrap = True
        tf.margin_left = Inches(0.3)
        tf.margin_top = Inches(0.25)
        p = tf.paragraphs[0]
        p.text = title
        p.font.name = 'Segoe UI'
        p.font.size = Pt(14)
        p.font.bold = True
        p.font.color.rgb = C_RED
        
        pd = tf.add_paragraph()
        pd.text = desc
        pd.font.name = 'Segoe UI'
        pd.font.size = Pt(12)
        pd.font.color.rgb = C_MUTED
        pd.space_before = Pt(6)

    # Right Column: The Operating Layer Solutions (Green Cards)
    c_sol_hdr = add_card(s2, Inches(10.4), Inches(2.1), Inches(8.8), Inches(0.6), C_GREEN_BG, C_GREEN)
    tf = c_sol_hdr.text_frame
    p = tf.paragraphs[0]
    p.text = "✅ HOW CAMPUS RELAY SOLVES EACH FAILURE"
    p.font.name = 'Segoe UI'
    p.font.size = Pt(12)
    p.font.bold = True
    p.font.color.rgb = C_GREEN

    solutions = [
        ("1. Requester Verification Guard", "Staff can only mark tickets as 'RESOLVED'. A ticket CANNOT close until the student confirms: 'Yes, it is fixed'. Reopens instantly if unsatisfied!"),
        ("2. Anti-Passback Digital Gate Pass", "Sub-150ms verification with cryptographic QR. Passes automatically lock upon exit to prevent duplicate reuse, with live outside headcount."),
        ("3. Local-First PWA + Lobby Kiosks", "IndexedDB outbox queues sync automatically when online. Touch kiosks in lobbies allow students without phones to file tickets using Roll Number.")
    ]

    for i, (title, desc) in enumerate(solutions):
        card = add_card(s2, Inches(10.4), Inches(2.9 + i * 2.3), Inches(8.8), Inches(2.1), C_WHITE, C_BORDER)
        tf = card.text_frame
        tf.word_wrap = True
        tf.margin_left = Inches(0.3)
        tf.margin_top = Inches(0.25)
        p = tf.paragraphs[0]
        p.text = title
        p.font.name = 'Segoe UI'
        p.font.size = Pt(14)
        p.font.bold = True
        p.font.color.rgb = C_GREEN
        
        pd = tf.add_paragraph()
        pd.text = desc
        pd.font.name = 'Segoe UI'
        pd.font.size = Pt(12)
        pd.font.color.rgb = C_MUTED
        pd.space_before = Pt(6)

    # Bottom Connection Ribbon
    ribbon = add_card(s2, Inches(0.8), Inches(9.8), Inches(18.4), Inches(0.6), C_INDIGO_BG, C_INDIGO)
    tf = ribbon.text_frame
    p = tf.paragraphs[0]
    p.text = "UNIVERSAL ENGINE:  Report  ➔  Validate  ➔  Route / Approve  ➔  Track SLA  ➔  Resolve  ➔  Requester Verifies  ➔  Immutable Audit"
    p.font.name = 'Segoe UI'
    p.font.size = Pt(12)
    p.font.bold = True
    p.font.color.rgb = C_INDIGO
    p.alignment = PP_ALIGN.CENTER

    add_footer(s2, 2)

    s2.notes_slide.notes_text_frame.text = (
        "SPEAKER 1: Shuvransu Sekhar Sahoo (Captain) — Time: 0:30 to 2:00\n\n"
        "SPOKEN SCRIPT:\n"
        "\"Let’s look at what actually happens on campus today.\n"
        "Colleges face three deep operational failures:\n\n"
        "First, Ghost Resolutions: A student reports a broken water tap. The technician writes 'Closed' on a paper sheet just to clear their name, but the tap is still broken. There is zero proof.\n"
        "Second, Porous Perimeter Security: Gate passes are physical paper slips. Students borrow a friend's slip, sneak out twice, or leave campus without the warden knowing. Security guards have no live count of who is outside.\n"
        "Third, Network Dead Zones: In hostel rooms or basements, Wi-Fi drops to zero. Traditional websites crash completely. And students without smartphones are left behind.\n\n"
        "Campus Relay fixes all three:\n"
        "• We created the Requester Verification Guard: Staff can only mark tickets as 'Resolved'. Only the student can confirm 'Closed'.\n"
        "• We created Anti-Passback Gate Passes: Scanned in under 150 milliseconds. Once scanned out, the pass locks so nobody can reuse it.\n"
        "• We built a Local-First PWA that works offline, plus Touch Kiosks for students without phones.\n\n"
        "To explain our technical architecture, here is Snehal.\""
    )

    # =========================================================================
    # SLIDE 3: SYSTEM ARCHITECTURE
    # =========================================================================
    s3 = prs.slides.add_slide(blank_layout)
    set_slide_background(s3)
    add_header(s3, "Engineering Rigor · System Architecture", 
               "High-Concurrency System Architecture", 
               "Deterministic, sub-second performance engineered for thousands of concurrent campus users")

    # Image: campus_relay_architecture_diagram.jpg
    arch_img_path = os.path.join(ROOT_DIR, "docs", "assets", "campus_relay_architecture_diagram.jpg")
    if not os.path.exists(arch_img_path):
        arch_img_path = os.path.join(ROOT_DIR, "campus_relay_architecture_diagram.jpg")
    if os.path.exists(arch_img_path):
        s3.shapes.add_picture(arch_img_path, Inches(0.8), Inches(2.1), Inches(18.4), Inches(6.8))

    # Bottom 4 Bento Spec Cards
    specs = [
        ("Frontend PWA Shell", "React 18 · TypeScript 5 · Workbox PWA\nIndexedDB local outbox queue", C_BLUE),
        ("High-Throughput API", "Python 3.12 · FastAPI async endpoints\nPydantic v2 strict schema validation", C_INDIGO),
        ("Append-Only Ledger", "PostgreSQL 16 · SQLAlchemy 2.0 ORM\nDB triggers block UPDATE & DELETE", C_GREEN),
        ("3 Consolidated Roles", "Student · Teacher · Management\nScoped stations: Gate, Kiosk, Warden", C_AMBER)
    ]

    for i, (title, desc, color) in enumerate(specs):
        card = add_card(s3, Inches(0.8 + i * 4.65), Inches(9.1), Inches(4.45), Inches(1.3), C_WHITE, C_BORDER)
        tf = card.text_frame
        tf.word_wrap = True
        tf.margin_left = Inches(0.2)
        tf.margin_top = Inches(0.15)
        p = tf.paragraphs[0]
        p.text = title
        p.font.name = 'Segoe UI'
        p.font.size = Pt(12)
        p.font.bold = True
        p.font.color.rgb = color
        
        pd = tf.add_paragraph()
        pd.text = desc
        pd.font.name = 'Segoe UI'
        pd.font.size = Pt(10)
        pd.font.color.rgb = C_MUTED
        pd.space_before = Pt(3)

    add_footer(s3, 3)

    s3.notes_slide.notes_text_frame.text = (
        "SPEAKER 2: Snehal Kumar Moharana (Systems & Backend Architecture) — Time: 2:00 to 3:00\n\n"
        "SPOKEN SCRIPT:\n"
        "\"Thank you, Shuvransu.\n"
        "Judges, most software teams try to build separate apps: one for complaints, one for gate passes, one for certificates. This creates fragmented data and broken workflows.\n\n"
        "In Campus Relay, we engineered a single, Universal Case Engine.\n"
        "Every campus interaction—whether a broken ceiling fan, a 3-day leave request, or a bonafide certificate—runs through the exact same deterministic engine:\n"
        "Input Channels ➔ Core Operating Engine ➔ Data & Trust Verification.\n\n"
        "Our technology stack guarantees sub-second response times:\n"
        "• Modern React 18 & TypeScript PWA on the frontend with local IndexedDB storage.\n"
        "• Async Python 3.12 and FastAPI on the backend with strict Pydantic validation.\n"
        "• PostgreSQL 16 with Append-Only Audit Ledgers: database triggers physically block anyone, even administrators, from editing or deleting historical logs.\n"
        "• We also simplified security into three clear system roles: Student, Teacher, and Management.\""
    )

    # =========================================================================
    # SLIDE 4: UNIFIED REQUEST LIFECYCLE & VERIFICATION GUARD
    # =========================================================================
    s4 = prs.slides.add_slide(blank_layout)
    set_slide_background(s4)
    add_header(s4, "Deterministic State Machine · Zero Ghost Resolutions", 
               "The Unified Request Lifecycle", 
               "Ending 'Ghost Resolutions' with Mandatory Requester Verification and Active SLAs")

    # 5 Step Cards across the screen
    steps = [
        ("Step 1: Intake & Bind", "Room QR / PWA / Kiosk", "Student scans wall QR code. Location, room, and hostel block auto-binds in 2 taps without manual typing.", C_BLUE),
        ("Step 2: Routing & SLA", "Intelligent Dispatch", "Evaluates technician skill & workload. Assigns task and triggers active SLA countdown (e.g. 4 hours).", C_INDIGO),
        ("Step 3: Staff Resolution", "Work & Photo Proof", "Technician completes fix, uploads completion photo proof, and changes state to RESOLVED.", C_AMBER),
        ("Step 4: Requester Guard", "Student Verification", "TICKET DOES NOT CLOSE! Student checks fix. Confirms CLOSED or clicks REOPEN to escalate.", C_GREEN),
        ("Step 5: Immutable Audit", "Append-Only Record", "Every state change, photo, and timestamp written to PostgreSQL ledger with trigger locks.", C_INK)
    ]

    for i, (step_num, step_sub, desc, color) in enumerate(steps):
        card = add_card(s4, Inches(0.8 + i * 3.7), Inches(2.2), Inches(3.5), Inches(5.0), C_WHITE, C_BORDER)
        tf = card.text_frame
        tf.word_wrap = True
        tf.margin_left = Inches(0.25)
        tf.margin_top = Inches(0.3)
        
        p = tf.paragraphs[0]
        p.text = step_num
        p.font.name = 'Segoe UI'
        p.font.size = Pt(14)
        p.font.bold = True
        p.font.color.rgb = color
        
        ps = tf.add_paragraph()
        ps.text = step_sub
        ps.font.name = 'Segoe UI'
        ps.font.size = Pt(11)
        ps.font.color.rgb = C_MUTED
        ps.space_before = Pt(2)
        
        pd = tf.add_paragraph()
        pd.text = desc
        pd.font.name = 'Segoe UI'
        pd.font.size = Pt(12)
        pd.font.color.rgb = C_INK
        pd.space_before = Pt(14)

    # Big Guard Callout Card at Bottom
    c_guard = add_card(s4, Inches(0.8), Inches(7.5), Inches(18.4), Inches(2.8), C_GREEN_BG, C_GREEN, Pt(2))
    tf_g = c_guard.text_frame
    tf_g.word_wrap = True
    tf_g.margin_left = Inches(0.4)
    tf_g.margin_top = Inches(0.3)

    pg_title = tf_g.paragraphs[0]
    pg_title.text = "🛡️ THE REQUESTER VERIFICATION GUARD: HOW WE END GHOST RESOLUTIONS"
    pg_title.font.name = 'Segoe UI'
    pg_title.font.size = Pt(14)
    pg_title.font.bold = True
    pg_title.font.color.rgb = C_GREEN

    pg_body = tf_g.add_paragraph()
    pg_body.text = (
        "• The Golden Rule: Maintenance staff and contractors CAN ONLY mark a case as RESOLVED.\n"
        "• Absolute Lock: A case physically CANNOT reach CLOSED status until the student confirms: 'Yes, my tap is working.'\n"
        "• Instant Escalation: If the issue persists, the student clicks 'Reopen'. The ticket bounces immediately into the Warden's priority dashboard with historical delay penalties.\n"
        "• Result: Zero ghost resolutions, zero false paperwork, and 100% verified campus maintenance."
    )
    pg_body.font.name = 'Segoe UI'
    pg_body.font.size = Pt(13)
    pg_body.font.color.rgb = C_INK
    pg_body.space_before = Pt(8)

    add_footer(s4, 4)

    s4.notes_slide.notes_text_frame.text = (
        "SPEAKER 2: Snehal Kumar Moharana (0:45) -> Handover to SPEAKER 3: Manas Kumar Mallick — Time: 3:00 to 4:15\n\n"
        "SPOKEN SCRIPT:\n"
        "\"Look at how one request travels through Campus Relay.\n"
        "A student scans a QR code on their hostel wall. Our system auto-binds their room number and hostel block without any manual typing.\n"
        "Our intelligent routing assigns the ticket to the electrical technician and starts a live SLA countdown—for example, a 4-hour target.\n\n"
        "When the technician finishes, they upload a photo and mark it RESOLVED.\n"
        "But notice: THE TICKET DOES NOT CLOSE.\n"
        "Staff cannot close tickets on their own. The ticket stays open until the student opens their app and clicks 'Confirm'. If the tap is still leaking, the student clicks 'Reopen', and the ticket immediately escalates to the Warden's dashboard.\n\n"
        "Now, Manas will show our field workflows and gate security.\""
    )

    # =========================================================================
    # SLIDE 5: FIELD WORKFLOWS & PERIMETER SECURITY
    # =========================================================================
    s5 = prs.slides.add_slide(blank_layout)
    set_slide_background(s5)
    add_header(s5, "Field Workflows · Anti-Passback Gate Security", 
               "Field Workflows & Perimeter Security", 
               "Room-Level Maintenance and Anti-Passback Gate Security in Action")

    # Left Bento: Room QR Maintenance
    c_w1 = add_card(s5, Inches(0.8), Inches(2.2), Inches(8.8), Inches(7.4), C_WHITE, C_BORDER)
    tf_w1 = c_w1.text_frame
    tf_w1.word_wrap = True
    tf_w1.margin_left = Inches(0.4)
    tf_w1.margin_right = Inches(0.4)
    tf_w1.margin_top = Inches(0.4)

    p = tf_w1.paragraphs[0]
    p.text = "WORKFLOW 1: ROOM-LEVEL MAINTENANCE"
    p.font.name = 'Segoe UI'
    p.font.size = Pt(13)
    p.font.bold = True
    p.font.color.rgb = C_BLUE

    points_w1 = [
        ("📍 2-Tap Wall QR Intake", "Every hostel room wall has a unique QR code. Scanning auto-populates room number, floor, and block. Zero manual typing errors."),
        ("⏱️ Active SLA Countdown", "Visible countdown timer keeps technicians accountable. If a repair exceeds the target window, it triggers automatic priority escalation."),
        ("📸 Photo Proof Mandatory", "Technicians must upload photo evidence of the completed repair before submitting, preventing fraudulent claims."),
        ("🚫 Zero WhatsApp Spam", "Replaces messy 500-student chat groups with private, deterministic status tracking directly between student and maintenance staff.")
    ]
    for title, desc in points_w1:
        pt = tf_w1.add_paragraph()
        pt.text = title
        pt.font.name = 'Segoe UI'
        pt.font.size = Pt(13)
        pt.font.bold = True
        pt.font.color.rgb = C_INK
        pt.space_before = Pt(12)
        pd = tf_w1.add_paragraph()
        pd.text = desc
        pd.font.name = 'Segoe UI'
        pd.font.size = Pt(11)
        pd.font.color.rgb = C_MUTED
        pd.space_before = Pt(2)

    # Right Bento: Gate Security & Anti-Passback
    c_w2 = add_card(s5, Inches(10.4), Inches(2.2), Inches(8.8), Inches(7.4), C_WHITE, C_BORDER)
    tf_w2 = c_w2.text_frame
    tf_w2.word_wrap = True
    tf_w2.margin_left = Inches(0.4)
    tf_w2.margin_right = Inches(0.4)
    tf_w2.margin_top = Inches(0.4)

    p = tf_w2.paragraphs[0]
    p.text = "WORKFLOW 2: DIGITAL GATE PASS & ANTI-PASSBACK"
    p.font.name = 'Segoe UI'
    p.font.size = Pt(13)
    p.font.bold = True
    p.font.color.rgb = C_GREEN

    points_w2 = [
        ("⚡ 1-Second Digital Pass Issuance", "Student requests leave; Warden verifies guardian contact and approves. Cryptographic QR pass generated instantly on student phone."),
        ("🛡️ Sub-150ms Gate Scanner Verification", "Security guard scans pass on tablet. Verified instantly: student photo, roll number, validity window, and pass authenticity displayed."),
        ("🔒 Strict Anti-Passback Enforcement", "Once a student exits, the pass state transitions to OUT_OF_CAMPUS. A friend cannot reuse the QR code, and duplicate exits are physically blocked."),
        ("📊 Live Outside Headcount", "The Principal and Chief Warden have a real-time dashboard displaying the exact count and identities of all students currently outside campus.")
    ]
    for title, desc in points_w2:
        pt = tf_w2.add_paragraph()
        pt.text = title
        pt.font.name = 'Segoe UI'
        pt.font.size = Pt(13)
        pt.font.bold = True
        pt.font.color.rgb = C_INK
        pt.space_before = Pt(12)
        pd = tf_w2.add_paragraph()
        pd.text = desc
        pd.font.name = 'Segoe UI'
        pd.font.size = Pt(11)
        pd.font.color.rgb = C_MUTED
        pd.space_before = Pt(2)

    # Bottom Banner
    ribbon5 = add_card(s5, Inches(0.8), Inches(9.8), Inches(18.4), Inches(0.6), C_GREEN_BG, C_GREEN)
    tf = ribbon5.text_frame
    p = tf.paragraphs[0]
    p.text = "VERIFIED IN CODE: All workflows proven end-to-end in automated test suites (Hostel, Leave, Gate Desk, and Notifications)."
    p.font.name = 'Segoe UI'
    p.font.size = Pt(11)
    p.font.bold = True
    p.font.color.rgb = C_GREEN
    p.alignment = PP_ALIGN.CENTER

    add_footer(s5, 5)

    s5.notes_slide.notes_text_frame.text = (
        "SPEAKER 3: Manas Kumar Mallick (Case Lifecycle & Field Workflows) — Time: 4:15 to 6:30\n\n"
        "SPOKEN SCRIPT:\n"
        "\"Thank you, Snehal!\n"
        "Let’s see what happens when a student finds a broken ceiling fan in their hostel room.\n"
        "They don't write in a register or search for a warden. They point their phone camera at the QR code on their room wall.\n"
        "In two taps, the complaint is submitted. The technician receives the work order, an active countdown timer starts, and when finished, the technician uploads photo proof.\n\n"
        "Now look at campus perimeter safety:\n"
        "When a student gets approved for weekend leave, they receive a digital gate pass with a secure QR code.\n"
        "At the gate, the security guard scans it in under 150 milliseconds.\n"
        "Here is our biggest safety feature: Anti-Passback.\n"
        "Once a student exits, the pass is marked 'Outside Campus'. A student cannot screenshot the pass and send it to a friend to sneak out. Duplicate exits are blocked.\n"
        "And the Principal’s screen shows a live headcount of exactly how many students are outside right now.\n\n"
        "To show how we support students who don't have smartphones, here is Nandita.\""
    )

    # =========================================================================
    # SLIDE 6: LIVE STATIONS & PRODUCTION INTERFACE
    # =========================================================================
    s6 = prs.slides.add_slide(blank_layout)
    set_slide_background(s6)
    add_header(s6, "Production UI · Purpose-Built Stations", 
               "Live Stations & Production Interfaces", 
               "Dedicated, high-contrast screens for Students, Security Guards, and Administrators")

    # Image: campus_relay_wireframe_mockup.jpg
    mockup_img_path = os.path.join(ROOT_DIR, "docs", "assets", "campus_relay_wireframe_mockup.jpg")
    if not os.path.exists(mockup_img_path):
        mockup_img_path = os.path.join(ROOT_DIR, "campus_relay_wireframe_mockup.jpg")
    if os.path.exists(mockup_img_path):
        s6.shapes.add_picture(mockup_img_path, Inches(0.8), Inches(2.1), Inches(18.4), Inches(6.8))

    # Bottom 3 Station Description Bento Cards
    stations = [
        ("📱 Student Mobile PWA", "Instant Room QR scanning, live countdown timer, and 1-tap resolution confirmation.", C_BLUE),
        ("🛡️ Gate Security Desk", "Sub-150ms verification banner: 'PASS VALID — ALLOW MOVEMENT' and anti-passback guard.", C_GREEN),
        ("💻 Admin Command Centre", "Live resolution metrics, overdue ageing buckets, and active campus headcounts.", C_INDIGO)
    ]

    for i, (title, desc, color) in enumerate(stations):
        card = add_card(s6, Inches(0.8 + i * 6.25), Inches(9.1), Inches(5.9), Inches(1.3), C_WHITE, C_BORDER)
        tf = card.text_frame
        tf.word_wrap = True
        tf.margin_left = Inches(0.25)
        tf.margin_top = Inches(0.15)
        p = tf.paragraphs[0]
        p.text = title
        p.font.name = 'Segoe UI'
        p.font.size = Pt(13)
        p.font.bold = True
        p.font.color.rgb = color
        
        pd = tf.add_paragraph()
        pd.text = desc
        pd.font.name = 'Segoe UI'
        pd.font.size = Pt(11)
        pd.font.color.rgb = C_MUTED
        pd.space_before = Pt(3)

    add_footer(s6, 6)

    s6.notes_slide.notes_text_frame.text = (
        "SPEAKER 3: Manas (0:30) -> Handover to SPEAKER 4: Nandita Das — Time: 6:30 to 7:15\n\n"
        "SPOKEN SCRIPT:\n"
        "\"Here is our production interface in action across three devices:\n"
        "On the left, the Student PWA: Clean, clear, with the active SLA timer and 1-tap verification.\n"
        "In the middle, the Gate Security Tablet: High-contrast green banner showing 'PASS VALID — ALLOW MOVEMENT' with instant Anti-Passback confirmation.\n"
        "On the right, the Admin Command Centre: Real-time department resolution graphs, overdue ageing buckets, and live approval queues.\n\n"
        "Now Nandita will explain our digital equity kiosks, notice broadcasting, and institutional value.\""
    )

    # =========================================================================
    # SLIDE 7: DIGITAL EQUITY, NOTICES & INSTITUTIONAL VALUE
    # =========================================================================
    s7 = prs.slides.add_slide(blank_layout)
    set_slide_background(s7)
    add_header(s7, "Digital Inclusivity · Targeted Notices · NAAC Readiness", 
               "Digital Equity, Communications & NAAC Readiness", 
               "Including every student, eliminating spam, and delivering auditable institutional governance")

    # 3 Large Bento Cards
    pillars = [
        ("🖥️ TOUCH-FIRST LOBBY KIOSKS", 
         "Digital Equity for Non-Smartphone Users",
         [
             "• Self-Service Kiosks deployed in academic lobbies.",
             "• Students enter University Roll Number + PIN to raise complaints and view leaves without any smartphone.",
             "• Assisted Helpdesk Mode: Staff can file on behalf of students with full proxy tracking.",
             "• Fully Trilingual UI: English, Odia, and Hindi supported across all 549 interface keys."
         ], C_BLUE),
        ("📢 TARGETED NOTICE STUDIO", 
         "Ending Unofficial WhatsApp Group Spam",
         [
             "• Targeted Audiences: Deans broadcast notices to specific groups (e.g. 'Hostel Block B' or '3rd Year Mechanical').",
             "• Recipient State Machine: Tracks delivery state: Sent ➔ Delivered ➔ Read ➔ Acknowledged.",
             "• Emergency Broadcasts: Cyclone alerts, water cuts, and urgent advisories reach students instantly.",
             "• Full Audit Proof: Real-time report of exactly who acknowledged the notice."
         ], C_INDIGO),
        ("🏛️ INSTITUTIONAL ROI & NAAC VALUE", 
         "Accreditation-Ready Governance",
         [
             "• NAAC Criteria 4 & 5 Compliance: 1-click generation of grievance redressal and maintenance audit reports.",
             "• Verifiable Certificates: Bonafide & leave certificates have high-density QR codes for instant public verification.",
             "• Zero License Cost: Open-source MIT stack with zero recurring per-student subscription fees.",
             "• Single Configuration File: Entire college profile configured in institution.json."
         ], C_GREEN)
    ]

    for i, (title, sub, bullet_list, color) in enumerate(pillars):
        card = add_card(s7, Inches(0.8 + i * 6.25), Inches(2.2), Inches(5.9), Inches(8.1), C_WHITE, C_BORDER)
        tf = card.text_frame
        tf.word_wrap = True
        tf.margin_left = Inches(0.35)
        tf.margin_right = Inches(0.35)
        tf.margin_top = Inches(0.35)

        p = tf.paragraphs[0]
        p.text = title
        p.font.name = 'Segoe UI'
        p.font.size = Pt(13)
        p.font.bold = True
        p.font.color.rgb = color

        ps = tf.add_paragraph()
        ps.text = sub
        ps.font.name = 'Segoe UI'
        ps.font.size = Pt(11)
        ps.font.bold = True
        ps.font.color.rgb = C_INK
        ps.space_before = Pt(4)

        for b in bullet_list:
            pb = tf.add_paragraph()
            pb.text = b
            pb.font.name = 'Segoe UI'
            pb.font.size = Pt(11)
            pb.font.color.rgb = C_MUTED
            pb.space_before = Pt(10)

    add_footer(s7, 7)

    s7.notes_slide.notes_text_frame.text = (
        "SPEAKER 4: Nandita Das (Digital Equity, Comms & Institutional Value) — Time: 7:15 to 8:45\n\n"
        "SPOKEN SCRIPT:\n"
        "\"Thank you, Manas!\n"
        "A common mistake in campus technology is assuming every student owns an expensive smartphone and high-speed data. What about students with broken phones or from underprivileged backgrounds?\n\n"
        "Campus Relay solves this with Touch-First Lobby Kiosks:\n"
        "A student walks up to a lobby kiosk, enters their university roll number, and can raise a complaint, check leave status, or view circulars without needing any smartphone.\n"
        "And our interface is completely trilingual: English, Odia, and Hindi from day one.\n\n"
        "Next, we eliminated noisy WhatsApp groups with our Targeted Notice Studio.\n"
        "The Dean can send a notice only to 'Hostel Block B' or '3rd Year Mechanical'. The system tracks who received it, who read it, and who digitally acknowledged it.\n\n"
        "Finally, for college leadership: during NAAC or NBA accreditation, colleges struggle to prove grievance handling.\n"
        "Campus Relay generates 1-click NAAC Criteria 4 and 5 audit reports, backed by tamper-proof database logs.\n\n"
        "Now, our team captain Shuvransu will conclude our presentation.\""
    )

    # =========================================================================
    # SLIDE 8: RAPID ADOPTION, RADICAL HONESTY & TECHNICAL DEFENSE
    # =========================================================================
    s8 = prs.slides.add_slide(blank_layout)
    set_slide_background(s8)
    add_header(s8, "Rapid Adoption · Radical Transparency · Technical Q&A", 
               "Rapid Adoption & Verified Engineering", 
               "The 60-Minute Deployment Guarantee, Honest Done vs Next Split, and Technical Q&A Defense")

    # Top Card: 60-Minute Adoption Guarantee
    c_adopt = add_card(s8, Inches(0.8), Inches(2.2), Inches(18.4), Inches(1.8), C_INDIGO_BG, C_INDIGO, Pt(1.5))
    tf_a = c_adopt.text_frame
    tf_a.word_wrap = True
    tf_a.margin_left = Inches(0.4)
    tf_a.margin_top = Inches(0.2)

    pa_title = tf_a.paragraphs[0]
    pa_title.text = "⚡ THE 60-MINUTE RAPID ADOPTION GUARANTEE"
    pa_title.font.name = 'Segoe UI'
    pa_title.font.size = Pt(13)
    pa_title.font.bold = True
    pa_title.font.color.rgb = C_INDIGO

    pa_desc = tf_a.add_paragraph()
    pa_desc.text = (
        "Colleges cannot afford six months of painful IT migration. Campus Relay is 100% configuration-driven.\n"
        "Provide your institution's standard CSV rosters (students, faculty, rooms, departments), and our system is seeded, calibrated, and operational on your campus in under 60 minutes. Zero custom code required per institution."
    )
    pa_desc.font.name = 'Segoe UI'
    pa_desc.font.size = Pt(12)
    pa_desc.font.color.rgb = C_INK
    pa_desc.space_before = Pt(4)

    # Left Panel: What is Done & Verified (Green)
    c_done = add_card(s8, Inches(0.8), Inches(4.3), Inches(8.8), Inches(4.5), C_WHITE, C_BORDER)
    tf_d = c_done.text_frame
    tf_d.word_wrap = True
    tf_d.margin_left = Inches(0.35)
    tf_d.margin_top = Inches(0.3)

    pd_title = tf_d.paragraphs[0]
    pd_title.text = "✅ WHAT IS BUILT & VERIFIED TODAY"
    pd_title.font.name = 'Segoe UI'
    pd_title.font.size = Pt(13)
    pd_title.font.bold = True
    pd_title.font.color.rgb = C_GREEN

    done_items = [
        "✔ 145 Backend Automated Tests passing across 16 test suites",
        "✔ Clean TypeScript compilation (0 errors via npx tsc --noEmit)",
        "✔ 62 Permissions Enforced via AST-verified RBAC audit",
        "✔ 100% Offline-Capable PWA with IndexedDB outbox & replay",
        "✔ Trilingual Localization: English, Odia, Hindi (549 keys each)",
        "✔ MIT Open-Source codebase committed & pushed to GitHub"
    ]
    for item in done_items:
        p = tf_d.add_paragraph()
        p.text = item
        p.font.name = 'Segoe UI'
        p.font.size = Pt(11)
        p.font.color.rgb = C_INK
        p.space_before = Pt(6)

    # Right Panel: What is Next on Roadmap (Amber)
    c_next = add_card(s8, Inches(10.4), Inches(4.3), Inches(8.8), Inches(4.5), C_WHITE, C_BORDER)
    tf_n = c_next.text_frame
    tf_n.word_wrap = True
    tf_n.margin_left = Inches(0.35)
    tf_n.margin_top = Inches(0.3)

    pn_title = tf_n.paragraphs[0]
    pn_title.text = "⏳ WHAT IS NEXT ON OUR ROADMAP"
    pn_title.font.name = 'Segoe UI'
    pn_title.font.size = Pt(13)
    pn_title.font.bold = True
    pn_title.font.color.rgb = C_AMBER

    next_items = [
        "• Native Hardware Barcode Gun integration for high-speed gate lanes",
        "• Direct Automated SMS Gateway fallback for offline parent alerts",
        "• Multi-Campus Federated Analytics for state university groups",
        "• Expanded automated frontend component test coverage",
        "• Production cloud hosting migration to university server nodes",
        "• Automated timetable change broadcast integration"
    ]
    for item in next_items:
        p = tf_n.add_paragraph()
        p.text = item
        p.font.name = 'Segoe UI'
        p.font.size = Pt(11)
        p.font.color.rgb = C_MUTED
        p.space_before = Pt(6)

    # Bottom Callout: Technical Defense Team
    c_qna = add_card(s8, Inches(0.8), Inches(9.1), Inches(18.4), Inches(1.3), C_WHITE, C_INDIGO, Pt(1.5))
    tf_q = c_qna.text_frame
    tf_q.word_wrap = True
    tf_q.margin_left = Inches(0.4)
    tf_q.margin_top = Inches(0.15)

    pq = tf_q.paragraphs[0]
    pq.text = "🛡️ TECHNICAL DEFENSE LEADS STANDING BY FOR Q&A"
    pq.font.name = 'Segoe UI'
    pq.font.size = Pt(12)
    pq.font.bold = True
    pq.font.color.rgb = C_INDIGO

    pq_sub = tf_q.add_paragraph()
    pq_sub.text = (
        "• Pruthiraj Lenka (Lead Frontend & Offline PWA) — Ready for questions on IndexedDB, service workers, and sync idempotency.\n"
        "• Bibhu Bhusan Giri (Lead Security & Audit) — Ready for questions on anti-passback gate security, HMAC signatures, and database triggers."
    )
    pq_sub.font.name = 'Segoe UI'
    pq_sub.font.size = Pt(11)
    pq_sub.font.color.rgb = C_INK
    pq_sub.space_before = Pt(3)

    add_footer(s8, 8)

    s8.notes_slide.notes_text_frame.text = (
        "SPEAKER 1: Shuvransu Sekhar Sahoo (Captain) — Time: 8:45 to 10:00\n\n"
        "SPOKEN SCRIPT:\n"
        "\"Thank you, Nandita!\n"
        "Judges, when college administrators see our system, their first question is:\n"
        "'Will this take months of painful setup?'\n"
        "Our answer is NO. We offer a 60-Minute Adoption Guarantee.\n"
        "Provide your college's basic CSV lists—students, faculty, and hostel rooms—and Campus Relay is live in under one hour.\n\n"
        "We also believe in radical transparency:\n"
        "Everything we showed today is built and verified in our repository:\n"
        "• 145 automated tests passing\n"
        "• Zero TypeScript compilation errors\n"
        "• 62 security permissions enforced\n"
        "• Offline PWA and lobby kiosks working.\n\n"
        "Campus Relay is not an idea on paper. It is a tested, resilient operating system ready to transform Indian colleges today.\n\n"
        "Thank you! Our technical leads, Pruthiraj Lenka and Bibhu Bhusan Giri, are here with us, and we welcome your questions!\""
    )

    out_path = r"d:\Projects\Campus-Relay\Campus Relay.pptx"
    prs.save(out_path)
    print(f"Presentation successfully created and saved to {out_path} ({len(prs.slides)} slides)!")

if __name__ == "__main__":
    create_presentation()
