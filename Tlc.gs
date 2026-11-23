/*****************************************************************************
 MOREH ACADEMY PORTAL - Tlc.gs  (NEW FILE)
 Taguig Learners' Certificate (TLC) Scholarship Application Portal - server side.

 WHO USES IT
   Applicants (student / enrollee accounts)   -> tlcPortal, tlcSave, tlcSubmit, tlcDocPrepared
   Admission staff (non-office admin accounts) -> tlcAdminBootstrap, tlcAdminGet, tlcAdminStatus, tlcAdminDoc, tlcAdminExport
   Administrator / System Manager only         -> tlcAdminSaveSettings, tlcAdminNoticeSave, tlcAdminNoticeDelete

 WHAT IT CREATES (all on first use, nothing to run by hand)
   "TLC Applications"  one row per applicant (key = StudentID). Add new columns ONLY at the END of TLC_COLS.
   "TLC Settings"      key / value rows: accepting, openDate, deadline, milestones, partners, contact
   "TLC Notices"       announcements from the Admission Office
   "TLC Log"           status and document history (rows marked Visible = 1 appear in the applicant's Notifications)

 It reads, and never changes, the Students sheet. The scholarship text (program, eligibility, benefits) comes from the
 existing Scholarships editor (sheet "Scholarships", program TLC) and falls back to SCH_DEFAULT in Code.gs.
 Names are prefixed tl / TLC so they cannot collide with the other files of the project.
 After adding this file, deploy a NEW version.
*****************************************************************************/

const TLC_SHEET = 'TLC Applications', TLC_SET_SHEET = 'TLC Settings', TLC_NOTICE_SHEET = 'TLC Notices', TLC_LOG_SHEET = 'TLC Log';

/** Status flow. Draft is the applicant's own; the rest are set by the Admission Office. */
const TLC_STATUSES = ['Draft', 'Submitted', 'Under Review', 'For Compliance', 'Endorsed', 'Approved', 'Declined'];
const TLC_FLOW = {
  'Submitted':      ['Under Review', 'Declined'],
  'Under Review':   ['For Compliance', 'Endorsed', 'Declined'],
  'For Compliance': ['Under Review', 'Declined'],
  'Endorsed':       ['Approved', 'Declined', 'Under Review'],
  'Approved':       ['Under Review'],
  'Declined':       ['Under Review']
};
const TLC_NOTE_REQUIRED = ['For Compliance', 'Declined'];            // the office must say why
const TLC_EDITABLE = ['', 'Draft', 'For Compliance'];                 // the applicant can change the form only in these states

/** Documents (section B of the official form). o = optional. */
const TLC_DOCS = [
  { k: 'FORM',    t: 'Original Student Application Form', h: 'Print it from the Application Form page after you submit. It must be signed by you and by your parent or guardian.' },
  { k: 'F137',    t: 'Certified True Copy of Form 137', h: 'Request it from your elementary school once the 3rd grading marks are out. Three (3) photocopies, each with the official school seal.' },
  { k: 'SCHCERT', t: 'Original Certification from School', h: 'Signed by your Adviser or Principal: you are a candidate for graduation and studied at least 3 years in a public school in Taguig. Ask for it together with Form 137.' },
  { k: 'BRC',     t: 'Barangay Residency Certificate of a parent', h: 'Must state how many years your family has lived in your Taguig barangay (at least 3 years).' },
  { k: 'PSA',     t: 'Photocopy of PSA Birth Certificate', h: 'Optional, but it speeds up processing. It must be issued by the PSA, clear and readable.', o: 1 },
  { k: 'COMELEC', t: 'COMELEC Certification of a parent', h: 'Proof that your parent is a registered Taguig voter, issued after the May 12, 2025 election. A voter\u2019s ID is not accepted.' }
];
const TLC_DOC_STATUS = ['', 'Received', 'Verified', 'Resubmit'];

/* ------------------------------ columns ------------------------------ */
const TLC_SYS = ['StudentID', 'TlcRef', 'SchoolYear', 'Status', 'CreatedAt', 'UpdatedAt', 'SubmittedAt', 'ReviewedAt', 'ReviewedBy', 'ReviewNote', 'DocsPrepared', 'DocJSON'];
// [key, max length, uppercase]
const TLC_TEXT = [
  ['Surname', 60, 1], ['FirstName', 60, 1], ['MiddleName', 60, 1], ['Suffix', 10, 1], ['LRN', 12, 0],
  ['Address', 200, 0], ['Barangay', 80, 0], ['City', 80, 0], ['ResidencyYears', 3, 0], ['Mobile', 11, 0], ['Telephone', 20, 0],
  ['Birthdate', 10, 0], ['BirthPlace', 100, 0], ['Sex', 10, 0], ['Nationality', 40, 0], ['Email', 100, 0], ['Religion', 60, 0],
  ['HasCase', 10, 0], ['CaseDetails', 400, 0],
  ['Choice1', 100, 0], ['Choice2', 100, 0], ['Choice3', 100, 0],
  ['FatherStatus', 10, 0], ['FatherName', 80, 1], ['FatherAddress', 200, 0], ['FatherContact', 11, 0], ['FatherOccupation', 80, 0], ['FatherWorkplace', 100, 0], ['FatherEducation', 60, 0], ['FatherIncome', 20, 0],
  ['MotherStatus', 10, 0], ['MotherName', 80, 1], ['MotherAddress', 200, 0], ['MotherContact', 11, 0], ['MotherOccupation', 80, 0], ['MotherWorkplace', 100, 0], ['MotherEducation', 60, 0], ['MotherIncome', 20, 0],
  ['Housing', 20, 0], ['HousingOther', 100, 0], ['ElectricBill', 20, 0], ['WaterBill', 20, 0], ['MonthlyRent', 20, 0], ['FamilySize', 3, 0], ['TlcRelative', 5, 0], ['TlcRelativeDetail', 150, 0],
  ['AppSignName', 100, 1], ['ParentName', 100, 1], ['ParentRelation', 40, 1], ['ParentSignName', 100, 1]
];
const TLC_OTHER = ['Eligibility', 'AppAgree', 'ParentAgree', 'ElemJSON', 'SiblingsJSON'];
const TLC_COLS = TLC_SYS.concat(TLC_TEXT.map(f => f[0]), TLC_OTHER);      // new columns go at the END only
const TLC_ELIG = ['E1', 'E2', 'E3', 'E4', 'E5', 'E6'];

