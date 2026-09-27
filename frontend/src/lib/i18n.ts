/** Translation architecture.
 *
 *  Visible strings are not hardcoded in components; they are looked up here so
 *  adding a language is a data change. Supports English (en), Hindi (hi), and
 *  Odia (or). The UI marks any missing key by falling back to English rather than
 *  showing a blank or raw identifier.
 *
 *  Default language is English (en).
 */

import { useEffect, useState } from 'react'

export type LanguageCode = 'en' | 'hi' | 'or'

export const LANGUAGES: { code: LanguageCode; label: string; native: string }[] = [
  { code: 'en', label: 'English', native: 'English' },
  { code: 'hi', label: 'Hindi', native: 'हिन्दी' },
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
  'nav.audit': 'Audit ledger',
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
  'status.open': 'Open',
  'status.inProgress': 'In Progress',
  'status.resolved': 'Resolved',
  'status.closed': 'Closed',
  'student.newRequest': 'New request',
  'student.myCases': 'My cases',
  'student.quickActions': 'Quick actions',
  'case.caseNumber': 'Case number',
  'case.status': 'Status',
  'case.priority': 'Priority',
  'case.sla': 'Target SLA',
  'case.assignedTo': 'Assigned to',
  'case.timeline': 'Timeline',
  'case.comments': 'Comments',
  'case.attachments': 'Evidence / Attachments',
  'notice.readAll': 'Mark all read',
  'notice.ackRequired': 'Acknowledgement required',
  'kiosk.welcome': 'Welcome',
  'kiosk.title': 'Student Service Terminal',
  'kiosk.subtitle': 'Enter student roll number to check ticket status or file an urgent hostel / campus grievance.',
  'kiosk.rollPlaceholder': 'ROLL NUMBER (E.G. 2026-CS-042)',
  'kiosk.quickTestRolls': 'QUICK-TEST ROLL PRESETS (TAP TO VERIFY):',
  'kiosk.verifyIdentity': '⚡ Verify Identity & Open Services →',
  'kiosk.alerts': 'Campus Alert Bulletin',
  'kiosk.liveBroadcast': 'LIVE BROADCAST',
  'kiosk.securityNotice': '🔒 NO PASSWORDS STORED · 90-SECOND AUTO-PURGE',
  'kiosk.studentVerified': 'STUDENT VERIFIED',
  'kiosk.selectService': 'Select Service Category',
  'kiosk.serviceHint': 'Tap the category that matches your issue. AI dispatch will route this ticket to the on-duty staff queue.',
  'kiosk.checkStatus': '🔍 Check Status of My Existing Requests',
  'kiosk.startOver': '✕ Start Over',
  'kiosk.describeProblem': 'Describe the Problem (In Your Own Words)',
  'kiosk.describeHint': 'Minimum 8 characters. Say it plainly — AI classification will triage priority.',
  'kiosk.locationCode': 'Location Code / Room / Asset Label (Optional)',
  'kiosk.locationHint': 'Printed on the door, appliance sticker, or corridor switchboard (e.g. H3-204, LAB-4B).',
  'kiosk.backToServices': '← Back to Services',
  'kiosk.registerRequest': '⚡ Register Request & Issue Receipt →',
  'kiosk.officialReceipt': 'OFFICIAL PHYSICAL TRANSACTION RECORD',
  'kiosk.queuedDispatched': 'QUEUED & DISPATCHED',
  'kiosk.printReceipt': '🖨️ Print Paper Receipt',
  'kiosk.anotherRequest': '+ Register Another Request',
  'kiosk.finish': '✓ Finish & Wipe Screen',
  'kiosk.requestTracker': 'Request History & Live Tracker',
  'kiosk.newRequest': '+ File a New Request',
  'kiosk.exitKiosk': 'Exit Kiosk Mode',
  'kiosk.idleReset': 'This screen resets after 90s of no activity.',
  'kiosk.endSession': 'End kiosk session',
  'language.label': 'Language',
  'theme.light': 'Light Theme',
  'theme.dark': 'Dark Theme',
  'theme.toggle': 'Toggle Theme',
}

