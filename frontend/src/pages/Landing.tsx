/** Public landing page - Campus Relay.
 *
 *  Engineered by Crystal Studio Labs for BPUT Hackathon 2026
 *  Problem Statement 07 (Fretbox): Resilient Campus Operations & Management
 */

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import { useRemote } from '../state/hooks'
import { useTheme, THEME_OPTIONS } from '../state/theme'
import { useInstitution } from '../state/institution'
import { Badge, Button } from '../components/ui'
import { MasterFooter } from '../components/Footer'

// --- High-fidelity SVG Icons for Industrial Brutalism ---
function IconAlert() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  )
}

function IconOffline() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square">
      <path d="M1 1l22 22" />
      <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
      <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
      <path d="M10.71 5.05A16 16 0 0 1 22.58 9" />
      <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
      <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
      <line x1="12" y1="20" x2="12.01" y2="20" />
    </svg>
  )
}

function IconShield() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  )
}

function IconClock() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  )
}

function IconCpu() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square">
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <rect x="9" y="9" width="6" height="6" />
      <line x1="9" y1="1" x2="9" y2="4" />
      <line x1="15" y1="1" x2="15" y2="4" />
      <line x1="9" y1="20" x2="9" y2="23" />
      <line x1="15" y1="20" x2="15" y2="23" />
      <line x1="20" y1="9" x2="23" y2="9" />
      <line x1="20" y1="14" x2="23" y2="14" />
      <line x1="1" y1="9" x2="4" y2="9" />
      <line x1="1" y1="14" x2="4" y2="14" />
    </svg>
  )
}

function IconQr() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square">
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
    </svg>
  )
}

function IconLayers() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square">
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </svg>
  )
}

// --- Bespoke Vector SVG Schematics for Industrial Brutalism ---
function VectorCaseEngine() {
  return (
    <svg className="vector-graphic" viewBox="0 0 340 96" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="2" width="336" height="92" rx="4" fill="var(--surface-alt)" stroke="var(--line)" strokeWidth="1.5" />
      <rect x="12" y="24" width="62" height="48" rx="4" fill="var(--surface)" stroke="var(--line)" strokeWidth="1.5" />
      <text x="43" y="44" fill="var(--ink)" fontSize="8.5" fontWeight="800" textAnchor="middle" fontFamily="var(--font-mono)">SUBMIT</text>
      <text x="43" y="58" fill="var(--muted-ink)" fontSize="7" textAnchor="middle">Ticket / Pass</text>
      <path d="M74 48H96M96 48L90 43M96 48L90 53" stroke="var(--signal)" strokeWidth="1.5" strokeLinecap="square" />
      <rect x="98" y="16" width="76" height="64" rx="4" fill="var(--surface)" stroke="var(--signal)" strokeWidth="2" />
      <rect x="104" y="22" width="64" height="13" rx="2" fill="color-mix(in srgb, var(--signal) 15%, transparent)" />
      <text x="136" y="32" fill="var(--signal)" fontSize="7.5" fontWeight="800" textAnchor="middle" fontFamily="var(--font-mono)">CORE ENGINE</text>
      <text x="136" y="51" fill="var(--ink)" fontSize="8.5" fontWeight="700" textAnchor="middle">State Machine</text>
      <text x="136" y="66" fill="var(--muted-ink)" fontSize="7" textAnchor="middle">Guards &amp; SLAs</text>
      <path d="M174 48H196M196 48L190 43M196 48L190 53" stroke="var(--signal)" strokeWidth="1.5" strokeLinecap="square" />
      <rect x="198" y="24" width="62" height="48" rx="4" fill="var(--surface)" stroke="var(--line)" strokeWidth="1.5" />
      <text x="229" y="44" fill="var(--ink)" fontSize="8.5" fontWeight="800" textAnchor="middle" fontFamily="var(--font-mono)">ACTION</text>
      <text x="229" y="58" fill="var(--sun)" fontSize="7" textAnchor="middle">Dispatched</text>
      <path d="M260 48H280M280 48L274 43M280 48L274 53" stroke="var(--mint)" strokeWidth="1.5" strokeLinecap="square" />
      <rect x="282" y="24" width="46" height="48" rx="4" fill="color-mix(in srgb, var(--mint) 14%, transparent)" stroke="var(--mint)" strokeWidth="1.5" />
      <text x="305" y="44" fill="var(--mint)" fontSize="8.5" fontWeight="800" textAnchor="middle" fontFamily="var(--font-mono)">DONE</text>
      <text x="305" y="58" fill="var(--mint)" fontSize="7" textAnchor="middle">Verified</text>
    </svg>
  )
}

function VectorOfflineOutbox() {
  return (
    <svg className="vector-graphic" viewBox="0 0 340 96" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="2" width="336" height="92" rx="4" fill="var(--surface-alt)" stroke="var(--line)" strokeWidth="1.5" />
      <rect x="12" y="14" width="46" height="68" rx="5" fill="var(--surface)" stroke="var(--line)" strokeWidth="1.5" />
      <rect x="16" y="20" width="38" height="52" rx="2" fill="var(--surface-alt)" />
      <rect x="19" y="26" width="32" height="18" rx="2" fill="color-mix(in srgb, var(--signal) 15%, transparent)" stroke="var(--signal)" strokeWidth="1" />
      <text x="35" y="38" fill="var(--signal)" fontSize="6" fontWeight="800" textAnchor="middle" fontFamily="var(--font-mono)">OUTBOX</text>
      <text x="35" y="60" fill="var(--danger)" fontSize="7" fontWeight="700" textAnchor="middle">⚡ NO NET</text>
      <path d="M62 48H122" stroke="var(--line)" strokeWidth="1.5" strokeDasharray="3 3" />
      <rect x="74" y="34" width="42" height="26" rx="3" fill="var(--surface)" stroke="var(--line)" strokeWidth="1.2" />
      <text x="95" y="47" fill="var(--ink)" fontSize="6.5" fontWeight="800" textAnchor="middle" fontFamily="var(--font-mono)">IDEMPOTENT</text>
      <text x="95" y="56" fill="var(--muted-ink)" fontSize="6" textAnchor="middle">Hash Key</text>
      <path d="M120 48H148M148 48L142 43M148 48L142 53" stroke="var(--mint)" strokeWidth="1.5" />
      <rect x="150" y="20" width="76" height="56" rx="4" fill="var(--surface)" stroke="var(--mint)" strokeWidth="1.5" />
      <text x="188" y="38" fill="var(--mint)" fontSize="8" fontWeight="800" textAnchor="middle" fontFamily="var(--font-mono)">RECONNECT</text>
      <text x="188" y="52" fill="var(--ink)" fontSize="7.5" fontWeight="600" textAnchor="middle">Auto-Replay</text>
      <text x="188" y="64" fill="var(--muted-ink)" fontSize="6.5" textAnchor="middle">Zero Data Loss</text>
      <path d="M226 48H254M254 48L248 43M254 48L248 53" stroke="var(--mint)" strokeWidth="1.5" />
      <rect x="256" y="16" width="72" height="64" rx="4" fill="color-mix(in srgb, var(--mint) 12%, transparent)" stroke="var(--mint)" strokeWidth="1.5" />
      <text x="292" y="38" fill="var(--mint)" fontSize="8.5" fontWeight="800" textAnchor="middle" fontFamily="var(--font-mono)">SERVER DB</text>
      <text x="292" y="52" fill="var(--ink)" fontSize="7.5" fontWeight="700" textAnchor="middle">PostgreSQL</text>
      <text x="292" y="66" fill="var(--muted-ink)" fontSize="6.5" textAnchor="middle">Timestamp Kept</text>
    </svg>
  )
}