const TLC_DEFAULTS = {
  accepting: '1', openDate: '', deadline: '',
  milestones: [
    { title: 'Evaluation and validation of documents', start: '', end: '', note: 'The Admission Office checks your application and documents.' },
    { title: 'Endorsement to the TLC Office', start: '', end: '', note: 'Complete applications are sent to the Taguig Scholarships Office.' },
    { title: 'Release of results', start: '', end: '', note: 'Results are posted here and emailed to you.' },
    { title: 'Enrollment of approved scholars', start: '', end: '', note: 'Approved scholars enroll as Grade 7 students.' }
  ],
  partners: ['Moreh Academy'],
  contact: 'Admission Office, Ground Floor, Moreh Academy Learning Center 3, Reyes St., Central Bicutan, Taguig City. Mon\u2013Fri 8:00 AM\u20135:00 PM, Sat 8:00 AM\u20133:00 PM. Email morehians@gmail.com. Mobile 09618766886.'
};

/* ------------------------------ small helpers ------------------------------ */
const tlNow_ = () => Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
const tlToday_ = () => Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
const tlJ_ = (s, d) => { try { const v = JSON.parse(s); return v == null ? d : v; } catch (_) { return d; } };
const tlIsDate_ = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) && !isNaN(new Date(v).getTime());
const tlClip_ = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const tlName_ = a => [String(a.Surname || '') + ',', a.FirstName, a.MiddleName ? String(a.MiddleName)[0] + '.' : '', a.Suffix].filter(Boolean).join(' ');
const tlSafeCell_ = v => { v = String(v == null ? '' : v); return /^[=+\-@\t\r]/.test(v) ? "'" + v : v; };

const TLSHM_ = {};
function tlSheet_(name, headers) {
  if (TLSHM_[name]) return TLSHM_[name];
  const ss = SpreadsheetApp.getActiveSpreadsheet(); let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    if (sh.getMaxColumns() < headers.length) sh.insertColumnsAfter(sh.getMaxColumns(), headers.length - sh.getMaxColumns());
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold'); sh.setFrozenRows(1);
    sh.getRange(1, 1, sh.getMaxRows(), headers.length).setNumberFormat('@');
  } else if (sh.getLastColumn() < headers.length) {          // columns added at the end of a newer version
    const from = sh.getLastColumn() + 1;
    if (sh.getMaxColumns() < headers.length) sh.insertColumnsAfter(sh.getMaxColumns(), headers.length - sh.getMaxColumns());
    sh.getRange(1, from, 1, headers.length - from + 1).setValues([headers.slice(from - 1)]).setFontWeight('bold');
    sh.getRange(1, from, sh.getMaxRows(), headers.length - from + 1).setNumberFormat('@');
  }
  return TLSHM_[name] = sh;
}
const tlApps_ = () => tlSheet_(TLC_SHEET, TLC_COLS);
const tlRowObj_ = (v, cols) => { const o = {}; cols.forEach((c, i) => o[c] = String(v[i] == null ? '' : v[i])); return o; };
function tlAll_() { const sh = tlApps_(), n = sh.getLastRow() - 1; return n < 1 ? [] : sh.getRange(2, 1, n, TLC_COLS.length).getValues().map(v => tlRowObj_(v, TLC_COLS)); }
function tlFind_(id) {
  const sh = tlApps_(), n = sh.getLastRow() - 1; id = String(id || ''); if (n < 1 || !id) return null;
  const i = sh.getRange(2, 1, n, 1).getValues().flat().map(String).indexOf(id); if (i < 0) return null;
  return { r: i + 2, o: tlRowObj_(sh.getRange(i + 2, 1, 1, TLC_COLS.length).getValues()[0], TLC_COLS) };
}
const tlWrite_ = (r, o) => put_(tlApps_(), r, 1, [TLC_COLS.map(c => o[c] == null ? '' : String(o[c]))]);

function tlLog_(id, actor, event, detail, visible) {
  try { const sh = tlSheet_(TLC_LOG_SHEET, ['At', 'Actor', 'StudentID', 'Event', 'Detail', 'Visible']); put_(sh, sh.getLastRow() + 1, 1, [[tlNow_(), actor || '', id || '', event || '', tlClip_(detail, 400), visible ? '1' : '']]); }
  catch (e) { Logger.log('tlLog: ' + e.message); }
}
function tlUpdates_(id) {
  const sh = tlSheet_(TLC_LOG_SHEET, ['At', 'Actor', 'StudentID', 'Event', 'Detail', 'Visible']), last = sh.getLastRow(); if (last < 2) return [];
  const from = Math.max(2, last - 399);
  return sh.getRange(from, 1, last - from + 1, 6).getValues().filter(r => String(r[2]) === String(id) && String(r[5]) === '1')
    .map(r => ({ at: String(r[0]), title: String(r[3]), msg: String(r[4]) })).reverse().slice(0, 12);
}

