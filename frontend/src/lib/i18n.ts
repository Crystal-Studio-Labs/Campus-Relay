/** Translation architecture.
 *
 *  Visible strings are not hardcoded in components; they are looked up here so
 *  adding a language is a data change. Odia (or) is the regional language the
 *  brief calls out; its coverage below is deliberately partial and the UI marks
 *  any missing key by falling back to English rather than showing a blank.
 */

export type LanguageCode = 'en' | 'or'

export const LANGUAGES: { code: LanguageCode; label: string; native: string }[] = [
  { code: 'en', label: 'English', native: 'English' },
  { code: 'or', label: 'Odia', native: 'ଓଡ଼ିଆ' },
]

type Dictionary = Record<string, string>

const en: Dictionary = {
  'app.name': 'Campus Relay',
  'app.tagline': 'A resilient operating layer for everyday campus operations.',
  'nav.home': 'Home',
  'nav.cases': 'Cases',
  'nav.notices': 'Notices',
  'nav.notifications': 'Alerts',
  'nav.profile': 'Profile',
  'nav.report': 'Report / Request',
  'nav.queue': 'Case queue',
  'nav.approvals': 'Approvals',
  'nav.analytics': 'Analytics',
  'nav.operations': 'Operations',
  'nav.audit': 'Audit',
  'nav.tasks': 'My tasks',
  'nav.gate': 'Gate',
  'nav.logout': 'Sign out',
  'nav.dashboard': 'Command centre',
  'action.submit': 'Submit',
  'action.cancel': 'Cancel',
  'action.save': 'Save',
  'action.retry': 'Retry',
  'action.close': 'Close',
  'action.verify': 'Verify',
  'action.reopen': 'Reopen',
  'action.resolve': 'Mark resolved',
  'action.start': 'Start work',
  'action.approve': 'Approve',
  'action.reject': 'Reject',
  'action.assign': 'Assign',
  'action.escalate': 'Escalate',
  'action.share': 'Share',
  'action.read': 'Mark read',
  'action.acknowledge': 'Acknowledge',
  'action.openCase': 'Open case',
  'offline.title': 'You are offline',
  'offline.message': 'Your request will sync automatically when connection returns.',
  'offline.queued': 'Queued',
  'offline.syncing': 'Syncing',
  'offline.synced': 'Synced',
  'offline.retrying': 'Failed - retrying',
  'offline.conflict': 'Conflict - needs review',
  'offline.requiresAction': 'Failed - needs your action',
  'status.needsVerification': 'Needs your verification',
  'student.newRequest': 'New request',
  'student.myCases': 'My cases',
  'student.quickActions': 'Quick actions',
  'case.caseNumber': 'Case number',
  'case.status': 'Status',
  'case.priority': 'Priority',
  'case.sla': 'Target',
  'case.assignedTo': 'Assigned to',
  'case.timeline': 'Timeline',
  'case.comments': 'Comments',
  'case.attachments': 'Evidence',
  'notice.readAll': 'Mark all read',
  'notice.ackRequired': 'Acknowledgement required',
  'kiosk.welcome': 'Welcome',
  'kiosk.enterId': 'Enter your student ID',
  'kiosk.whatDoYouNeed': 'What do you need?',
  'kiosk.confirm': 'Confirm request',
  'language.label': 'Language',
}