function VectorQrGateSecurity() {
  return (
    <svg className="vector-graphic" viewBox="0 0 340 96" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="2" width="336" height="92" rx="4" fill="var(--surface-alt)" stroke="var(--line)" strokeWidth="1.5" />
      <rect x="14" y="18" width="58" height="60" rx="4" fill="var(--surface)" stroke="var(--line)" strokeWidth="1.5" />
      <rect x="22" y="26" width="16" height="16" fill="var(--ink)" />
      <rect x="44" y="26" width="16" height="16" fill="var(--ink)" />
      <rect x="22" y="48" width="16" height="16" fill="var(--ink)" />
      <rect x="46" y="50" width="6" height="6" fill="var(--signal)" />
      <rect x="54" y="58" width="6" height="6" fill="var(--ink)" />
      <text x="43" y="74" fill="var(--muted-ink)" fontSize="6" textAnchor="middle" fontFamily="var(--font-mono)">HMAC QR TOKEN</text>
      <path d="M76 48H106" stroke="var(--danger)" strokeWidth="1.8" strokeDasharray="3 2" />
      <path d="M106 48L100 43M106 48L100 53" stroke="var(--danger)" strokeWidth="1.5" />
      <rect x="110" y="20" width="80" height="56" rx="4" fill="var(--surface)" stroke="var(--signal)" strokeWidth="1.5" />
      <text x="150" y="38" fill="var(--signal)" fontSize="7.5" fontWeight="800" textAnchor="middle" fontFamily="var(--font-mono)">GATE SCANNER</text>
      <text x="150" y="52" fill="var(--ink)" fontSize="8" fontWeight="700" textAnchor="middle">1-Tap Verification</text>
      <text x="150" y="65" fill="var(--muted-ink)" fontSize="6.5" textAnchor="middle">HMAC Validated</text>
      <path d="M190 48H216M216 48L210 43M216 48L210 53" stroke="var(--mint)" strokeWidth="1.5" />
      <rect x="218" y="16" width="108" height="64" rx="4" fill="color-mix(in srgb, var(--mint) 12%, transparent)" stroke="var(--mint)" strokeWidth="1.5" />
      <text x="272" y="34" fill="var(--mint)" fontSize="8" fontWeight="800" textAnchor="middle" fontFamily="var(--font-mono)">✓ PASS AUTHORIZED</text>
      <text x="272" y="48" fill="var(--ink)" fontSize="7.5" textAnchor="middle">Curfew: 18:00 - 21:30</text>
      <rect x="228" y="56" width="88" height="18" rx="2" fill="var(--surface)" stroke="var(--line)" />
      <text x="272" y="68" fill="var(--signal)" fontSize="7" fontWeight="700" textAnchor="middle" fontFamily="var(--font-mono)">OUTSIDE HEADCOUNT: 142</text>
    </svg>
  )
}

function VectorAiOperations() {
  return (
    <svg className="vector-graphic" viewBox="0 0 340 96" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="2" width="336" height="92" rx="4" fill="var(--surface-alt)" stroke="var(--line)" strokeWidth="1.5" />
      <rect x="12" y="20" width="70" height="56" rx="4" fill="var(--surface)" stroke="var(--lilac)" strokeWidth="1.5" />
      <rect x="18" y="26" width="58" height="14" rx="2" fill="color-mix(in srgb, var(--lilac) 15%, transparent)" />
      <text x="47" y="36" fill="var(--lilac)" fontSize="7.5" fontWeight="800" textAnchor="middle" fontFamily="var(--font-mono)">AI FLEET</text>
      <text x="47" y="52" fill="var(--ink)" fontSize="7.5" fontWeight="700" textAnchor="middle">4 Operators</text>
      <text x="47" y="65" fill="var(--muted-ink)" fontSize="6.5" textAnchor="middle">Human Governed</text>
      <path d="M82 36H114M114 36L108 32M114 36L108 40" stroke="var(--lilac)" strokeWidth="1.2" />
      <rect x="116" y="14" width="94" height="20" rx="3" fill="var(--surface)" stroke="var(--line)" />
      <text x="163" y="27" fill="var(--ink)" fontSize="6.8" fontWeight="700" textAnchor="middle" fontFamily="var(--font-mono)">1. Auto-Triage &amp; Tag</text>
      <path d="M82 60H114M114 60L108 56M114 60L108 64" stroke="var(--lilac)" strokeWidth="1.2" />
      <rect x="116" y="38" width="94" height="20" rx="3" fill="var(--surface)" stroke="var(--line)" />
      <text x="163" y="51" fill="var(--ink)" fontSize="6.8" fontWeight="700" textAnchor="middle" fontFamily="var(--font-mono)">2. SLA Breach Sweeps</text>
      <rect x="116" y="62" width="94" height="20" rx="3" fill="var(--surface)" stroke="var(--line)" />
      <text x="163" y="75" fill="var(--ink)" fontSize="6.8" fontWeight="700" textAnchor="middle" fontFamily="var(--font-mono)">3. Smart Dispatch</text>
      <path d="M210 48H234M234 48L228 43M234 48L228 53" stroke="var(--signal)" strokeWidth="1.5" />
      <rect x="236" y="16" width="92" height="64" rx="4" fill="color-mix(in srgb, var(--signal) 12%, transparent)" stroke="var(--signal)" strokeWidth="1.5" />
      <text x="282" y="36" fill="var(--signal)" fontSize="7.5" fontWeight="800" textAnchor="middle" fontFamily="var(--font-mono)">DAILY BRIEFING</text>
      <text x="282" y="50" fill="var(--ink)" fontSize="7.5" fontWeight="700" textAnchor="middle">Executive Digest</text>
      <text x="282" y="65" fill="var(--muted-ink)" fontSize="6.5" textAnchor="middle">Synthesized 06:00</text>
    </svg>
  )
}