/* ------------------------------ settings, schedule, notices ------------------------------ */
function tlCfg_() {
  const sh = tlSheet_(TLC_SET_SHEET, ['Key', 'Value', 'UpdatedAt', 'UpdatedBy']), n = sh.getLastRow() - 1, c = JSON.parse(JSON.stringify(TLC_DEFAULTS));
  if (n >= 1) sh.getRange(2, 1, n, 2).getValues().forEach(r => {
    const k = String(r[0]); if (!(k in c)) return;
    if (typeof c[k] === 'string') c[k] = String(r[1]); else { const v = tlJ_(r[1], null); if (Array.isArray(v)) c[k] = v; }
  });
  return c;
}
/** Opening / closing logic. Drafts can always be saved; only SUBMISSION depends on this. */
function tlState_(cfg, today) {
  const o = cfg.openDate, d = cfg.deadline;
  if (cfg.accepting === '0') return { key: 'paused', label: 'Not accepting applications', canSubmit: false, daysLeft: null };
  if (tlIsDate_(o) && today < o) return { key: 'soon', label: 'Opens on ' + o, canSubmit: false, daysLeft: null };
  if (tlIsDate_(d) && today > d) return { key: 'closed', label: 'Closed on ' + d, canSubmit: false, daysLeft: null };
  const left = tlIsDate_(d) ? Math.round((new Date(d) - new Date(today)) / 864e5) : null;
  return { key: 'open', label: 'Open', canSubmit: true, daysLeft: left };
}
function tlSchedule_(cfg, today) {
  const rows = [
    { title: 'Application opens', start: cfg.openDate, end: '', note: 'You may fill in and save your form at any time; submission starts on this date.' },
    { title: 'Submission deadline', start: '', end: cfg.deadline, note: 'Submit the online form and bring your documents on or before this date.' }
  ].concat((cfg.milestones || []).map(m => ({ title: String(m.title || ''), start: String(m.start || ''), end: String(m.end || ''), note: String(m.note || '') })));
  return rows.map(r => {
    const a = tlIsDate_(r.start) ? r.start : '', b = tlIsDate_(r.end) ? r.end : '', from = a || b, to = b || a;
    r.state = !from ? 'tba' : to < today ? 'done' : from <= today ? 'now' : 'next';
    return r;
  });
}
function tlNotices_(all) {
  const sh = tlSheet_(TLC_NOTICE_SHEET, ['ID', 'PostedAt', 'PostedBy', 'Type', 'Title', 'Message', 'ExpiresOn', 'Pinned']), n = sh.getLastRow() - 1, today = tlToday_();
  let rows = n < 1 ? [] : sh.getRange(2, 1, n, 8).getValues().map(r => ({ id: String(r[0]), at: String(r[1]), by: String(r[2]), type: String(r[3]), title: String(r[4]), msg: String(r[5]), until: String(r[6]), pinned: String(r[7]) === '1' }));
  if (!all) rows = rows.filter(r => !tlIsDate_(r.until) || r.until >= today);
  return rows.sort((a, b) => (b.pinned - a.pinned) || b.at.localeCompare(a.at));
}

/** Program text from the Scholarships editor (program TLC), else the built-in default. */
function tlInfo_() {
  let secs = [];
  try {
    const sh = schSh_();
    if (sh.getLastRow() >= 2) secs = sh.getRange(2, 1, sh.getLastRow() - 1, 4).getValues().filter(r => String(r[0]) === 'TLC')
      .sort((a, b) => (parseInt(a[1], 10) || 0) - (parseInt(b[1], 10) || 0)).map(r => ({ title: String(r[2]), items: String(r[3]).split('\n').map(s => s.trim()).filter(Boolean) }));
  } catch (_) {}
  if (!secs.length) secs = ((typeof SCH_DEFAULT !== 'undefined' && SCH_DEFAULT.TLC) || []).map(s => ({ title: s[0], items: String(s[1]).split('\n').map(x => x.trim()).filter(Boolean) }));
  const by = re => secs.filter(s => re.test(s.title.toLowerCase()));
  const benefits = by(/benefit/)[0];
  return {
    about: by(/^definition/)[0] || null,
    eligibility: by(/^eligibility/),
    funding: by(/funding/)[0] || null,
    enrollDocs: by(/requirements for school enrollment/)[0] || null,
    benefits: benefits ? benefits.items : ((typeof SCHOLARSHIP !== 'undefined' && SCHOLARSHIP['TLC SCHOLAR']) || []),
    benefitsTitle: benefits ? benefits.title : 'Scholarship benefits'
  };
}

/* ------------------------------ the application record ------------------------------ */
/** Starting values taken from the learner record. Used only until the applicant saves. */
function tlPrefill_(s) {
  const a = {}; TLC_COLS.forEach(c => a[c] = '');
  const rel = s.Religion === 'Others, specify' ? (s.ReligionOther || '') : (s.Religion || '');
  Object.assign(a, {
    StudentID: s.StudentID, SchoolYear: s.SchoolYear || activeSY_(), Status: 'Draft',
    Surname: s.Surname, FirstName: s.FirstName, MiddleName: s.MiddleName, Suffix: s.Suffix, LRN: s.LRN,
    Address: [s.AddressLine1, s.AddressLine2].filter(Boolean).join(', '), Barangay: s.Barangay, City: s.City,
    Mobile: s.Mobile, Birthdate: s.Birthdate, BirthPlace: s.BirthPlace, Sex: s.SexualOrient, Nationality: 'FILIPINO', Email: s.Email, Religion: rel,
    FatherName: s.FatherName, FatherStatus: s.FatherStatus, FatherContact: s.FatherMobile, FatherOccupation: s.FatherOccupation,
    MotherName: s.MotherName, MotherStatus: s.MotherStatus, MotherContact: s.MotherMobile, MotherOccupation: s.MotherOccupation
  });
  const el = [0, 1, 2, 3, 4, 5].map(() => ({ school: '', location: '', award: '' }));
  if (s.PrevSchool && s.PrevGrade === 'Grade 6') el[5] = { school: s.PrevSchool, location: s.PrevAddress || '', award: '' };
  a.ElemJSON = JSON.stringify(el); a.SiblingsJSON = '[]';
  return a;
}

