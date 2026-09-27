# BPUT Hackathon 2026 — Problem Statement 07 Materials

This directory consolidates the competition requirements, presentation generation scripts, and architectural prompts for **Campus Relay** by **Crystal Studio Labs**.

---

## Files in this Directory

| File | Description |
| :--- | :--- |
| [`Problem_Statement_7.pdf`](./Problem_Statement_7.pdf) | Official problem statement brief for **Problem Statement 07 (Fretbox)** issued for BPUT Hackathon 2026. |
| [`ppt.txt`](./ppt.txt) | 10-slide master pitch deck generation prompt calibrated for **Gamma AI**, formatted with industrial brutalism visual language, slide content, speaker notes, and verified system facts. |
| [`prompt.txt`](./prompt.txt) | Master architectural specification and build prompt defining the engineering requirements, data models, workflows, offline persistence, and role matrix for Campus Relay. |

---

## Quick Reference: PS07 Focus Areas

1. **Hostel & Facility Maintenance**: Fast QR-based fault reporting, room-level linking, technician dispatching, and digital resolution verification.
2. **Gate Security & Curfew Enforcement**: Sub-150ms cryptographic QR pass validation, offline gate scanning, and live outside headcount tracking.
3. **Official Broadcasts & Circulars**: Multi-channel notice distribution (Telegram, WhatsApp, Web, Corridor Kiosks) with guaranteed recipient tracking and mandatory acknowledgement.
4. **Local-First Offline Resilience**: IndexedDB client outbox ensuring zero data loss during basement connectivity dead zones.