function VectorArchTier1Edge() {
  return (
    <svg viewBox="0 0 640 160" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="2" width="636" height="156" rx="3" fill="var(--surface)" stroke="var(--line)" strokeWidth="1.5" />
      <rect x="14" y="16" width="120" height="128" rx="2" fill="var(--surface-alt)" stroke="var(--line)" strokeWidth="1.2" />
      <text x="74" y="32" fill="var(--signal)" fontSize="8.5" fontWeight="800" textAnchor="middle" fontFamily="var(--font-mono)">STATION ENDPOINTS</text>
      <rect x="22" y="40" width="104" height="20" rx="2" fill="var(--surface)" stroke="var(--line)" strokeWidth="1" />
      <text x="74" y="53" fill="var(--ink)" fontSize="7.5" fontWeight="700" textAnchor="middle">Student PWA Mobile</text>
      <rect x="22" y="64" width="104" height="20" rx="2" fill="var(--surface)" stroke="var(--line)" strokeWidth="1" />
      <text x="74" y="77" fill="var(--ink)" fontSize="7.5" fontWeight="700" textAnchor="middle">Corridor Touch Kiosk</text>
      <rect x="22" y="88" width="104" height="20" rx="2" fill="var(--surface)" stroke="var(--line)" strokeWidth="1" />
      <text x="74" y="101" fill="var(--ink)" fontSize="7.5" fontWeight="700" textAnchor="middle">Gate Security Reader</text>
      <rect x="22" y="112" width="104" height="20" rx="2" fill="var(--surface)" stroke="var(--line)" strokeWidth="1" />
      <text x="74" y="125" fill="var(--ink)" fontSize="7.5" fontWeight="700" textAnchor="middle">Staff &amp; Helpdesk Desk</text>
      <path d="M134 80H166M166 80L160 75M166 80L160 85" stroke="var(--signal)" strokeWidth="2" strokeLinecap="square" />
      <text x="150" y="72" fill="var(--muted-ink)" fontSize="6.5" fontWeight="700" textAnchor="middle" fontFamily="var(--font-mono)">OFFLINE</text>
      <rect x="168" y="16" width="230" height="128" rx="2" fill="var(--surface-alt)" stroke="var(--line)" strokeWidth="1.2" />
      <text x="283" y="32" fill="var(--ink)" fontSize="8.5" fontWeight="800" textAnchor="middle" fontFamily="var(--font-mono)">CLIENT-SIDE STORAGE &amp; OUTBOX</text>
      <rect x="180" y="42" width="100" height="42" rx="2" fill="var(--surface)" stroke="var(--signal)" strokeWidth="1.5" />
      <text x="230" y="58" fill="var(--signal)" fontSize="7.5" fontWeight="800" textAnchor="middle" fontFamily="var(--font-mono)">INDEXEDDB OUTBOX</text>
      <text x="230" y="72" fill="var(--muted-ink)" fontSize="7" textAnchor="middle">Write-Ahead Queue</text>
      <rect x="290" y="42" width="98" height="42" rx="2" fill="var(--surface)" stroke="var(--line)" strokeWidth="1.2" />
      <text x="339" y="58" fill="var(--ink)" fontSize="7.5" fontWeight="800" textAnchor="middle" fontFamily="var(--font-mono)">SERVICE WORKER</text>
      <text x="339" y="72" fill="var(--muted-ink)" fontSize="7" textAnchor="middle">Cache Storage Engine</text>
      <rect x="180" y="92" width="208" height="42" rx="2" fill="var(--surface)" stroke="var(--mint)" strokeWidth="1.2" />
      <text x="284" y="108" fill="var(--mint)" fontSize="7.5" fontWeight="800" textAnchor="middle" fontFamily="var(--font-mono)">CRYPTOGRAPHIC IDEMPOTENCY KEY</text>
      <text x="284" y="122" fill="var(--muted-ink)" fontSize="7" textAnchor="middle">UUIDv4 Client Hash · Deduplication Guarantee</text>
      <path d="M398 80H442M442 80L436 75M442 80L436 85" stroke="var(--mint)" strokeWidth="2" strokeLinecap="square" />
      <text x="420" y="72" fill="var(--mint)" fontSize="6.5" fontWeight="800" textAnchor="middle" fontFamily="var(--font-mono)">RECONNECT</text>
      <rect x="444" y="16" width="182" height="128" rx="2" fill="var(--surface-alt)" stroke="var(--line)" strokeWidth="1.2" />
      <text x="535" y="32" fill="var(--mint)" fontSize="8.5" fontWeight="800" textAnchor="middle" fontFamily="var(--font-mono)">EVENT LISTENER &amp; RECONNECT</text>
      <rect x="456" y="44" width="158" height="38" rx="2" fill="var(--surface)" stroke="var(--line)" strokeWidth="1.2" />
      <text x="535" y="60" fill="var(--ink)" fontSize="7.5" fontWeight="800" textAnchor="middle">Network Status Observer</text>
      <text x="535" y="73" fill="var(--status-warn)" fontSize="6.8" textAnchor="middle">Online / Offline Event Hooks</text>
      <rect x="456" y="90" width="158" height="44" rx="2" fill="var(--surface)" stroke="var(--mint)" strokeWidth="1.5" />
      <text x="535" y="106" fill="var(--mint)" fontSize="8" fontWeight="800" textAnchor="middle" fontFamily="var(--font-mono)">AUTO-FLUSH QUEUE</text>
      <text x="535" y="122" fill="var(--muted-ink)" fontSize="7" textAnchor="middle">Exponential Backoff Retry Strategy</text>
    </svg>
  )
}

function VectorArchTier2Engine() {
  return (
    <svg viewBox="0 0 640 160" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="2" width="636" height="156" rx="3" fill="var(--surface)" stroke="var(--line)" strokeWidth="1.5" />
      <rect x="14" y="16" width="130" height="128" rx="2" fill="var(--surface-alt)" stroke="var(--line)" strokeWidth="1.2" />
      <text x="79" y="32" fill="var(--signal)" fontSize="8.5" fontWeight="800" textAnchor="middle" fontFamily="var(--font-mono)">FASTAPI INGRESS</text>
      <rect x="24" y="42" width="110" height="26" rx="2" fill="var(--surface)" stroke="var(--line)" strokeWidth="1" />
      <text x="79" y="58" fill="var(--ink)" fontSize="7.5" fontWeight="700" textAnchor="middle">Async Python 3.12</text>
      <rect x="24" y="74" width="110" height="26" rx="2" fill="var(--surface)" stroke="var(--line)" strokeWidth="1" />
      <text x="79" y="90" fill="var(--ink)" fontSize="7.5" fontWeight="700" textAnchor="middle">Pydantic v2 Contract</text>
      <rect x="24" y="106" width="110" height="26" rx="2" fill="var(--surface)" stroke="var(--line)" strokeWidth="1" />
      <text x="79" y="122" fill="var(--signal)" fontSize="7.5" fontWeight="700" textAnchor="middle">RBAC Permission Map</text>
      <path d="M144 80H176M176 80L170 75M176 80L170 85" stroke="var(--signal)" strokeWidth="2" strokeLinecap="square" />
      <rect x="178" y="16" width="280" height="128" rx="2" fill="var(--surface-alt)" stroke="var(--line)" strokeWidth="1.2" />
      <text x="318" y="32" fill="var(--ink)" fontSize="8.5" fontWeight="800" textAnchor="middle" fontFamily="var(--font-mono)">UNIVERSAL CASE STATE MACHINE</text>
      <rect x="190" y="44" width="56" height="32" rx="2" fill="var(--surface)" stroke="var(--line)" strokeWidth="1" />
      <text x="218" y="58" fill="var(--ink)" fontSize="6.5" fontWeight="800" textAnchor="middle" fontFamily="var(--font-mono)">SUBMITTED</text>
      <text x="218" y="69" fill="var(--muted-ink)" fontSize="6" textAnchor="middle">New Case</text>
      <path d="M246 60H260M260 60L256 57M260 60L256 63" stroke="var(--signal)" strokeWidth="1.2" />
      <rect x="262" y="44" width="54" height="32" rx="2" fill="var(--surface)" stroke="var(--line)" strokeWidth="1" />
      <text x="289" y="58" fill="var(--signal)" fontSize="6.5" fontWeight="800" textAnchor="middle" fontFamily="var(--font-mono)">ROUTED</text>
      <text x="289" y="69" fill="var(--muted-ink)" fontSize="6" textAnchor="middle">Dept Bound</text>
      <path d="M316 60H330M330 60L326 57M330 60L326 63" stroke="var(--signal)" strokeWidth="1.2" />
      <rect x="332" y="44" width="56" height="32" rx="2" fill="var(--surface)" stroke="var(--sun)" strokeWidth="1" />
      <text x="360" y="58" fill="var(--sun)" fontSize="6.5" fontWeight="800" textAnchor="middle" fontFamily="var(--font-mono)">IN_PROGRESS</text>
      <text x="360" y="69" fill="var(--muted-ink)" fontSize="6" textAnchor="middle">Staff Work</text>
      <path d="M388 60H402M402 60L398 57M402 60L398 63" stroke="var(--mint)" strokeWidth="1.2" />
      <rect x="404" y="44" width="46" height="32" rx="2" fill="var(--surface)" stroke="var(--mint)" strokeWidth="1.5" />
      <text x="427" y="58" fill="var(--mint)" fontSize="6.5" fontWeight="800" textAnchor="middle" fontFamily="var(--font-mono)">RESOLVED</text>
      <text x="427" y="69" fill="var(--mint)" fontSize="6" textAnchor="middle">Verified</text>
      <rect x="190" y="86" width="260" height="48" rx="2" fill="var(--surface)" stroke="var(--line)" strokeWidth="1" />
      <text x="320" y="102" fill="var(--signal)" fontSize="7" fontWeight="800" textAnchor="middle" fontFamily="var(--font-mono)">TRANSITION GUARDS &amp; AUDIT LOGIC</text>
      <text x="320" y="115" fill="var(--ink)" fontSize="7" textAnchor="middle">Requires Signature · Escalation Paths · Re-open Limits</text>
      <text x="320" y="126" fill="var(--muted-ink)" fontSize="6.5" textAnchor="middle">Atomic State Transitions with Rollback Protection</text>
      <path d="M458 80H484M484 80L478 75M484 80L478 85" stroke="var(--mint)" strokeWidth="2" strokeLinecap="square" />
      <rect x="486" y="16" width="140" height="128" rx="2" fill="var(--surface-alt)" stroke="var(--line)" strokeWidth="1.2" />
      <text x="556" y="32" fill="var(--mint)" fontSize="8.5" fontWeight="800" textAnchor="middle" fontFamily="var(--font-mono)">SECURITY &amp; SLAS</text>
      <rect x="496" y="42" width="120" height="42" rx="2" fill="var(--surface)" stroke="var(--line)" strokeWidth="1" />
      <text x="556" y="58" fill="var(--ink)" fontSize="7.5" fontWeight="800" textAnchor="middle">HMAC-SHA256 Signer</text>
      <text x="556" y="72" fill="var(--muted-ink)" fontSize="6.8" textAnchor="middle">Cryptographic QR Tokens</text>
      <rect x="496" y="92" width="120" height="42" rx="2" fill="var(--surface)" stroke="var(--status-warn)" strokeWidth="1.2" />
      <text x="556" y="108" fill="var(--status-warn)" fontSize="7.5" fontWeight="800" textAnchor="middle">Real-Time SLA Engine</text>
      <text x="556" y="122" fill="var(--muted-ink)" fontSize="6.8" textAnchor="middle">60s Clock Sweep · Breaches</text>
    </svg>
  )
}