const hi: Dictionary = {
  'app.name': 'कैम्पस रिले',
  'app.tagline': 'दैनिक कैम्पस संचालन के लिए एक सुदृढ़ ऑपरेटिंग सिस्टम।',
  'nav.home': 'मुख्य पृष्ठ',
  'nav.cases': 'मामले',
  'nav.notices': 'सूचनाएं',
  'nav.notifications': 'अलर्ट',
  'nav.profile': 'प्रोफ़ाइल',
  'nav.report': 'शिकायत / अनुरोध',
  'nav.queue': 'मामला कतार',
  'nav.approvals': 'अनुमोदन',
  'nav.analytics': 'विश्लेषण',
  'nav.operations': 'संचालन',
  'nav.audit': 'ऑडिट लेजर',
  'nav.tasks': 'मेरे कार्य',
  'nav.gate': 'गेट सुरक्षा',
  'nav.logout': 'साइन आउट',
  'nav.dashboard': 'कमांड सेंटर',
  'action.submit': 'जमा करें',
  'action.cancel': 'रद्द करें',
  'action.save': 'सहेजें',
  'action.retry': 'पुनः प्रयास करें',
  'action.close': 'बंद करें',
  'action.verify': 'सत्यापित करें',
  'action.reopen': 'पुनः खोलें',
  'action.resolve': 'समाधान चिह्नित करें',
  'action.start': 'कार्य शुरू करें',
  'action.approve': 'स्वीकृत करें',
  'action.reject': 'अस्वीकृत करें',
  'action.assign': 'सौंपें',
  'action.escalate': 'उच्च स्तर पर भेजें',
  'action.share': 'साझा करें',
  'action.read': 'पढ़ा हुआ चिह्नित करें',
  'action.acknowledge': 'स्वीकार करें',
  'action.openCase': 'मामला खोलें',
  'offline.title': 'आप ऑफ़लाइन हैं',
  'offline.message': 'इंटरनेट कनेक्शन बहाल होने पर आपका अनुरोध अपने आप सिंक हो जाएगा।',
  'offline.queued': 'कतार में',
  'offline.syncing': 'सिंक हो रहा है',
  'offline.synced': 'सिंक हो चुका',
  'offline.retrying': 'विफल - पुनः प्रयास',
  'offline.conflict': 'विरोधाभास - समीक्षा आवश्यक',
  'offline.requiresAction': 'विफल - आपकी कार्रवाई आवश्यक',
  'status.needsVerification': 'सत्यापन आवश्यक',
  'status.open': 'सक्रिय',
  'status.inProgress': 'प्रगति पर',
  'status.resolved': 'हल हो गया',
  'status.closed': 'बंद',
  'student.newRequest': 'नया अनुरोध',
  'student.myCases': 'मेरे मामले',
  'student.quickActions': 'त्वरित कार्रवाई',
  'case.caseNumber': 'मामला संख्या',
  'case.status': 'स्थिति',
  'case.priority': 'प्राथमिकता',
  'case.sla': 'लक्ष्य समय',
  'case.assignedTo': 'आवंटित',
  'case.timeline': 'समयरेखा',
  'case.comments': 'टिप्पणियाँ',
  'case.attachments': 'प्रमाण / दस्तावेज़',
  'notice.readAll': 'सभी पढ़े हुए चिह्नित करें',
  'notice.ackRequired': 'पावती अनिवार्य',
  'kiosk.welcome': 'स्वागत है',
  'kiosk.title': 'विद्यार्थी सेवा टर्मिनल',
  'kiosk.subtitle': 'स्थिति जांचने या हॉस्टल / कैम्पस समस्या दर्ज करने के लिए अपना रोल नंबर दर्ज करें।',
  'kiosk.rollPlaceholder': 'रोल नंबर (जैसे 2026-CS-042)',
  'kiosk.quickTestRolls': 'परीक्षण रोल नंबर (क्लिक करें):',
  'kiosk.verifyIdentity': '⚡ पहचान सत्यापित करें और सेवाएं देखें →',
  'kiosk.alerts': 'कैम्पस सूचना बुलेटिन',
  'kiosk.liveBroadcast': 'लाइव प्रसारण',
  'kiosk.securityNotice': '🔒 कोई पासवर्ड सुरक्षित नहीं रहता · 90 सेकंड में स्वतः साफ़',
  'kiosk.studentVerified': 'विद्यार्थी सत्यापित',
  'kiosk.selectService': 'सेवा श्रेणी चुनें',
  'kiosk.serviceHint': 'अपनी समस्या से संबंधित श्रेणी पर टैप करें। एआई तुरंत ड्यूटी स्टाफ को प्रेषित करेगा।',
  'kiosk.checkStatus': '🔍 मेरे पहले से दर्ज अनुरोधों की स्थिति देखें',
  'kiosk.startOver': '✕ शुरू से शुरू करें',
  'kiosk.describeProblem': 'समस्या का विवरण दें (अपने शब्दों में)',
  'kiosk.describeHint': 'कम से कम 8 अक्षर। स्पष्ट रूप से बताएं — एआई प्राथमिकता तय करेगा।',
  'kiosk.locationCode': 'स्थान कोड / कमरा / उपकरण स्टिकर (वैकल्पिक)',
  'kiosk.locationHint': 'दरवाजे, उपकरण या स्विचबोर्ड पर लिखा कोड (जैसे H3-204, LAB-4B)।',
  'kiosk.backToServices': '← सेवाएं पर वापस जाएं',
  'kiosk.registerRequest': '⚡ अनुरोध दर्ज करें और रसीद पाएं →',
  'kiosk.officialReceipt': 'आधिकारिक भौतिक लेनदेन रसीद',
  'kiosk.queuedDispatched': 'कतारबद्ध एवं प्रेषित',
  'kiosk.printReceipt': '🖨️ कागजी रसीद प्रिंट करें',
  'kiosk.anotherRequest': '+ एक और अनुरोध दर्ज करें',
  'kiosk.finish': '✓ समाप्त करें और स्क्रीन साफ़ करें',
  'kiosk.requestTracker': 'अनुरोध इतिहास और लाइव ट्रैकर',
  'kiosk.newRequest': '+ नया अनुरोध दर्ज करें',
  'kiosk.exitKiosk': 'कियोस्क मोड से बाहर निकलें',
  'kiosk.idleReset': 'स्क्रीन निष्क्रिय रहने पर 90 सेकंड में रीसेट हो जाती है।',
  'kiosk.endSession': 'कियोस्क सत्र समाप्त करें',
  'language.label': 'भाषा',
  'theme.light': 'लाइट थीम (सफ़ेद)',
  'theme.dark': 'डार्क थीम',
  'theme.toggle': 'थीम बदलें',
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
  'nav.audit': 'ଅଡିଟ୍ ଲେଜର',
  'nav.tasks': 'ମୋର କାର୍ଯ୍ୟ',
  'nav.gate': 'ଗେଟ୍ ସୁରକ୍ଷା',
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
  'status.open': 'ସକ୍ରିୟ',
  'status.inProgress': 'ଚାଲୁ ରହିଛି',
  'status.resolved': 'ସମାଧାନ ହୋଇଛି',
  'status.closed': 'ବନ୍ଦ ହୋଇଛି',
  'student.newRequest': 'ନୂଆ ଅନୁରୋଧ',
  'student.myCases': 'ମୋର ମାମଲା',
  'student.quickActions': 'ଶୀଘ୍ର କାର୍ଯ୍ୟ',
  'case.caseNumber': 'ମାମଲା ନମ୍ବର',
  'case.status': 'ସ୍ଥିତି',
  'case.priority': 'ପ୍ରାଥମିକତା',
  'case.sla': 'ଲକ୍ଷ୍ୟ ସମୟ',
  'case.assignedTo': 'ନ୍ୟସ୍ତ କର୍ମଚାରୀ',
  'case.timeline': 'ସମୟରେଖା',
  'case.comments': 'ମନ୍ତବ୍ୟ',
  'case.attachments': 'ପ୍ରମାଣ ପତ୍ର',
  'notice.readAll': 'ସମସ୍ତ ପଢ଼ିଛି ବୋଲି ଚିହ୍ନଟ କରନ୍ତୁ',
  'notice.ackRequired': 'ସ୍ୱୀକୃତି ଆବଶ୍ୟକ',
  'kiosk.welcome': 'ସ୍ୱାଗତ',
  'kiosk.title': 'ଛାତ୍ର ସେବା ଟର୍ମିନାଲ',
  'kiosk.subtitle': 'ସ୍ଥିତି ଯାଞ୍ଚ କିମ୍ବା ହଷ୍ଟେଲ / କ୍ୟାମ୍ପସ ଅଭିଯୋଗ ଦାଖଲ ପାଇଁ ନିଜର ରୋଲ୍ ନମ୍ବର ଦିଅନ୍ତୁ।',
  'kiosk.rollPlaceholder': 'ରୋଲ୍ ନମ୍ବର (ଯେପରିକି 2026-CS-042)',
  'kiosk.quickTestRolls': 'ପରୀକ୍ଷଣ ରୋଲ୍ ନମ୍ବର (କ୍ଲିକ୍ କରନ୍ତୁ):',
  'kiosk.verifyIdentity': '⚡ ପରିଚୟ ଯାଞ୍ଚ କରନ୍ତୁ ଓ ସେବା ଦେଖନ୍ତୁ →',
  'kiosk.alerts': 'କ୍ୟାମ୍ପସ ସୂଚନାପତ୍ର',
  'kiosk.liveBroadcast': 'ଜରୁରୀ ପ୍ରସାରଣ',
  'kiosk.securityNotice': '🔒 କୌଣସି ପାସୱାର୍ଡ଼ ସଂରକ୍ଷିତ ରହେନାହିଁ · ୯୦ ସେକେଣ୍ଡରେ ଆପେଆପେ ସଫା ହୁଏ',
  'kiosk.studentVerified': 'ଛାତ୍ର ଯାଞ୍ଚ ସଫଳ',
  'kiosk.selectService': 'ସେବା ବର୍ଗ ଚୟନ କରନ୍ତୁ',
  'kiosk.serviceHint': 'ଆପଣଙ୍କ ସମସ୍ୟା ଅନୁଯାୟୀ ବର୍ଗ ଉପରେ ଟ୍ୟାପ୍ କରନ୍ତୁ। ଏଆଇ ସିଧାସଳଖ ଡ୍ୟୁଟି କର୍ମଚାରୀଙ୍କୁ ପଠାଇବ।',
  'kiosk.checkStatus': '🔍 ମୋର ପୂର୍ବ ଅନୁରୋଧ ଗୁଡ଼ିକର ସ୍ଥିତି ଯାଞ୍ଚ କରନ୍ତୁ',
  'kiosk.startOver': '✕ ପ୍ରଥମରୁ ଆରମ୍ଭ କରନ୍ତୁ',
  'kiosk.describeProblem': 'ସମସ୍ୟା ବର୍ଣ୍ଣନା କରନ୍ତୁ (ଆପଣଙ୍କ ଭାଷାରେ)',
  'kiosk.describeHint': 'ଅତି କମରେ ୮ ଟି ଅକ୍ଷର। ସରଳ ଭାବରେ ଲେଖନ୍ତୁ — ଏଆଇ ପ୍ରାଥମିକତା ନିର୍ଣ୍ଣୟ କରିବ।',
  'kiosk.locationCode': 'ସ୍ଥାନ କୋଡ଼ / କୋଠରୀ / ଯନ୍ତ୍ରାଂଶ ଲେବୁଲ୍ (ଇଚ୍ଛାଧୀନ)',
  'kiosk.locationHint': 'କବାଟ, ଉପକରଣ କିମ୍ବା ସୁଇଚ୍ ବୋର୍ଡ଼ରେ ଲେଖାଥିବା କୋଡ଼ (ଯେପରିକି H3-204, LAB-4B)।',
  'kiosk.backToServices': '← ସେବା ତାଲିକାକୁ ଫେରନ୍ତୁ',
  'kiosk.registerRequest': '⚡ ଅନୁରୋଧ ଦାଖଲ କରନ୍ତୁ ଓ ରସିଦ ପାଆନ୍ତୁ →',
  'kiosk.officialReceipt': 'ସରକାରୀ ଭୌତିକ କାରବାର ରସିଦ',
  'kiosk.queuedDispatched': 'ଧାଡ଼ିବଦ୍ଧ ଏବଂ ପ୍ରେରିତ',
  'kiosk.printReceipt': '🖨️ କାଗଜ ରସିଦ ପ୍ରିଣ୍ଟ କରନ୍ତୁ',
  'kiosk.anotherRequest': '+ ଆଉ ଏକ ଅନୁରୋଧ ଦାଖଲ କରନ୍ତୁ',
  'kiosk.finish': '✓ ସମାପ୍ତ କରନ୍ତୁ ଓ ସ୍କ୍ରିନ୍ ସଫା କରନ୍ତୁ',
  'kiosk.requestTracker': 'ଅନୁରୋଧ ଇତିହାସ ଓ ଲାଇଭ୍ ଟ୍ରାକର୍',
  'kiosk.newRequest': '+ ନୂଆ ଅନୁରୋଧ ଦାଖଲ କରନ୍ତୁ',
  'kiosk.exitKiosk': 'କିଓସ୍କ ମୋଡ୍‌ରୁ ବାହାରନ୍ତୁ',
  'kiosk.idleReset': 'ଏହି ସ୍କ୍ରିନ୍ କିଛି ସମୟ ନିଷ୍କ୍ରିୟ ରହିଲେ ୯୦ ସେକେଣ୍ଡରେ ଆପେ ରିସେଟ୍ ହୋଇଯିବ।',
  'kiosk.endSession': 'କିଓସ୍କ ସେସନ୍ ସମାପ୍ତ କରନ୍ତୁ',
  'language.label': 'ଭାଷା',
  'theme.light': 'ଲାଇଟ୍ ଥିମ୍ (ଧଳା)',
  'theme.dark': 'ଡାର୍କ ଥିମ୍',
  'theme.toggle': 'ଥିମ୍ ପରିବର୍ତ୍ତନ',
}