/** Cleans what the browser sent. Only known keys survive. */
function tlClean_(rec, base) {
  const a = Object.assign({}, base);
  TLC_TEXT.forEach(f => {
    if (f[0] === 'LRN') return;                                   // LRN always comes from the learner record
    let v = tlClip_(rec[f[0]], f[1]); if (f[2]) v = v.toUpperCase(); a[f[0]] = v;
  });
  a.Eligibility = String(rec.Eligibility || '').split(',').map(s => s.trim()).filter(s => TLC_ELIG.indexOf(s) >= 0).join(',');
  a.AppAgree = rec.AppAgree === '1' ? '1' : ''; a.ParentAgree = rec.ParentAgree === '1' ? '1' : '';
  const el = tlJ_(rec.ElemJSON, []), sb = tlJ_(rec.SiblingsJSON, []);
  a.ElemJSON = JSON.stringify([0, 1, 2, 3, 4, 5].map(i => { const r = (el && el[i]) || {}; return { school: tlClip_(r.school, 100), location: tlClip_(r.location, 100), award: tlClip_(r.award, 60) }; }));
  a.SiblingsJSON = JSON.stringify((Array.isArray(sb) ? sb : []).slice(0, 6).map(r => ({ name: tlClip_(r && r.name, 80).toUpperCase(), age: tlClip_(r && r.age, 3), civil: /^[SM]$/.test(r && r.civil) ? r.civil : '', school: tlClip_(r && r.school, 100) }))
    .filter(r => r.name || r.age || r.civil || r.school));
  if (a.HasCase !== 'Opo') a.CaseDetails = '';
  if (a.Housing !== 'Others') a.HousingOther = '';
  if (a.Housing !== 'Renting') a.MonthlyRent = '';
  if (a.TlcRelative !== 'Yes') a.TlcRelativeDetail = '';
  ['Father', 'Mother'].forEach(p => { if (a[p + 'Status'] === 'Deceased') ['Name', 'Address', 'Contact', 'Occupation', 'Workplace', 'Education', 'Income'].forEach(k => { if (k !== 'Name') a[p + k] = ''; }); });
  return a;
}

/** What is still missing, step by step: [eligibility, applicant, schools, elementary, parents, household, declaration]. */
function tlMissing_(a) {
  const m = [[], [], [], [], [], [], []], need = (i, k, label) => { if (!String(a[k] || '').trim()) m[i].push(label); };
  const elig = String(a.Eligibility || '').split(',');
  if (TLC_ELIG.some(k => elig.indexOf(k) < 0)) m[0].push('Confirm every eligibility item');
  [['Surname', 'Surname'], ['FirstName', 'First name'], ['Address', 'Home address'], ['Barangay', 'Barangay'], ['City', 'City'], ['ResidencyYears', 'Years living in Taguig'],
   ['BirthPlace', 'Place of birth'], ['Sex', 'Sex'], ['Nationality', 'Nationality'], ['Religion', 'Religion'], ['HasCase', 'Case or complaint question']].forEach(x => need(1, x[0], x[1]));
  if (!tlIsDate_(a.Birthdate)) m[1].push('Date of birth'); else if (new Date(a.Birthdate) > new Date()) m[1].push('Date of birth (cannot be in the future)');
  if (!/^\d{11}$/.test(a.Mobile || '')) m[1].push('Mobile number (11 digits)');
  if (!EMAIL_RE.test(a.Email || '')) m[1].push('Valid email address');
  if (a.HasCase === 'Opo') need(1, 'CaseDetails', 'Explain the case or complaint');
  need(2, 'Choice1', '1st choice school');
  const ch = [a.Choice1, a.Choice2, a.Choice3].map(s => String(s || '').trim().toLowerCase()).filter(Boolean);
  if (ch.length !== new Set(ch).size) m[2].push('Each school choice must be different');
  const el = tlJ_(a.ElemJSON, []);
  [3, 4, 5].forEach(i => { const r = el[i] || {}; if (!r.school) m[3].push('Grade ' + (i + 1) + ': school'); if (!r.location) m[3].push('Grade ' + (i + 1) + ': location'); });
  ['Father', 'Mother'].forEach(p => {
    if (!a[p + 'Status']) { m[4].push(p + ': alive or deceased'); return; }
    if (a[p + 'Status'] !== 'Alive') return;
    [['Name', 'full name'], ['Address', 'address'], ['Occupation', 'occupation'], ['Workplace', 'place of work'], ['Education', 'education'], ['Income', 'monthly income']].forEach(x => need(4, p + x[0], p + ': ' + x[1]));
    if (!/^\d{11}$/.test(a[p + 'Contact'] || '')) m[4].push(p + ': contact number (11 digits)');
  });
  if (a.FatherStatus === 'Deceased' && a.MotherStatus === 'Deceased') m[4].push('At least one living parent is needed (see your guardian with the Admission Office)');
  need(5, 'Housing', 'Housing'); need(5, 'ElectricBill', 'Electric bill'); need(5, 'WaterBill', 'Water bill'); need(5, 'TlcRelative', 'TLC beneficiary in the family');
  if (a.Housing === 'Others') need(5, 'HousingOther', 'Describe your housing');
  if (a.Housing === 'Renting') need(5, 'MonthlyRent', 'Monthly rent');
  if (!(parseInt(a.FamilySize, 10) >= 1)) m[5].push('Number of family members');
  tlJ_(a.SiblingsJSON, []).forEach((r, i) => { if (!r.name) m[5].push('Sibling ' + (i + 1) + ': name'); if (!r.age) m[5].push('Sibling ' + (i + 1) + ': age'); });
  if (a.AppAgree !== '1') m[6].push('Applicant\u2019s certification'); need(6, 'AppSignName', 'Applicant\u2019s full name (signature)');
  need(6, 'ParentName', 'Parent / guardian name'); need(6, 'ParentRelation', 'Parent / guardian relationship');
  if (a.ParentAgree !== '1') m[6].push('Parent / guardian consent'); need(6, 'ParentSignName', 'Parent / guardian full name (signature)');
  return m;
}
/** Not blockers: things the Admission Office will look at. */
function tlWarnings_(a) {
  const w = [];
  if ((parseInt(a.ResidencyYears, 10) || 0) < 3 && String(a.ResidencyYears || '') !== '') w.push('The program requires at least 3 years of residency in Taguig for the applicant and one parent.');
  if (![a.Choice1, a.Choice2, a.Choice3].some(s => /moreh/i.test(String(s || '')))) w.push('Moreh Academy is not one of your three choices, so this office may not be able to process your application.');
  return w;
}
const tlLocked_ = (a, s) => TLC_EDITABLE.indexOf(a.Status || '') < 0 || (!!s && s.EnrollStatus === 'Enrolled' && !a.CreatedAt);   // an enrolled learner with no application cannot start one

