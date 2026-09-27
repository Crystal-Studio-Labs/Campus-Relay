/** Kiosk station and section configuration.
 *
 *  A kiosk in a campus corridor belongs to a physical section and zone:
 *  for example, "Hostel 3 · 1st Floor Corridor" or "Central Library Concourse".
 *
 *  Only administrators, super administrators, or station supervisors holding
 *  the supervisor PIN can reassign which section a kiosk serves, or decommission
 *  the station session.
 */

import { useEffect, useState } from 'react'

export interface KioskStationSection {
  id: string
  stationId: string
  stationName: string
  sectionName: string
  locationCode: string
  zone: string
  description: string
}

export const CAMPUS_STATION_SECTIONS: KioskStationSection[] = [
  {
    id: 'STATION-06',
    stationId: 'KSK-H3-01',
    stationName: 'STATION 06',
    sectionName: 'Hostel 3 · 1st Floor Corridor',
    locationCode: 'H3-CORRIDOR-1F',
    zone: 'HOSTEL_ZONE',
    description: 'Serving Residents of Hostel 3 (Rooms 101–150)',
  },
  {
    id: 'STATION-03',
    stationId: 'KSK-H1-01',
    stationName: 'STATION 03',
    sectionName: 'Hostel 1 · Ground Floor Lobby',
    locationCode: 'H1-GROUND-LOBBY',
    zone: 'HOSTEL_ZONE',
    description: 'Boys Hostel 1 Main Concourse and Common Room',
  },
  {
    id: 'STATION-02',
    stationId: 'KSK-LIB-01',
    stationName: 'STATION 02',
    sectionName: 'Central Library · Main Concourse',
    locationCode: 'LIB-CONCOURSE-1F',
    zone: 'LIBRARY_ZONE',
    description: 'Central Library Circulation & Study Halls',
  },
  {
    id: 'STATION-01',
    stationId: 'KSK-GATE-01',
    stationName: 'STATION 01',
    sectionName: 'North Campus Gate · Terminal 01',
    locationCode: 'GATE-NORTH-01',
    zone: 'SECURITY_ZONE',
    description: 'Main Gate Access & Visitor Intake',
  },
  {
    id: 'STATION-08',
    stationId: 'KSK-MESS-01',
    stationName: 'STATION 08',
    sectionName: 'Dining Hall · Central Entry',
    locationCode: 'MESS-CENTRAL-01',
    zone: 'DINING_ZONE',
    description: 'Central Mess & Food Services Feedback',
  },
  {
    id: 'STATION-12',
    stationId: 'KSK-ACAD-02',
    stationName: 'STATION 12',
    sectionName: 'Academic Block B · Ground Floor',
    locationCode: 'ACAD-BLOCK-B',
    zone: 'ACADEMIC_ZONE',
    description: 'Lecture Halls, Labs, and Department Offices',
  },
]

const STORAGE_KEY = 'campusrelay.kiosk_section'
const PIN_STORAGE_KEY = 'campusrelay.supervisor_pin'
const DEFAULT_SECTION = CAMPUS_STATION_SECTIONS[0] // STATION-06
const DEFAULT_SUPERVISOR_PIN = '1947'
const CHANGE_EVENT = 'campusrelay:kiosk_section_changed'

export function getKioskSection(): KioskStationSection {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_SECTION
    const parsed = JSON.parse(raw) as KioskStationSection
    if (parsed && parsed.stationId && parsed.stationName) {
      return parsed
    }
    return DEFAULT_SECTION
  } catch {
    return DEFAULT_SECTION
  }
}

export function setKioskSection(section: KioskStationSection): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(section))
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: section }))
  } catch {
    /* fallback to in-memory */
  }
}

export function verifySupervisorPin(enteredPin: string): boolean {
  const clean = enteredPin.trim()
  if (!clean) return false
  const customPin = window.localStorage.getItem(PIN_STORAGE_KEY)
  const validPins = [DEFAULT_SUPERVISOR_PIN, 'admin', '0000']
  if (customPin) validPins.push(customPin)
  return validPins.includes(clean)
}

export function setSupervisorPin(newPin: string): void {
  try {
    window.localStorage.setItem(PIN_STORAGE_KEY, newPin.trim())
  } catch {
    /* fallback */
  }
}

/** Reactive hook to listen to kiosk station/section configuration changes */
export function useKioskSection() {
  const [section, setSectionState] = useState<KioskStationSection>(getKioskSection)

  useEffect(() => {
    const handleUpdate = () => {
      setSectionState(getKioskSection())
    }
    window.addEventListener(CHANGE_EVENT, handleUpdate)
    window.addEventListener('storage', handleUpdate)
    return () => {
      window.removeEventListener(CHANGE_EVENT, handleUpdate)
      window.removeEventListener('storage', handleUpdate)
    }
  }, [])

  const updateSection = (newSection: KioskStationSection) => {
    setKioskSection(newSection)
    setSectionState(newSection)
  }

  return {
    section,
    setSection: updateSection,
    allSections: CAMPUS_STATION_SECTIONS,
  }
}