function VectorArchTier3Persistence() {
  return (
    <svg viewBox="0 0 640 160" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="2" width="636" height="156" rx="3" fill="var(--surface)" stroke="var(--line)" strokeWidth="1.5" />
      <rect x="14" y="16" width="160" height="128" rx="2" fill="var(--surface-alt)" stroke="var(--line)" strokeWidth="1.2" />
      <text x="94" y="32" fill="var(--mint)" fontSize="8.5" fontWeight="800" textAnchor="middle" fontFamily="var(--font-mono)">POSTGRESQL 16 LEDGER</text>
      <rect x="24" y="42" width="140" height="26" rx="2" fill="var(--surface)" stroke="var(--line)" strokeWidth="1" />
      <text x="94" y="58" fill="var(--ink)" fontSize="7.5" fontWeight="700" textAnchor="middle">Append-Only Event Store</text>
      <rect x="24" y="74" width="140" height="26" rx="2" fill="var(--surface)" stroke="var(--danger)" strokeWidth="1" />
      <text x="94" y="90" fill="var(--danger)" fontSize="7.5" fontWeight="700" textAnchor="middle">No DELETE / No Overwrite</text>
      <rect x="24" y="106" width="140" height="26" rx="2" fill="var(--surface)" stroke="var(--line)" strokeWidth="1" />
      <text x="94" y="122" fill="var(--muted-ink)" fontSize="7" textAnchor="middle">Full History Audit Hash</text>
      <path d="M174 80H200M200 80L194 75M200 80L194 85" stroke="var(--lilac)" strokeWidth="2" strokeLinecap="square" />
      <rect x="202" y="16" width="240" height="128" rx="2" fill="var(--surface-alt)" stroke="var(--line)" strokeWidth="1.2" />
      <text x="322" y="32" fill="var(--lilac)" fontSize="8.5" fontWeight="800" textAnchor="middle" fontFamily="var(--font-mono)">CONTROLLED AI OPS FLEET</text>
      <rect x="214" y="42" width="102" height="40" rx="2" fill="var(--surface)" stroke="var(--line)" strokeWidth="1" />
      <text x="265" y="57" fill="var(--ink)" fontSize="7" fontWeight="800" textAnchor="middle">1. Triage Agent</text>
      <text x="265" y="71" fill="var(--muted-ink)" fontSize="6.5" textAnchor="middle">Auto-Categorization</text>
      <rect x="326" y="42" width="102" height="40" rx="2" fill="var(--surface)" stroke="var(--line)" strokeWidth="1" />
      <text x="377" y="57" fill="var(--ink)" fontSize="7" fontWeight="800" textAnchor="middle">2. SLA Forecaster</text>
      <text x="377" y="71" fill="var(--muted-ink)" fontSize="6.5" textAnchor="middle">Anomaly Sweep 60s</text>
      <rect x="214" y="90" width="102" height="42" rx="2" fill="var(--surface)" stroke="var(--line)" strokeWidth="1" />
      <text x="265" y="106" fill="var(--ink)" fontSize="7" fontWeight="800" textAnchor="middle">3. Smart Dispatch</text>
      <text x="265" y="120" fill="var(--muted-ink)" fontSize="6.5" textAnchor="middle">Workload Balancing</text>
      <rect x="326" y="90" width="102" height="42" rx="2" fill="var(--surface)" stroke="var(--lilac)" strokeWidth="1.2" />
      <text x="377" y="106" fill="var(--lilac)" fontSize="7" fontWeight="800" textAnchor="middle">4. Daily Digest</text>
      <text x="377" y="120" fill="var(--muted-ink)" fontSize="6.5" textAnchor="middle">06:00 Executive Brief</text>
      <path d="M442 80H468M468 80L462 75M468 80L462 85" stroke="var(--signal)" strokeWidth="2" strokeLinecap="square" />
      <rect x="470" y="16" width="156" height="128" rx="2" fill="var(--surface-alt)" stroke="var(--line)" strokeWidth="1.2" />
      <text x="548" y="32" fill="var(--signal)" fontSize="8.5" fontWeight="800" textAnchor="middle" fontFamily="var(--font-mono)">EXTERNAL NOTIFICATIONS</text>
      <rect x="480" y="44" width="136" height="38" rx="2" fill="var(--surface)" stroke="var(--line)" strokeWidth="1" />
      <text x="548" y="60" fill="var(--ink)" fontSize="7.5" fontWeight="800" textAnchor="middle">Telegram Bot Webhook</text>
      <text x="548" y="73" fill="var(--muted-ink)" fontSize="6.8" textAnchor="middle">Verified Delivery Proof</text>
      <rect x="480" y="90" width="136" height="42" rx="2" fill="var(--surface)" stroke="var(--line)" strokeWidth="1" />
      <text x="548" y="106" fill="var(--ink)" fontSize="7.5" fontWeight="800" textAnchor="middle">WhatsApp Engine</text>
      <text x="548" y="120" fill="var(--muted-ink)" fontSize="6.8" textAnchor="middle">Gate Pass &amp; Urgent Notice Alerts</text>
    </svg>
  )
}

const PROBLEMS = [
  {
    icon: <IconAlert />,
    badge: 'Operational Silos',
    title: 'Fragmented Channels & Lost Tickets',
    body: 'Maintenance complaints scatter across WhatsApp groups, paper logbooks, and untracked phone calls. Requests disappear between wardens, facility managers, and electricians with zero auditability.',
  },
  {
    icon: <IconOffline />,
    badge: 'Zero Connectivity',
    title: 'Dead-Zone Network Blindspots',
    body: 'Hostel basements, labs, and perimeter security gates suffer continuous signal drops. Traditional web portals drop state on network errors, stranding students with incomplete requests.',
  },
  {
    icon: <IconShield />,
    badge: 'Security Risk',
    title: 'Unverifiable Paper Passes & Fraud',
    body: 'Hand-written gate passes and bonafide requests lack cryptographic verification. Gate security has no real-time headcount of students outside campus or validity proof of warden signatures.',
  },
  {
    icon: <IconClock />,
    badge: 'Unenforced SLAs',
    title: 'Accountability Disputes & Stale Tickets',
    body: 'Without immutable timestamps and automatic SLA escalation rules, delayed repairs trigger blame loops between students, staff, and administration without resolution proof.',
  },
]