function tlDocs_(a) {
  const st = tlJ_(a.DocJSON, {}), prep = String(a.DocsPrepared || '').split(',');
  return TLC_DOCS.map(d => { const x = st[d.k] || {}; return { k: d.k, t: d.t, h: d.h, o: d.o ? 1 : 0, s: x.s || '', d: x.d || '', n: x.n || '', prepared: prep.indexOf(d.k) >= 0 }; });
}
/** Application as sent to the browser. */
function tlAppView_(a, s) {
  const miss = tlMissing_(a), done = miss.map(x => x.length === 0), docs = tlDocs_(a);
  const req = docs.filter(d => !d.o), got = req.filter(d => d.s === 'Received' || d.s === 'Verified').length;
  return { app: a, miss: miss, stepDone: done, progress: Math.round(done.filter(Boolean).length / done.length * 100), warnings: tlWarnings_(a), docs: docs, docsDone: got, docsTotal: req.length,
    editable: !tlLocked_(a, s), status: a.Status || 'Draft' };
}

/** The signed-in applicant's context. */
function tlApplicant_(token) {
  const u = who_(token); if (u.Role !== 'student') throw new Error('The TLC portal is for applicant accounts.');
  const hit = findRow_('S', 'StudentID', u.StudentID); if (!hit) throw new Error('Your application record was not found.');
  const s = hit.o, mine = tlFind_(u.StudentID);
  return { u: u, s: s, hit: mine, exists: !!mine, app: mine ? mine.o : tlPrefill_(s) };
}

/* ------------------------------ APPLICANT API ------------------------------ */

/** Everything the TLC Dashboard and the Application Form need, in one call. */
function tlcPortal(token) {
  try {
    const c = tlApplicant_(token), cfg = tlCfg_(), today = tlToday_(), st = tlState_(cfg, today);
    const v = tlAppView_(c.app, c.s), notices = tlNotices_(false), ups = c.exists ? tlUpdates_(c.s.StudentID) : [];
    return ok(Object.assign(v, {
      exists: c.exists, state: st, today: today, sy: c.app.SchoolYear || activeSY_(),
      schedule: tlSchedule_(cfg, today), partners: cfg.partners, contact: cfg.contact, info: tlInfo_(), notices: notices, updates: ups,
      student: { name: tlName_(c.s), grade: c.s.GradeLevel || '', enrollStatus: c.s.EnrollStatus || 'Not Enrolled', appRef: c.s.AppRef || c.s.StudentID, hasConsent: !!c.s.ConsentAt },
      gradeOk: c.s.GradeLevel === 'Grade 7'
    }));
  } catch (e) { return fail(e); }
}

/** Saves the form as a draft. Safe to call as often as needed. */
function tlcSave(token, rec) {
  const lock = LockService.getScriptLock(); let out;
  try {
    const c0 = tlApplicant_(token); lock.waitLock(20000);
    const c = tlApplicant_(token);
    if (c.s.EnrollStatus === 'Enrolled' && !c.exists) throw new Error('You are already enrolled. The TLC application is for applicants who are not yet enrolled.');
    if (c.exists && TLC_EDITABLE.indexOf(c.app.Status || '') < 0) throw new Error('Your application is ' + c.app.Status + ' and can no longer be edited.');
    const a = tlClean_(rec || {}, c.app); a.StudentID = c.s.StudentID; a.LRN = c.s.LRN || a.LRN; a.SchoolYear = a.SchoolYear || c.s.SchoolYear || activeSY_(); a.Status = a.Status || 'Draft';
    a.UpdatedAt = tlNow_(); if (!c.exists) a.CreatedAt = a.UpdatedAt;
    if (c.exists) tlWrite_(c.hit.r, a); else { const sh = tlApps_(); tlWrite_(sh.getLastRow() + 1, a); }
    out = tlAppView_(a, c.s);
  } catch (e) { return fail(e); } finally { try { lock.releaseLock(); } catch (_) {} }
  return ok(out, 'Draft saved.');
}