const DICTIONARIES: Record<LanguageCode, Dictionary> = { en, hi, or }

let active: LanguageCode = (() => {
  try {
    const stored = window.localStorage.getItem('campusrelay.language')
    if (stored === 'hi' || stored === 'or' || stored === 'en') {
      return stored as LanguageCode
    }
    return 'en'
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
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('campusrelay:language', { detail: code }))
  }
}

/** Reactive hook to subscribe to language state changes across the component tree */
export function useLanguage() {
  const [lang, setLang] = useState<LanguageCode>(currentLanguage)

  useEffect(() => {
    const onLangChange = (event: Event) => {
      const customEvent = event as CustomEvent<LanguageCode>
      if (customEvent.detail) {
        setLang(customEvent.detail)
      } else {
        setLang(currentLanguage())
      }
    }
    window.addEventListener('campusrelay:language', onLangChange)
    return () => window.removeEventListener('campusrelay:language', onLangChange)
  }, [])

  return {
    language: lang,
    setLanguage,
    t,
    languages: LANGUAGES,
  }
}

/** Look up a string. Missing regional strings fall back to English on purpose:
 *  showing English beats showing a raw key to a student. */
export function t(key: string): string {
  const dictionary = DICTIONARIES[active]
  if (dictionary && dictionary[key]) return dictionary[key]
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