const or: Dictionary = {
  'app.name': 'କ୍ୟାମ୍ପସ ରିଲେ',
  'app.tagline': 'ଦୈନନ୍ଦିନ କ୍ୟାମ୍ପସ କାର୍ଯ୍ୟ ପାଇଁ ଏକ ଭରସାଯୋଗ୍ୟ ବ୍ୟବସ୍ଥା।',
  'nav.home': 'ମୂଳପୃଷ୍ଠା',
  'nav.cases': 'ମାମଲା',
  'nav.notices': 'ସୂଚନା',
  'nav.notifications': 'ସୂଚନାପତ୍ର',
  'nav.profile': 'ପ୍ରୋଫାଇଲ',
  'nav.report': 'ଅଭିଯୋଗ / ଅନୁରୋଧ',
  'nav.queue': 'ମାମଲା ଧାଡ଼ି',
  'nav.approvals': 'ଅନୁମୋଦନ',
  'nav.analytics': 'ବିଶ୍ଳେଷଣ',
  'nav.operations': 'ପରିଚାଳନା',
  'nav.audit': 'ଅଡିଟ୍',
  'nav.tasks': 'ମୋର କାର୍ଯ୍ୟ',
  'nav.gate': 'ଗେଟ୍',
  'nav.logout': 'ସାଇନ୍ ଆଉଟ୍',
  'nav.dashboard': 'କମାଣ୍ଡ ସେଣ୍ଟର',
  'action.submit': 'ଦାଖଲ କରନ୍ତୁ',
  'action.cancel': 'ବାତିଲ୍ କରନ୍ତୁ',
  'action.save': 'ସଞ୍ଚୟ କରନ୍ତୁ',
  'action.retry': 'ପୁନଃ ଚେଷ୍ଟା କରନ୍ତୁ',
  'action.close': 'ବନ୍ଦ କରନ୍ତୁ',
  'action.verify': 'ଯାଞ୍ଚ କରନ୍ତୁ',
  'action.reopen': 'ପୁନଃ ଖୋଲନ୍ତୁ',
  'action.resolve': 'ସମାଧାନ ହୋଇଛି ବୋଲି ଚିହ୍ନଟ କରନ୍ତୁ',
  'action.start': 'କାର୍ଯ୍ୟ ଆରମ୍ଭ କରନ୍ତୁ',
  'action.approve': 'ଅନୁମୋଦନ କରନ୍ତୁ',
  'action.reject': 'ପ୍ରତ୍ୟାଖ୍ୟାନ କରନ୍ତୁ',
  'action.assign': 'ନ୍ୟସ୍ତ କରନ୍ତୁ',
  'action.escalate': 'ଉଚ୍ଚତର କରନ୍ତୁ',
  'action.share': 'ଅଂଶୀଦାର କରନ୍ତୁ',
  'action.read': 'ପଢ଼ିଛି ବୋଲି ଚିହ୍ନଟ କରନ୍ତୁ',
  'action.acknowledge': 'ସ୍ୱୀକାର କରନ୍ତୁ',
  'action.openCase': 'ମାମଲା ଖୋଲନ୍ତୁ',
  'offline.title': 'ଆପଣ ଅଫଲାଇନ୍ ଅଛନ୍ତି',
  'offline.message': 'ସଂଯୋଗ ଫେରିଲେ ଆପଣଙ୍କ ଅନୁରୋଧ ସ୍ୱୟଂଚାଳିତ ଭାବେ ସିଙ୍କ ହେବ।',
  'offline.queued': 'ଅପେକ୍ଷାରେ',
  'offline.syncing': 'ସିଙ୍କ ହେଉଛି',
  'offline.synced': 'ସିଙ୍କ ହୋଇଛି',
  'offline.retrying': 'ବିଫଳ - ପୁନଃ ଚେଷ୍ଟା',
  'offline.conflict': 'ଦ୍ୱନ୍ଦ୍ୱ - ସମୀକ୍ଷା ଆବଶ୍ୟକ',
  'offline.requiresAction': 'ବିଫଳ - ଆପଣଙ୍କ କାର୍ଯ୍ୟ ଆବଶ୍ୟକ',
  'status.needsVerification': 'ଆପଣଙ୍କ ଯାଞ୍ଚ ଆବଶ୍ୟକ',
  'student.newRequest': 'ନୂଆ ଅନୁରୋଧ',
  'student.myCases': 'ମୋର ମାମଲା',
  'student.quickActions': 'ଶୀଘ୍ର କାର୍ଯ୍ୟ',
  'case.caseNumber': 'ମାମଲା ନମ୍ବର',
  'case.status': 'ସ୍ଥିତି',
  'case.priority': 'ପ୍ରାଥମିକତା',
  'case.sla': 'ଲକ୍ଷ୍ୟ',
  'case.assignedTo': 'ନ୍ୟସ୍ତ',
  'case.timeline': 'ସମୟରେଖା',
  'case.comments': 'ମନ୍ତବ୍ୟ',
  'case.attachments': 'ପ୍ରମାଣ',
  'notice.readAll': 'ସମସ୍ତ ପଢ଼ିଛି ବୋଲି ଚିହ୍ନଟ କରନ୍ତୁ',
  'notice.ackRequired': 'ସ୍ୱୀକୃତି ଆବଶ୍ୟକ',
  'kiosk.welcome': 'ସ୍ୱାଗତ',
  'kiosk.enterId': 'ଆପଣଙ୍କ ଛାତ୍ର ଆଇଡି ଦିଅନ୍ତୁ',
  'kiosk.whatDoYouNeed': 'ଆପଣଙ୍କୁ କଣ ଆବଶ୍ୟକ?',
  'kiosk.confirm': 'ଅନୁରୋଧ ନିଶ୍ଚିତ କରନ୍ତୁ',
  'language.label': 'ଭାଷା',
}

const DICTIONARIES: Record<LanguageCode, Dictionary> = { en, or }

let active: LanguageCode = (() => {
  try {
    const stored = window.localStorage.getItem('campusrelay.language')
    return (stored === 'or' ? 'or' : 'en') as LanguageCode
  } catch {
    return 'en'
  }
})()

export function currentLanguage(): LanguageCode {
  return active
}

export function setLanguage(code: LanguageCode) {
  active = code
  try {
    window.localStorage.setItem('campusrelay.language', code)
  } catch {
    /* ignore */
  }
  if (typeof document !== 'undefined') document.documentElement.lang = code
}

/** Look up a string. Missing regional strings fall back to English on purpose:
 *  showing English beats showing a raw key to a student. */
export function t(key: string): string {
  const dictionary = DICTIONARIES[active]
  if (dictionary[key]) return dictionary[key]
  if (en[key]) return en[key]
  return key
}

export function translationCoverage(): { language: LanguageCode; translated: number; total: number }[] {
  const total = Object.keys(en).length
  return LANGUAGES.map((language) => ({
    language: language.code,
    translated: Object.keys(DICTIONARIES[language.code]).filter((key) => en[key]).length,
    total,
  }))
}