/** Saves, checks everything and submits. Draft -> Submitted, or For Compliance -> Under Review (re-submission). */
function tlcSubmit(token, rec) {
  const lock = LockService.getScriptLock(); let out, a, c, resub, actor;
  try {
    tlApplicant_(token); lock.waitLock(20000);
    c = tlApplicant_(token); actor = c.u.FullName || c.u.Username;
    if (c.s.EnrollStatus === 'Enrolled') throw new Error('You are already enrolled. The TLC application is for applicants who are not yet enrolled.');
    if (c.exists && TLC_EDITABLE.indexOf(c.app.Status || '') < 0) throw new Error('Your application was already submitted (' + c.app.Status + ').');
    const st = tlState_(tlCfg_(), tlToday_());
    if (!st.canSubmit) throw new Error('Submissions are not open: ' + st.label + '. Your draft is saved.');
    if (c.s.GradeLevel !== 'Grade 7') throw new Error('The TLC Scholarship is for incoming Grade 7 students. Set your grade level to Grade 7 in the Enrollment Form first.');
    a = tlClean_(rec || {}, c.app); a.StudentID = c.s.StudentID; a.LRN = c.s.LRN || a.LRN; a.SchoolYear = a.SchoolYear || c.s.SchoolYear || activeSY_();
    const miss = tlMissing_(a), first = miss.findIndex(x => x.length);
    if (first >= 0) { a.Status = c.exists ? a.Status : 'Draft'; a.UpdatedAt = tlNow_(); if (!c.exists) a.CreatedAt = a.UpdatedAt; if (c.exists) tlWrite_(c.hit.r, a); else tlWrite_(tlApps_().getLastRow() + 1, a);
      throw new Error('Please complete: ' + miss[first].slice(0, 4).join(', ') + (miss[first].length > 4 ? '\u2026' : '') + ' (step ' + (first + 1) + ').'); }
    resub = (c.app.Status || '') === 'For Compliance';
    const now = tlNow_(); a.UpdatedAt = now; if (!c.exists) a.CreatedAt = now;
    a.Status = resub ? 'Under Review' : 'Submitted'; a.SubmittedAt = a.SubmittedAt || now;
    if (!a.TlcRef) a.TlcRef = tlNextRef_(a.SchoolYear);
    if (c.exists) tlWrite_(c.hit.r, a); else tlWrite_(tlApps_().getLastRow() + 1, a);
    out = tlAppView_(a, c.s);
  } catch (e) { return fail(e); } finally { try { lock.releaseLock(); } catch (_) {} }
  tlLog_(a.StudentID, actor, resub ? 'Application re-submitted' : 'Application submitted', 'Reference ' + a.TlcRef + '. Bring your documents to the Admission Office.', true);
  audit_(c.u, 'tlc.submit', a.StudentID, a.TlcRef);
  notify_(c.s, 'TLC application received', 'We received your TLC Scholarship application. Your reference number is ' + a.TlcRef + '.\n\nNext: print your signed Student Application Form and bring it with the other documents to the Admission Office. You can follow the status of your application and the document checklist in the TLC dashboard of the portal.');
  return ok(out, 'Your TLC application was submitted. Reference ' + a.TlcRef + '.');
}

/** TLC-<year>-<4 digits>, unique per school year. */
function tlNextRef_(sy) {
  const y = String(sy || activeSY_()).slice(0, 4), p = 'TLCAPP-' + y + '-'; let max = 0;
  tlAll_().forEach(r => { if (String(r.TlcRef).indexOf(p) === 0) max = Math.max(max, parseInt(String(r.TlcRef).slice(p.length), 10) || 0); });
  return p + String(max + 1).padStart(4, '0');
}

/** The applicant's own "I have this ready" tick. The Admission Office's receipt status is separate. */
function tlcDocPrepared(token, key, on) {
  const lock = LockService.getScriptLock(); let out;
  try {
    tlApplicant_(token); lock.waitLock(15000);
    const c = tlApplicant_(token); if (!TLC_DOCS.some(d => d.k === key)) throw new Error('Unknown document.');
    const a = Object.assign({}, c.app), cur = String(a.DocsPrepared || '').split(',').filter(Boolean).filter(k => k !== key);
    if (on) cur.push(key); a.DocsPrepared = cur.join(','); a.UpdatedAt = tlNow_(); if (!c.exists) a.CreatedAt = a.UpdatedAt;
    if (c.exists) tlWrite_(c.hit.r, a); else tlWrite_(tlApps_().getLastRow() + 1, a);
    out = tlDocs_(a);
  } catch (e) { return fail(e); } finally { try { lock.releaseLock(); } catch (_) {} }
  return ok(out);
}

/* ------------------------------ STAFF API ------------------------------ */
const tlStaff_ = token => { const u = who_(token, 'admin'); if (u.Role !== 'admin') throw new Error('Not allowed.'); return u; };

/** Applications list + settings + notices for the staff page. */
function tlcAdminBootstrap(token) {
  try {
    const u = tlStaff_(token), cfg = tlCfg_(), rows = tlAll_(), counts = { All: rows.length };
    TLC_STATUSES.forEach(s => counts[s] = 0); rows.forEach(r => { counts[r.Status || 'Draft'] = (counts[r.Status || 'Draft'] || 0) + 1; });
    const list = rows.sort((x, y) => String(y.SubmittedAt || y.UpdatedAt).localeCompare(String(x.SubmittedAt || x.UpdatedAt))).slice(0, 600).map(r => {
      const d = tlDocs_(r), req = d.filter(x => !x.o);
      return { StudentID: r.StudentID, TlcRef: r.TlcRef, Name: tlName_(r), LRN: r.LRN, Barangay: r.Barangay, Status: r.Status || 'Draft', SubmittedAt: r.SubmittedAt, UpdatedAt: r.UpdatedAt,
        Choice1: r.Choice1, Choice2: r.Choice2, Choice3: r.Choice3, Mobile: r.Mobile, DocsDone: req.filter(x => x.s === 'Received' || x.s === 'Verified').length, DocsTotal: req.length };
    });
    return ok({ counts: counts, rows: list, cfg: cfg, notices: tlNotices_(true), canEdit: isFull_(u), statuses: TLC_STATUSES, flow: TLC_FLOW, state: tlState_(cfg, tlToday_()) });
  } catch (e) { return fail(e); }
}

function tlcAdminGet(token, id) {
  try {
    tlStaff_(token); const hit = tlFind_(id); if (!hit) throw new Error('Application not found.');
    const sh = findRow_('S', 'StudentID', id), s = sh ? sh.o : {}, v = tlAppView_(hit.o, s);
    const log = tlSheet_(TLC_LOG_SHEET, ['At', 'Actor', 'StudentID', 'Event', 'Detail', 'Visible']); let hist = [];
    if (log.getLastRow() >= 2) hist = log.getRange(2, 1, log.getLastRow() - 1, 6).getValues().filter(r => String(r[2]) === String(id)).map(r => ({ at: String(r[0]), by: String(r[1]), ev: String(r[3]), d: String(r[4]) })).reverse().slice(0, 30);
    return ok(Object.assign(v, { history: hist, student: { name: tlName_(s), grade: s.GradeLevel || '', enrollStatus: s.EnrollStatus || '', appRef: s.AppRef || '' }, allowed: TLC_FLOW[hit.o.Status || 'Draft'] || [] }));
  } catch (e) { return fail(e); }
}