const SOLUTIONS = [
  {
    icon: <IconLayers />,
    badge: 'Universal Case Engine',
    title: 'One Core Engine for Every Request',
    body: 'Hostel repairs, bonafide certificates, gate leave passes, and IT complaints are all instances of a single, auditable Case state machine with automated transitions and policy guards.',
    graphic: <VectorCaseEngine />,
  },
  {
    icon: <IconOffline />,
    badge: 'IndexedDB Outbox',
    title: 'Store-and-Forward Offline Protocol',
    body: 'Requests write to the device outbox first with cryptographic idempotency keys. Upon reconnection, transactions replay idempotently with conflict detection and preserved local timestamps.',
    graphic: <VectorOfflineOutbox />,
  },
  {
    icon: <IconQr />,
    badge: 'Verifiable Security',
    title: 'Cryptographic QR & Gate Desk',
    body: 'Gate passes generate tamper-proof QR tokens verified by gate guards with a single scan. Bonafide certificates generate cryptographically verifiable PDFs with public validation endpoints.',
    graphic: <VectorQrGateSecurity />,
  },
  {
    icon: <IconCpu />,
    badge: 'Autonomous Agents',
    title: 'Controlled AI Operations Intelligence',
    body: 'Four specialized agents classify incoming requests, evaluate urgency, route tickets to least-loaded staff, and brief administrators daily with human-in-the-loop governance.',
    graphic: <VectorAiOperations />,
  },
]

const ROLES = [
  {
    role: 'Student',
    device: 'Mobile PWA',
    highlight: 'Offline Filing & QR Scan',
    does: 'Scan room QR codes to report faults, track real-time repair progress, file leave requests, and verify technician resolution.',
  },
  {
    role: 'Staff & Technicians',
    device: 'Field Device',
    highlight: 'SLA-Sorted Dispatch',
    does: 'Personal queue prioritized by impending SLA breach, offline task execution in basements, and one-tap work completion proof.',
  },
  {
    role: 'Hostel Warden',
    device: 'Tablet / Laptop',
    highlight: 'Policy & Leave Approvals',
    does: 'Multi-stage leave pass reviews with curfew validations, emergency escalations, and automated security notification triggers.',
  },
  {
    role: 'Administrator',
    device: 'Desktop Command Centre',
    highlight: 'Real-Time Governance',
    does: 'Live campus operations dashboard, SLA ageing sweeps (<24h, 1-3d, 3-7d), append-only audit ledger, and targeted Notice Studio.',
  },
  {
    role: 'Security Gate',
    device: 'Dedicated Gate Desk',
    highlight: 'One-Tap Verification',
    does: 'Verify gate passes via barcode/QR scanner, record campus exits and returns, and inspect real-time outside-campus headcount.',
  },
  {
    role: 'Shared Corridor Kiosk',
    device: 'Wall Touchscreen',
    highlight: 'Zero-Phone Access',
    does: 'Assisted terminal for students without a smartphone. Auto-resets on idle timeout and preserves zero residual personal sessions.',
  },
]

const TECH_STACK = [
  { name: 'FastAPI (Python 3.12)', role: 'High-throughput async REST API with Pydantic v2 schemas' },
  { name: 'PostgreSQL 16 & SQLAlchemy 2.0', role: 'Relational data model with append-only ORM immutability triggers' },
  { name: 'Alembic Migrations', role: 'Idempotent, additive schema version control and zero-downtime deploys' },
  { name: 'React 18 & TypeScript', role: 'Strictly typed client architecture with modular feature workspaces' },
  { name: 'IndexedDB & Service Worker', role: 'Local-first outbox synchronization engine for true offline resilience' },
  { name: 'Vite PWA & Industrial CSS', role: 'Lightweight, hardware-accelerated Brutalist design system with dual themes' },
  { name: 'Supabase Database Pooler', role: 'Cloud-managed PostgreSQL with TLS session pooling and connection safeguards' },
  { name: 'Docker & Docker Compose', role: 'Dual deployment shapes: split cloud (Render+Vercel) & self-hosted on-prem' },
]

