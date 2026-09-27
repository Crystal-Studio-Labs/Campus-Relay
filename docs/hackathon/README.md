# 🏆 BPUT Hackathon 2026 — Problem Statement 07 Materials

> **Official Competition Briefs, Architectural Prompts & Presentation Scripts**  
> *Developed by **Crystal Studio Labs** for BPUT Hackathon 2026 (Problem Statement 07: Fretbox)*

[![Hackathon](https://img.shields.io/badge/Hackathon-BPUT_2026-6366f1.svg?style=flat-square)](https://bput.ac.in)
[![Track](https://img.shields.io/badge/Track-Problem_Statement_07-0ea5e9.svg?style=flat-square)](#quick-reference-ps07-focus-areas)
[![Team](https://img.shields.io/badge/Team-Crystal_Studio_Labs-10b981.svg?style=flat-square)](#-contact--institutional-support)
[![Contact](https://img.shields.io/badge/Email-connect.crystalstudio%40gmail.com-amber.svg?style=flat-square)](#-contact--institutional-support)

---

## 🧭 Navigation
[Root README](../../README.md) • [Documentation Hub](../README.md) • [Architecture Guide](../architecture/architecture.md) • [Demo Script](../guides/demo-script.md)

---

## 📂 Materials in this Directory

> [!NOTE]
> This folder consolidates competition requirements, pitch deck generation scripts, and architectural prompts for **Campus Relay**.

| File | Description & Contents | Target Audience |
| :--- | :--- | :--- |
| [`Problem_Statement_7.pdf`](./Problem_Statement_7.pdf) | Official problem statement brief for **Problem Statement 07 (Fretbox)** issued for BPUT Hackathon 2026. | Jury & Review Committee |
| [`ppt.txt`](./ppt.txt) | 10-slide master pitch deck generation prompt calibrated for **Gamma AI**, formatted with industrial brutalism visual language, slide content, speaker notes, and verified system facts. | Pitch Team |
| [`prompt.txt`](./prompt.txt) | Master architectural specification and build prompt defining the engineering requirements, data models, workflows, offline persistence, and role matrix for Campus Relay. | Core Engineers |

---

## 🎯 Quick Reference: PS07 Focus Areas

```mermaid
flowchart TD
    PS07[Problem Statement 07: Fretbox] --> F1[1. Hostel & Facility Maintenance]
    PS07 --> F2[2. Gate Security & Anti-Passback]
    PS07 --> F3[3. Official Broadcasts & Circulars]
    PS07 --> F4[4. Local-First Offline Resilience]

    F1 --> F1_Detail["QR Room Linking • Priority Elevation • Requester Guard"]
    F2 --> F2_Detail["Sub-150ms Scans • Movement Reversal Guard • Live Headcounts"]
    F3 --> F3_Detail["Targeted Dispatch • Recipient State Machine • Media Attachments"]
    F4 --> F4_Detail["IndexedDB Outbox • Idempotent Replay • Zero Data Loss"]

    style PS07 fill:#1e3a8a,stroke:#172554,color:#ffffff
    style F1 fill:#2563eb,stroke:#1d4ed8,color:#ffffff
    style F2 fill:#0284c7,stroke:#0369a1,color:#ffffff
    style F3 fill:#059669,stroke:#064e3b,color:#ffffff
    style F4 fill:#d97706,stroke:#b45309,color:#ffffff
```

1. **Hostel & Facility Maintenance**: Fast QR-based fault reporting, room-level linking, technician dispatching, and digital resolution verification.
2. **Gate Security & Curfew Enforcement**: Sub-150ms cryptographic QR pass validation, offline gate scanning, and live outside headcount tracking.
3. **Official Broadcasts & Circulars**: Multi-channel notice distribution (Telegram, WhatsApp, Web, Corridor Kiosks) with guaranteed recipient tracking and mandatory acknowledgement.
4. **Local-First Offline Resilience**: IndexedDB client outbox ensuring zero data loss during basement connectivity dead zones.

---

### 📬 Contact & Institutional Support
- **Lead Organization**: **Crystal Studio Labs**
- **Direct Support & Inquiries**: [`connect.crystalstudio@gmail.com`](mailto:connect.crystalstudio@gmail.com)
- **Competition Track**: BPUT Hackathon 2026 — Problem Statement 07 (Fretbox)
- **Main Repository**: [GitHub: Crystal-Studio-Labs/Campus-Relay](https://github.com/Crystal-Studio-Labs/Campus-Relay)