function tlcAdminStatus(token, id, status, note) {
  const lock = LockService.getScriptLock(); let u, a, old, neu, s;
  try {
    u = tlStaff_(token); neu = String(status || ''); note = tlClip_(note, 300);
    if (TLC_STATUSES.indexOf(neu) < 1) throw new Error('Unknown status.');
    lock.waitLock(15000);
    const hit = tlFind_(id); if (!hit) throw new Error('Application not found.');
    a = hit.o; old = a.Status || 'Draft';
    if (old === 'Draft') throw new Error('The applicant has not submitted the form yet.');
    if (old === neu) return ok({ Status: neu }, 'No change.');
    if ((TLC_FLOW[old] || []).indexOf(neu) < 0) throw new Error('An application cannot move from ' + old + ' to ' + neu + '. Next: ' + ((TLC_FLOW[old] || []).join(' or ') || 'none') + '.');
    if (TLC_NOTE_REQUIRED.indexOf(neu) >= 0 && !note) throw new Error('Enter a note for the applicant (what is missing or why).');
    a.Status = neu; a.ReviewedAt = tlNow_(); a.ReviewedBy = u.FullName || u.Username; a.ReviewNote = note; a.UpdatedAt = a.ReviewedAt;
    tlWrite_(hit.r, a);
    const sr = findRow_('S', 'StudentID', id); s = sr ? sr.o : null;
  } catch (e) { return fail(e); } finally { try { lock.releaseLock(); } catch (_) {} }
  const msg = {
    'Under Review': 'The Admission Office is now reviewing your TLC application.',
    'For Compliance': 'Your TLC application needs your attention. ' + note + ' Please update your form and submit it again.',
    'Endorsed': 'Your application is complete and was endorsed to the TLC Office for final evaluation. Results will be announced here.',
    'Approved': 'Congratulations! Your TLC Scholarship application was approved.' + (note ? ' ' + note : ''),
    'Declined': 'Your TLC Scholarship application was not approved. ' + note
  }[neu];
  tlLog_(id, u.FullName || u.Username, 'Status: ' + neu, msg, true);
  audit_(u, 'tlc.status', id, old + ' -> ' + neu);
  if (s) notify_(s, 'TLC application update: ' + neu, msg + '\n\nReference ' + (a.TlcRef || '') + '.');
  return ok({ Status: neu, Previous: old }, 'Status saved: ' + neu + '.');
}

function tlcAdminDoc(token, id, key, status, note) {
  const lock = LockService.getScriptLock(); let u, a, s, d;
  try {
    u = tlStaff_(token); status = String(status || ''); note = tlClip_(note, 200);
    if (!TLC_DOCS.some(x => x.k === key)) throw new Error('Unknown document.');
    if (TLC_DOC_STATUS.indexOf(status) < 0) throw new Error('Unknown document status.');
    if (status === 'Resubmit' && !note) throw new Error('Enter a note: what must be corrected or brought again.');
    lock.waitLock(15000);
    const hit = tlFind_(id); if (!hit) throw new Error('Application not found.');
    a = hit.o; const st = tlJ_(a.DocJSON, {});
    if (status) st[key] = { s: status, d: tlToday_(), n: note, by: u.FullName || u.Username }; else delete st[key];
    a.DocJSON = JSON.stringify(st); a.UpdatedAt = tlNow_(); tlWrite_(hit.r, a); d = TLC_DOCS.find(x => x.k === key);
    const sr = findRow_('S', 'StudentID', id); s = sr ? sr.o : null;
  } catch (e) { return fail(e); } finally { try { lock.releaseLock(); } catch (_) {} }
  const txt = status === 'Resubmit' ? d.t + ': please bring it again. ' + note : status ? d.t + ': ' + status.toLowerCase() + ' by the Admission Office.' + (note ? ' ' + note : '') : d.t + ': status cleared.';
  tlLog_(id, u.FullName || u.Username, 'Document ' + (status || 'cleared'), txt, !!status);
  if (s && status === 'Resubmit') notify_(s, 'TLC document needs attention', txt);
  return ok(tlDocs_(a));
}