export function LandingPage() {
  const { theme, setTheme } = useTheme()
  const institution = useInstitution()
  const [showAccounts, setShowAccounts] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [archTier, setArchTier] = useState<'tier1' | 'tier2' | 'tier3'>('tier1')
  const [showOverviewDiagram, setShowOverviewDiagram] = useState(false)
  const accounts = useRemote<{ accounts: { role: string; email: string; label: string }[] }>(
    showAccounts ? 'landing-demo-accounts' : null,
    () => api.get('/auth/demo-accounts'),
    { cacheKey: null },
  )

  return (
    <div className="landing">
      {/* ------------------------------------------------------------ TOPBAR */}
      <header className="landing-top no-print">
        <div className="row" style={{ alignItems: 'center', gap: 10 }}>
          <div className="sidebar-brand" style={{ marginBottom: 0 }}>
            <span className="brand-mark" aria-hidden="true" data-monogram={institution.monogram} />
            <span className="brand-name">{institution.shortName}</span>
          </div>
          <div
            className="status-pill hide-mobile"
            title="Mesh Operational"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '2px 8px',
              borderRadius: 'var(--radius-sm)',
              border: 'var(--border-w) solid var(--line)',
              background: 'var(--surface-alt)',
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--mint)', display: 'inline-block' }} />
            <span className="mono tiny bold" style={{ letterSpacing: '0.04em' }}>SYS.ONLINE</span>
          </div>
        </div>

        <span className="grow" />

        <nav className="landing-nav" aria-label="Navigation">
          <a href="#problem">Problem</a>
          <a href="#solution">Solution</a>
          <a href="#architecture">Architecture</a>
          <a href="#roles">Stations</a>
          <a href="#tech">Tech Specs</a>
          <a href="#credits">Credits</a>
        </nav>

        <div className="landing-top-actions">
          <div className="switcher" role="group" aria-label="Theme switcher">
            {THEME_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                className="symbol"
                aria-pressed={theme === option.id}
                aria-label={option.hint}
                title={option.hint}
                onClick={() => setTheme(option.id)}
              >
                <span aria-hidden="true">{option.symbol}</span>
              </button>
            ))}
          </div>
          <Link className="btn btn-primary btn-sm" to="/login">
            Sign In
          </Link>
          <button
            type="button"
            className="mobile-nav-toggle"
            aria-label="Toggle navigation drawer"
            aria-expanded={mobileNavOpen}
            onClick={() => setMobileNavOpen((prev) => !prev)}
          >
            {mobileNavOpen ? '✕' : '☰'}
          </button>
        </div>
      </header>

      {/* Mobile Navigation Drawer */}
      {mobileNavOpen && (
        <div className="mobile-nav-drawer" onClick={() => setMobileNavOpen(false)}>
          <div className="mobile-nav-links">
            <a href="#problem">
              <span>The Problem</span>
              <span className="tiny mono muted">01</span>
            </a>
            <a href="#solution">
              <span>The Solution</span>
              <span className="tiny mono muted">02</span>
            </a>
            <a href="#architecture">
              <span>System Topology</span>
              <span className="tiny mono muted">03</span>
            </a>
            <a href="#roles">
              <span>Role Stations</span>
              <span className="tiny mono muted">04</span>
            </a>
            <a href="#tech">
              <span>Tech Stack</span>
              <span className="tiny mono muted">05</span>
            </a>
            <a href="#credits">
              <span>Credits &amp; Governance</span>
              <span className="tiny mono muted">06</span>
            </a>
          </div>
          <div className="mobile-nav-drawer-actions">
            <Link className="btn btn-primary" to="/login" style={{ width: '100%', justifyContent: 'center' }}>
              Sign In to Station
            </Link>
            <Link className="btn btn-ghost" to="/kiosk" style={{ width: '100%', justifyContent: 'center' }}>
              Launch Shared Kiosk
            </Link>
          </div>
        </div>
      )}

      <div className="landing-wrap">
        {/* ------------------------------------------------------------ HERO */}
        <section className="landing-hero animate-entrance">
          <div className="landing-kicker">
            <Badge tone="warn" className="pulse-beacon">
              BPUT Hackathon 2026
            </Badge>
            <Badge tone="open">PS07 · Fretbox</Badge>
            <span className="small muted">Crystal Studio Labs</span>
          </div>

          <h1 className="landing-title">
            A resilient operating layer for everyday campus operations.
          </h1>

          <p className="landing-lede">
            Maintenance tickets, bonafide certificates, leave gate passes, and emergency notices united into{' '}
            <strong>one universal, auditable case engine</strong>. Built to operate flawlessly in hostel basements
            with zero cellular signal, high-speed security gates, and central administrative command centres.
          </p>

          <div className="landing-cta">
            <Link className="btn btn-primary btn-lg" to="/login">
              Launch Live Demo
            </Link>
            <Link className="btn btn-ghost btn-lg" to="/kiosk">
              Open Kiosk Station
            </Link>
            <Button
              variant="default"
              size="lg"
              onClick={() => setShowAccounts((prev) => !prev)}
            >
              {showAccounts ? 'Hide Demo Accounts' : 'Inspect Demo Accounts'}
            </Button>
          </div>

          {/* Interactive Demo Accounts Dropdown */}
          {showAccounts ? (
            <div className="card animate-entrance" style={{ marginTop: 20, textAlign: 'start' }}>
              <div className="row-between" style={{ marginBottom: 12 }}>
                <div>
                  <h3 style={{ margin: 0 }}>Seeded Demo Accounts</h3>
                  <span className="small muted">All roles use universal password: </span>
                  <code className="bold">Campus@2026</code>
                </div>
                <Badge tone="done">8 Roles Active</Badge>
              </div>
              <div className="landing-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
                {accounts.data?.accounts ? (
                  accounts.data.accounts.map((acc) => (
                    <div key={acc.email} className="metric" style={{ padding: '8px 12px' }}>
                      <div className="bold small">{acc.role.replaceAll('_', ' ')}</div>
                      <code className="tiny muted">{acc.email}</code>
                      <Link
                        to={`/login?email=${encodeURIComponent(acc.email)}`}
                        className="small bold"
                        style={{ marginTop: 4, color: 'var(--signal)' }}
                      >
                        Auto-fill Login →
                      </Link>
                    </div>
                  ))
                ) : (
                  <div className="muted small">Loading accounts from active backend…</div>
                )}
              </div>
            </div>
          ) : null}

          {/* Hero Proof Metrics Strip */}
          <div className="hero-proof-strip">
            <div className="proof-item">
              <span className="proof-value">0%</span>
              <span className="proof-label">DATA LOSS</span>
              <span className="proof-desc">Store-and-forward IndexedDB</span>
            </div>
            <div className="proof-item">
              <span className="proof-value">&lt;150ms</span>
              <span className="proof-label">QR GATE VERIFY</span>
              <span className="proof-desc">HMAC cryptographic passes</span>
            </div>
            <div className="proof-item">
              <span className="proof-value">100%</span>
              <span className="proof-label">AUDITABLE</span>
              <span className="proof-desc">Append-only event ledger</span>
            </div>
            <div className="proof-item">
              <span className="proof-value">8 STATIONS</span>
              <span className="proof-label">TAILORED WORKSPACES</span>
              <span className="proof-desc">Student, Staff, Warden, Gate</span>
            </div>
          </div>

          {/* Live Preview Plate */}
          <div className="hero-visual" aria-hidden="true" style={{ marginTop: 32 }}>
            <div className="hero-visual-bar">
              <span className="hero-dot" />
              <span className="hero-dot" />
              <span className="hero-dot" />
              <span className="hero-visual-title">
                {institution.shortName} · Operations Command Centre
              </span>
            </div>
            <div className="hero-visual-body">
              <div className="hero-rail">
                <div className="hero-rail-item is-active">Overview</div>
                <div className="hero-rail-item">Queue (24)</div>
                <div className="hero-rail-item">Approvals (6)</div>
                <div className="hero-rail-item">Gate Logs (18)</div>
                <div className="hero-rail-item">Notice Studio</div>
                <div className="hero-rail-item">Audit Trail</div>
              </div>
              <div className="hero-panel">
                <div className="hero-metrics">
                  <div className="hero-metric">
                    <div className="hero-metric-value">24</div>
                    <div className="hero-metric-label">Active Cases</div>
                  </div>
                  <div className="hero-metric">
                    <div className="hero-metric-value" style={{ color: 'var(--status-warn)' }}>3</div>
                    <div className="hero-metric-label">SLA At Risk</div>
                  </div>
                  <div className="hero-metric">
                    <div className="hero-metric-value" style={{ color: 'var(--status-done)' }}>96.4%</div>
                    <div className="hero-metric-label">Resolution Rate</div>
                  </div>
                  <div className="hero-metric">
                    <div className="hero-metric-value" style={{ color: 'var(--signal)' }}>100%</div>
                    <div className="hero-metric-label">Audit Verifiable</div>
                  </div>
                </div>
                <div className="hero-row">
                  <span className="mono tiny bold">CR-2026-0142</span>
                  <span className="truncate small grow">Hostel 3 · Water Cooler Compressor Tripped</span>
                  <Badge tone="warn">SLA &lt; 2h</Badge>
                </div>
                <div className="hero-row">
                  <span className="mono tiny bold">CR-2026-0143</span>
                  <span className="truncate small grow">Lab B-12 · Network Switch Port 14 Down</span>
                  <Badge tone="open">Assigned</Badge>
                </div>
                <div className="hero-row">
                  <span className="mono tiny bold">CR-2026-0144</span>
                  <span className="truncate small grow">Leave Gate Pass · Overnight Medical Verification</span>
                  <Badge tone="done">Warden Approved</Badge>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------------ PROBLEM STATEMENT */}
        <section className="landing-section" id="problem">
          <div className="row wrap" style={{ gap: 8, alignItems: 'center', marginBottom: 8 }}>
            <Badge tone="urgent">The Problem</Badge>
            <span className="mono small muted">BPUT Hackathon 2026 · PS07 (Fretbox)</span>
          </div>
          <h2>The Campus Operations Breakdown</h2>
          <p className="lede">
            Why traditional campus ERPs, WhatsApp groups, and paper registers fail students and administration:
          </p>

          <div className="landing-grid">
            {PROBLEMS.map((prob) => (
              <article key={prob.title} className="feature-card animate-entrance">
                <div className="row-between" style={{ width: '100%', marginBottom: 12 }}>
                  <span className="feature-icon" aria-hidden="true" style={{ color: 'var(--danger)' }}>
                    {prob.icon}
                  </span>
                  <Badge tone="urgent">{prob.badge}</Badge>
                </div>
                <h3>{prob.title}</h3>
                <p>{prob.body}</p>
              </article>
            ))}
          </div>
        </section>

        {/* ------------------------------------------------------------ SOLUTION */}
        <section className="landing-section" id="solution">
          <div className="row wrap" style={{ gap: 8, alignItems: 'center', marginBottom: 8 }}>
            <Badge tone="done">The Solution</Badge>
            <span className="mono small muted">Architected by Crystal Studio Labs</span>
          </div>
          <h2>The Campus Relay Operating Engine</h2>
          <p className="lede">
            An engineered operating layer designed to enforce accountability, maintain zero-loss offline continuity,
            and automate campus workflows:
          </p>

          <div className="landing-grid">
            {SOLUTIONS.map((sol) => (
              <article key={sol.title} className="feature-card animate-entrance">
                <div className="row-between" style={{ width: '100%', marginBottom: 12 }}>
                  <span className="feature-icon" aria-hidden="true" style={{ color: 'var(--signal)' }}>
                    {sol.icon}
                  </span>
                  <Badge tone="done">{sol.badge}</Badge>
                </div>
                <h3>{sol.title}</h3>
                <p>{sol.body}</p>
                {sol.graphic}
              </article>
            ))}
          </div>
        </section>

        {/* ------------------------------------------------------------ ARCHITECTURE & TOPOLOGY */}
        <section className="landing-section" id="architecture">
          <div className="row wrap" style={{ gap: 8, alignItems: 'center', marginBottom: 8 }}>
            <Badge tone="ghost">System Topology</Badge>
            <span className="mono small muted">Multi-Tier Resilient Infrastructure</span>
          </div>
          <h2>Multi-Tier Architecture &amp; Data Pipeline</h2>
          <p className="lede">
            Campus operations cannot rely on continuous cloud connectivity. Campus Relay is divided into three distinct,
            fault-isolated architectural tiers that guarantee zero data loss and verifiable state transitions:
          </p>

          {/* Interactive Tier Switcher */}
          <div className="arch-tier-nav" role="tablist" aria-label="Architecture Tiers">
            <button
              type="button"
              className={`arch-tier-btn${archTier === 'tier1' ? ' is-active' : ''}`}
              onClick={() => setArchTier('tier1')}
              role="tab"
              aria-selected={archTier === 'tier1'}
            >
              <span>01</span>
              <span>Client Edge &amp; Stations</span>
              <span className="tiny muted">(Offline-First)</span>
            </button>
            <button
              type="button"
              className={`arch-tier-btn${archTier === 'tier2' ? ' is-active' : ''}`}
              onClick={() => setArchTier('tier2')}
              role="tab"
              aria-selected={archTier === 'tier2'}
            >
              <span>02</span>
              <span>Event Mesh &amp; State Engine</span>
              <span className="tiny muted">(FastAPI Core)</span>
            </button>
            <button
              type="button"
              className={`arch-tier-btn${archTier === 'tier3' ? ' is-active' : ''}`}
              onClick={() => setArchTier('tier3')}
              role="tab"
              aria-selected={archTier === 'tier3'}
            >
              <span>03</span>
              <span>Ledger &amp; Autonomous AI Fleet</span>
              <span className="tiny muted">(PostgreSQL 16)</span>
            </button>
          </div>

          {/* Tier Content Panels */}
          {archTier === 'tier1' && (
            <div className="arch-tier-panel">
              <div className="row-between wrap" style={{ marginBottom: 12 }}>
                <div>
                  <h3 className="section-title" style={{ margin: 0 }}>
                    Tier 01: Client Edge &amp; Stations (Offline-First Store &amp; Forward)
                  </h3>
                  <p className="small muted" style={{ margin: '4px 0 0' }}>
                    Captures student requests, gate scans, and staff acknowledgements locally before touching the network.
                  </p>
                </div>
                <Badge tone="done">Local-First Validated</Badge>
              </div>

              {/* Bespoke Schematic SVG */}
              <div className="arch-schematic-box">
                <VectorArchTier1Edge />
              </div>

              {/* 3 Technical Specification Cards */}
              <div className="arch-tier-grid">
                <div className="arch-spec-card">
                  <span className="arch-spec-title">1. Write-Ahead Outbox</span>
                  <p className="arch-spec-detail">
                    Every form submission (repairs, leave passes, incident reports) writes directly into client IndexedDB before initiating an HTTP request. Students receive an immediate offline tracking reference.
                  </p>
                </div>
                <div className="arch-spec-card">
                  <span className="arch-spec-title">2. Cryptographic Idempotency</span>
                  <p className="arch-spec-detail">
                    Each mutation carries a client-generated UUIDv4 idempotency key. When background sync triggers, the server guarantees duplicate submissions are safely ignored without double-entry.
                  </p>
                </div>
                <div className="arch-spec-card">
                  <span className="arch-spec-title">3. Autonomous Replay Engine</span>
                  <p className="arch-spec-detail">
                    A Service Worker network listener monitors connectivity changes. The moment a student enters Wi-Fi or cellular coverage, queued transactions replay automatically with exponential backoff.
                  </p>
                </div>
              </div>
            </div>
          )}

          {archTier === 'tier2' && (
            <div className="arch-tier-panel">
              <div className="row-between wrap" style={{ marginBottom: 12 }}>
                <div>
                  <h3 className="section-title" style={{ margin: 0 }}>
                    Tier 02: Event Mesh &amp; State Engine (FastAPI &amp; Transition Guards)
                  </h3>
                  <p className="small muted" style={{ margin: '4px 0 0' }}>
                    Async Python 3.12 backend managing atomic state machine transitions, role policies, and cryptographic security.
                  </p>
                </div>
                <Badge tone="open">Finite State Machine</Badge>
              </div>

              {/* Bespoke Schematic SVG */}
              <div className="arch-schematic-box">
                <VectorArchTier2Engine />
              </div>

              {/* 3 Technical Specification Cards */}
              <div className="arch-tier-grid">
                <div className="arch-spec-card">
                  <span className="arch-spec-title">1. Guarded State Machine</span>
                  <p className="arch-spec-detail">
                    Unified 7-stage state machine (SUBMITTED → ROUTED → ASSIGNED → IN_PROGRESS → WAITING_APPROVAL → VERIFICATION → RESOLVED). Strictly prevents illegal skips or unsigned approvals.
                  </p>
                </div>
                <div className="arch-spec-card">
                  <span className="arch-spec-title">2. HMAC-SHA256 Gate Security</span>
                  <p className="arch-spec-detail">
                    Generates unforgeable, time-bounded QR tokens for leave passes. Security guards verify identity and curfew validity in &lt;150ms even with weak connectivity, keeping an accurate outside headcount.
                  </p>
                </div>
                <div className="arch-spec-card">
                  <span className="arch-spec-title">3. Real-Time SLA Monitor</span>
                  <p className="arch-spec-detail">
                    Independent 60-second background sweeper monitors countdown timers across all open cases. At-risk tickets are flagged before curfew; overdue items are automatically escalated with audit reason logging.
                  </p>
                </div>
              </div>
            </div>
          )}

          {archTier === 'tier3' && (
            <div className="arch-tier-panel">
              <div className="row-between wrap" style={{ marginBottom: 12 }}>
                <div>
                  <h3 className="section-title" style={{ margin: 0 }}>
                    Tier 03: Enterprise Persistence &amp; AI Ops Fleet (PostgreSQL 16)
                  </h3>
                  <p className="small muted" style={{ margin: '4px 0 0' }}>
                    Immutable append-only audit trail and human-in-the-loop autonomous operational intelligence.
                  </p>
                </div>
                <Badge tone="agent">AI Fleet Governed</Badge>
              </div>

              {/* Bespoke Schematic SVG */}
              <div className="arch-schematic-box">
                <VectorArchTier3Persistence />
              </div>

              {/* 3 Technical Specification Cards */}
              <div className="arch-tier-grid">
                <div className="arch-spec-card">
                  <span className="arch-spec-title">1. Append-Only Audit Ledger</span>
                  <p className="arch-spec-detail">
                    PostgreSQL 16 relational database with non-destructive triggers: rows are never silently updated or dropped. Every action records actor ID, station channel, timestamp, and transition rationale.
                  </p>
                </div>
                <div className="arch-spec-card">
                  <span className="arch-spec-title">2. 4 Autonomous AI Operators</span>
                  <p className="arch-spec-detail">
                    Specialized agents run within strict guardrails: Triage classifies unstructured text; SLA Sweeper predicts bottlenecks; Smart Dispatch balances technician workloads; Daily 06:00 Briefing synthesizes executive updates.
                  </p>
                </div>
                <div className="arch-spec-card">
                  <span className="arch-spec-title">3. Verified External Channels</span>
                  <p className="arch-spec-detail">
                    Integrated Telegram bot webhooks and WhatsApp notification adapters. Delivers confirmed read delivery receipts and broadcast emergency notices to parents and wardens.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* End-to-End Data Pipeline Flow */}
          <div className="card" style={{ marginTop: 20 }}>
            <div className="row-between wrap" style={{ marginBottom: 8 }}>
              <div className="bold small mono" style={{ color: 'var(--signal)' }}>
                END-TO-END DATA LIFECYCLE
              </div>
              <span className="tiny muted">How a single ticket travels from basement to resolution</span>
            </div>
            <div className="pipeline-flow-grid">
              <div className="pipeline-flow-step">
                <span className="tiny mono bold" style={{ color: 'var(--signal)' }}>01 · LOCAL CAPTURE</span>
                <span className="small bold">IndexedDB Write</span>
                <span className="tiny muted">User files request offline; gets immediate client reference ID.</span>
              </div>
              <div className="pipeline-flow-step">
                <span className="tiny mono bold" style={{ color: 'var(--mint)' }}>02 · IDEMPOTENT SYNC</span>
                <span className="small bold">Background Replay</span>
                <span className="tiny muted">Network observer detects Wi-Fi; flushes outbox with UUIDv4 hash.</span>
              </div>
              <div className="pipeline-flow-step">
                <span className="tiny mono bold" style={{ color: 'var(--sun)' }}>03 · STATE MACHINE</span>
                <span className="small bold">Guarded Execution</span>
                <span className="tiny muted">FastAPI routes to department; enforces SLA clock and permissions.</span>
              </div>
              <div className="pipeline-flow-step">
                <span className="tiny mono bold" style={{ color: 'var(--lilac)' }}>04 · IMMUTABLE AUDIT</span>
                <span className="small bold">PostgreSQL Commit</span>
                <span className="tiny muted">Technician resolves; student verifies; immutable row stored forever.</span>
              </div>
            </div>

            {/* Collapsible Panoramic Overview Toggle */}
            <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--line-soft)' }} className="row-between wrap">
              <span className="small muted">Need the complete high-level system topology diagram?</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowOverviewDiagram((prev) => !prev)}
              >
                {showOverviewDiagram ? '▲ Hide Full Topology Diagram' : '▼ View Full Topology Diagram'}
              </Button>
            </div>

            {showOverviewDiagram && (
              <div className="hero-schematic-wrap" style={{ marginTop: 12 }}>
                <img
                  src="/assets/campus_architecture_graphic.jpg"
                  alt="Campus Relay Full System Topology Schematic"
                  className="hero-schematic-img"
                  loading="lazy"
                />
              </div>
            )}
          </div>
        </section>

        {/* ------------------------------------------------------------ ROLES */}
        <section className="landing-section" id="roles">
          <div className="row wrap" style={{ gap: 8, alignItems: 'center', marginBottom: 8 }}>
            <Badge tone="open">Role-Tailored Stations</Badge>
            <span className="mono small muted">8 Distinct Workspaces</span>
          </div>
          <h2>Six Specialized Stations, One Unified Engine</h2>
          <p className="lede">
            Different screens for different realities. A student on mobile in a noisy cafeteria and an administrator
            evaluating weekly departmental SLAs get purpose-built workspaces:
          </p>

          <div className="landing-grid">
            {ROLES.map((role) => (
              <div key={role.role} className="role-card animate-entrance">
                <div className="row-between" style={{ marginBottom: 8 }}>
                  <Badge tone="ghost">{role.device}</Badge>
                  <span className="tiny mono bold" style={{ color: 'var(--signal)' }}>
                    {role.highlight}
                  </span>
                </div>
                <h3 style={{ margin: '4px 0 8px' }}>{role.role}</h3>
                <p className="small muted" style={{ margin: 0 }}>
                  {role.does}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ------------------------------------------------------------ TECH STACK */}
        <section className="landing-section" id="tech">
          <div className="row wrap" style={{ gap: 8, alignItems: 'center', marginBottom: 8 }}>
            <Badge tone="ghost">Architecture</Badge>
            <span className="mono small muted">Production-Grade Specifications</span>
          </div>
          <h2>Technology Stack &amp; Deployment Architecture</h2>
          <p className="lede">
            Engineered with zero technical debt: strict type safety, append-only persistence, local-first outbox,
            and containerized deployment options:
          </p>

          <div className="table-wrap become-cards" style={{ marginTop: 16 }}>
            <table className="data">
              <thead>
                <tr>
                  <th style={{ width: '35%' }}>Component &amp; Technology</th>
                  <th>Engineering Implementation</th>
                </tr>
              </thead>
              <tbody>
                {TECH_STACK.map((item) => (
                  <tr key={item.name}>
                    <td data-label="Component" className="bold mono small">{item.name}</td>
                    <td data-label="Implementation" className="small">{item.role}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ------------------------------------------------------------ CREDITS & GOVERNANCE */}
        <section className="landing-section" id="credits">
          <div className="card credits-card">
            <div className="row wrap" style={{ gap: 10, alignItems: 'center', marginBottom: 12 }}>
              <span className="brand-mark" aria-hidden="true" data-monogram="CR" />
              <h2 style={{ margin: 0 }}>Campus Relay · Credits &amp; Attribution</h2>
            </div>

            <p style={{ maxWidth: '80ch', lineHeight: 1.6, color: 'var(--muted-ink)' }}>
              <strong>Campus Relay</strong> was designed and developed by{' '}
              <strong style={{ color: 'var(--ink)' }}>Crystal Studio Labs</strong> for the{' '}
              <strong style={{ color: 'var(--ink)' }}>BPUT Hackathon 2026</strong> addressing{' '}
              <strong>Problem Statement 07: Fretbox</strong>.
            </p>

            <div className="landing-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', marginTop: 16 }}>
              <div className="metric">
                <span className="metric-label">DEVELOPED BY</span>
                <span className="metric-value bold">Crystal Studio Labs</span>
                <span className="tiny muted">Engineering Excellence</span>
              </div>
              <div className="metric">
                <span className="metric-label">HACKATHON EVENT</span>
                <span className="metric-value bold">BPUT Hackathon 2026</span>
                <span className="tiny muted">State-Level Innovation</span>
              </div>
              <div className="metric">
                <span className="metric-label">PROBLEM STATEMENT</span>
                <span className="metric-value bold">PS07 (Fretbox)</span>
                <span className="tiny muted">Campus Operations Layer</span>
              </div>
              <div className="metric">
                <span className="metric-label">GOVERNANCE &amp; LICENSE</span>
                <span className="metric-value bold">MIT Open Source</span>
                <span className="tiny muted">Configurable, Never Forked</span>
              </div>
            </div>

            <div className="row wrap" style={{ gap: 16, marginTop: 24 }}>
              <Link className="btn btn-primary" to="/login">
                Explore Demo Environment
              </Link>
              <Link className="btn btn-ghost" to="/kiosk">
                Test Kiosk Mode
              </Link>
              <a
                className="btn btn-ghost"
                href="https://github.com/Crystal-Studio-Labs/Campus-Relay"
                target="_blank"
                rel="noreferrer"
              >
                GitHub Repository ↗
              </a>
            </div>
          </div>
        </section>
      </div>

      {/* ------------------------------------------------------------ MASTER FOOTER */}
      <MasterFooter />
    </div>
  )
}