/** CSV of every application (staff only). */
function tlcAdminExport(token) {
  try {
    tlStaff_(token);
    const head = ['Reference', 'Status', 'Surname', 'First name', 'Middle name', 'LRN', 'Sex', 'Birthdate', 'Barangay', 'Mobile', 'Email', '1st choice', '2nd choice', '3rd choice', 'Father', 'Mother', 'Family size', 'Submitted'].concat(TLC_DOCS.map(d => d.t));
    const rows = tlAll_().map(r => { const dj = tlJ_(r.DocJSON, {}); return [r.TlcRef, r.Status || 'Draft', r.Surname, r.FirstName, r.MiddleName, r.LRN, r.Sex, r.Birthdate, r.Barangay, r.Mobile, r.Email, r.Choice1, r.Choice2, r.Choice3, r.FatherName, r.MotherName, r.FamilySize, r.SubmittedAt]
      .concat(TLC_DOCS.map(d => (dj[d.k] && dj[d.k].s) || '')); });
    const csv = [head].concat(rows).map(r => r.map(c => '"' + tlSafeCell_(c).replace(/"/g, '""') + '"').join(',')).join('\r\n');
    return ok({ csv: csv, name: 'TLC-Applications-' + tlToday_() + '.csv' });
  } catch (e) { return fail(e); }
}

/* ---- administrator / system manager only ---- */
function tlcAdminSaveSettings(token, cfg) {
  const lock = LockService.getScriptLock();
  try {
    const u = owner_(token); cfg = cfg || {};
    const open = String(cfg.openDate || ''), dl = String(cfg.deadline || '');
    if (open && !tlIsDate_(open)) throw new Error('The opening date is not a valid date.');
    if (dl && !tlIsDate_(dl)) throw new Error('The deadline is not a valid date.');
    if (open && dl && dl < open) throw new Error('The deadline cannot be before the opening date.');
    const ms = (Array.isArray(cfg.milestones) ? cfg.milestones : []).slice(0, 12).map(m => ({ title: tlClip_(m.title, 100), start: tlIsDate_(m.start) ? m.start : '', end: tlIsDate_(m.end) ? m.end : '', note: tlClip_(m.note, 200) })).filter(m => m.title);
    ms.forEach(m => { if (m.start && m.end && m.end < m.start) throw new Error('"' + m.title + '": the end date is before the start date.'); });
    const partners = (Array.isArray(cfg.partners) ? cfg.partners : []).map(s => tlClip_(s, 100)).filter(Boolean).slice(0, 60);
    const out = { accepting: cfg.accepting === '0' ? '0' : '1', openDate: open, deadline: dl, milestones: JSON.stringify(ms), partners: JSON.stringify(partners), contact: tlClip_(cfg.contact, 400) };
    lock.waitLock(15000);
    const sh = tlSheet_(TLC_SET_SHEET, ['Key', 'Value', 'UpdatedAt', 'UpdatedBy']), now = tlNow_();
    if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 4).clearContent();
    put_(sh, 2, 1, Object.keys(out).map(k => [k, out[k], now, u.Username]));
    audit_(u, 'tlc.settings', '', 'open ' + open + ' deadline ' + dl + ' accepting ' + out.accepting);
    try { CacheService.getScriptCache().remove('pubsch_v1'); } catch (_) {}
    return ok(tlCfg_(), 'TLC settings saved.');
  } catch (e) { return fail(e); } finally { try { lock.releaseLock(); } catch (_) {} }
}

function tlcAdminNoticeSave(token, n) {
  const lock = LockService.getScriptLock();
  try {
    const u = owner_(token); n = n || {};
    const title = tlClip_(n.title, 120), msg = tlClip_(n.msg, 800), type = ['Info', 'Reminder', 'Urgent'].indexOf(n.type) >= 0 ? n.type : 'Info', until = tlIsDate_(n.until) ? n.until : '';
    if (!title || !msg) throw new Error('Enter a title and a message.');
    lock.waitLock(15000);
    const sh = tlSheet_(TLC_NOTICE_SHEET, ['ID', 'PostedAt', 'PostedBy', 'Type', 'Title', 'Message', 'ExpiresOn', 'Pinned']);
    put_(sh, sh.getLastRow() + 1, 1, [[Utilities.getUuid().slice(0, 8), tlNow_(), u.FullName || u.Username, type, title, msg, until, n.pinned ? '1' : '']]);
    return ok(tlNotices_(true), 'Notice posted.');
  } catch (e) { return fail(e); } finally { try { lock.releaseLock(); } catch (_) {} }
}

function tlcAdminNoticeDelete(token, id) {
  const lock = LockService.getScriptLock();
  try {
    owner_(token); lock.waitLock(15000);
    const sh = tlSheet_(TLC_NOTICE_SHEET, ['ID', 'PostedAt', 'PostedBy', 'Type', 'Title', 'Message', 'ExpiresOn', 'Pinned']), n = sh.getLastRow() - 1;
    if (n >= 1) { const i = sh.getRange(2, 1, n, 1).getValues().flat().map(String).indexOf(String(id)); if (i >= 0) sh.deleteRow(i + 2); }
    return ok(tlNotices_(true), 'Notice removed.');
  } catch (e) { return fail(e); } finally { try { lock.releaseLock(); } catch (_) {} }
}

/* ------------------------------ PUBLIC (homepage) ------------------------------ */
// [key, name, short description, levels, source]  Same four programs as the Scholarships editor in the portal.
const PUB_SCH_META_ = [
  ['TLC', 'TLC Scholarship', 'Taguig City Government scholarship for public elementary graduates.', 'Grade 7 \u2013 12', 'City Government of Taguig'],
  ['ESC', 'ESC Program', 'DepEd\u2013PEAC Education Service Contracting subsidy for private junior high school.', 'Grade 7 \u2013 12', 'DepEd \u00b7 PEAC'],
  ['QVR', 'SHS Voucher \u2013 QVR', 'Automatic senior high voucher for public school Grade 10 completers.', 'Grade 11 \u2013 12', 'DepEd \u00b7 PEAC'],
  ['QVA', 'SHS Voucher \u2013 QVA', 'OVAP-based voucher for private school, ALS and PEPT completers.', 'Grade 11 \u2013 12', 'DepEd \u00b7 PEAC']
];
/** PUBLIC. The four scholarship programs (text from the portal's Scholarships editor, else the built-in default) and the TLC application window. No personal data. */
function getPublicScholarships() {
  try {
    const cache = CacheService.getScriptCache(), hit = cache.get('pubsch_v1');
    if (hit) return ok(JSON.parse(hit));
    const sh = schSh_(), saved = {};
    if (sh.getLastRow() >= 2) sh.getRange(2, 1, sh.getLastRow() - 1, 4).getValues().forEach(r => { const k = String(r[0]); (saved[k] = saved[k] || []).push({ o: parseInt(r[1], 10) || 0, title: String(r[2]), items: String(r[3]) }); });
    const programs = PUB_SCH_META_.map(m => {
      let secs = (saved[m[0]] || []).sort((a, b) => a.o - b.o);
      if (!secs.length) secs = ((typeof SCH_DEFAULT !== 'undefined' && SCH_DEFAULT[m[0]]) || []).map(s => ({ title: s[0], items: s[1] }));
      return { key: m[0], name: m[1], desc: m[2], level: m[3], source: m[4], sections: secs.map(s => ({ title: s.title, items: String(s.items).split('\n').map(x => x.trim()).filter(Boolean) })) };
    });
    const cfg = tlCfg_(), st = tlState_(cfg, tlToday_()), out = { programs: programs, tlc: { state: st.key, label: st.label, openDate: cfg.openDate, deadline: cfg.deadline } };
    try { cache.put('pubsch_v1', JSON.stringify(out), 120); } catch (_) {}
    return ok(out);
  } catch (e) { return fail(e); }
}