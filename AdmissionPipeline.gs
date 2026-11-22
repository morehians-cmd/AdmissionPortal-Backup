/**
 * AdmissionPipeline.gs — application lifecycle, Admission ID and the enrollee → enrolled hand-off.
 *
 * ENROLLMENT PROCESS (v3)
 *   1. Registration creates an ENROLLEE account. ApplicationStatus = Draft.
 *   2. The enrollee fills in the Online Enrollment Form and submits it         → Submitted
 *   3. Admissions puts it under review                                          → Under Review
 *   4. Admissions approves it → Admission ID issued (MA-<year>-<10 random>)     → Approved
 *   5. The enrollee prints the enrollment form + parent consent form and brings the INITIAL requirements.
 *   6. Admissions records them (Admission Operations → learner → Requirements), then "Complete enrollment"
 *      (or sets Enrollment Status = Enrolled) → EnrollStatus = Enrolled; a section may now be assigned.
 *   7. COMPLETION requirements are recorded later, whenever the learner submits them.
 *
 * Legacy records (blank ApplicationStatus, or Classification = Old) are never held to this flow.
 *
 * Additive only:
 *   • ONE auto column, ApplicationStatus, appended LAST to FIELDS in Code.gs
 *     (sh_('S') grows the Students sheet and rewrites its header row from COLS automatically).
 *   • ONE new tab, "Application Status Log" — Old AP's "Status Log" tab is untouched.
 *   • Three browser-facing functions; no existing Old AP function is replaced.
 *
 * Legacy records keep a blank ApplicationStatus column; appStatusOf_() derives a display
 * value from EnrollStatus and never writes that derivation back to the sheet.
 */

const APP_PIPE = {
  STATUSES: ['Submitted', 'Under Review', 'Approved', 'Declined'],     // the stages staff work with (Draft is the enrollee's own, not on the board)
  FLOW: { 'Submitted':['Under Review', 'Declined'], 'Under Review':['Approved', 'Declined'], 'Approved':['Declined'], 'Declined':['Under Review'] },
  COLUMN: 'ApplicationStatus',
  LOG_SHEET: 'Application Status Log',
  LOG_HEADERS: ['At', 'Actor', 'StudentID', 'OldStatus', 'NewStatus', 'OldEnrollStatus', 'NewEnrollStatus', 'Reason']
};

function appLogSh_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(APP_PIPE.LOG_SHEET);
  if (!sh) {
    sh = ss.insertSheet(APP_PIPE.LOG_SHEET);
    sh.getRange(1, 1, 1, APP_PIPE.LOG_HEADERS.length).setValues([APP_PIPE.LOG_HEADERS]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.getRange(1, 1, sh.getMaxRows(), APP_PIPE.LOG_HEADERS.length).setNumberFormat('@');
  }
  return sh;
}

/** Effective status for display and grouping. Read-only: never persists a derived value. */
function appStatusOf_(r) {
  const v = String((r && r.ApplicationStatus) || '').trim();
  if (v === 'Draft' || APP_PIPE.STATUSES.indexOf(v) >= 0) return v;
  const e = String((r && r.EnrollStatus) || '');
  if (e === 'Enrolled') return 'Approved';
  if (e === 'Cancelled' || e === 'Transferred Out') return 'Declined';
  return 'Submitted';
}

/**
 * ONE-TIME owner action. The column is created by sh_('S') on its own; this verifies it,
 * re-writes the header row from COLS and formats the new column as text.
 * Existing columns are never moved or re-written with data.
 */
function migrateApplicationStatus() {
  ownerOnly_();
  const sh = sh_('S'), col = COLS.indexOf(APP_PIPE.COLUMN) + 1;
  if (!col) throw new Error('ApplicationStatus is not part of COLS. Add it to FIELDS first.');
  if (sh.getMaxColumns() < COLS.length) sh.insertColumnsAfter(sh.getMaxColumns(), COLS.length - sh.getMaxColumns());
  sh.getRange(1, col, sh.getMaxRows(), 1).setNumberFormat('@');
  sh.getRange(1, 1, 1, COLS.length).setValues([COLS]).setFontWeight('bold');
  SpreadsheetApp.flush();
  Logger.log('ApplicationStatus ready at column ' + col + ' of ' + COLS.length + '.');
  return { success: true, message: 'ApplicationStatus column ready at position ' + col + '.', data: { column: col, totalColumns: COLS.length } };
}

const ADM_ALPHA_ = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // 32 characters: letters and digits, without the look-alikes 0 O 1 I

/** True when this record follows the enrollee flow. Blank status (legacy) and returning learners (Old) never do. */
function isNewFlow_(r) {
  const v = String((r && r.ApplicationStatus) || '').trim();
  return (v === 'Draft' || APP_PIPE.STATUSES.indexOf(v) >= 0) && String((r && r.Classification) || '') !== 'Old';
}

/** The enrollee's own form is read-only from Submitted until they are enrolled (or when declined). */
function appLocked_(r) {
  return isNewFlow_(r) && appStatusOf_(r) !== 'Draft' && r.EnrollStatus !== 'Enrolled' && r.EnrollStatus !== 'Temporary';
}

const fieldLabel_ = k => (FIELDS.find(f => f[1] === k) || [0, 0, k])[2];
const isDone_ = v => !!v && v !== 'None';

/** Labels of the requirements of one stage ('initial' | 'completion') that the office has not recorded yet. */
function reqMissing_(row, stage) {
  return (reqPlan_(row)[stage] || []).filter(k => !isDone_(row[k])).map(fieldLabel_);
}

/** Throws unless this enrollee may be marked Enrolled. Does nothing for legacy / returning records. */
function enrollGate_(row) {
  if (!isNewFlow_(row)) return;
  const st = appStatusOf_(row);
  if (st !== 'Approved') throw new Error('Cannot mark as Enrolled: the application is "' + st + '". It must be Approved first.');
  const miss = reqMissing_(row, 'initial');
  if (miss.length) throw new Error('Cannot mark as Enrolled: the initial requirements are not all recorded yet (' + miss.join(', ') + ').');
}

/** Fields an enrollee must have filled in before the Online Enrollment Form can be submitted. */
function appMissing_(r) {
  const need = ['Surname', 'FirstName', 'LRN', 'Birthdate', 'BirthPlace', 'SexualOrient', 'Religion', 'GradeLevel', 'AddressLine1', 'Barangay', 'City', 'Mobile', 'Email',
    'EmName', 'EmRelation', 'EmMobile', 'LivingWith'];
  const miss = need.filter(k => !String(r[k] || '').trim()).map(fieldLabel_);
  if (!String(r.FatherName || '').trim() && !String(r.MotherName || '').trim() && !String(r.GuardName || '').trim()) miss.push('Parent / Guardian name');
  const i = GRADES.indexOf(r.GradeLevel);
  if (i >= 2 && !String(r.PrevSchool || '').trim()) miss.push('Previous school name');   // Nursery / Kinder 1 have no previous school
  if (r.GradeLevel === 'Grade 11' || r.GradeLevel === 'Grade 12') { if (!String(r.Cluster || '').trim()) miss.push('Cluster'); }
  return miss;
}

/** A fresh Admission ID: MA-<year issued>-<10 random letters/digits>. `taken` is a set of IDs already in use. */
function newAdmissionId_(taken) {
  const yr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy');
  for (let t = 0; t < 25; t++) {
    const b = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid() + '|' + Date.now() + '|' + Math.random());
    let x = ''; for (let i = 0; i < 10; i++) x += ADM_ALPHA_.charAt((b[i] & 255) % ADM_ALPHA_.length);   // 256 / 32 is exact: no modulo bias
    const id = 'MA-' + yr + '-' + x;
    if (!taken[id]) return id;
  }
  throw new Error('Could not generate a unique Admission ID. Please try again.');
}
const admTaken_ = () => { const t = {}; colVals_('AdmissionID').forEach(v => { if (v) t[v] = 1; }); return t; };

/** Writes {field: value} cells of one Students row, one cell each (no other column is touched). */
function setCells_(sh, r, obj) {
  Object.keys(obj).forEach(k => { const c = COLS.indexOf(k) + 1; if (!c) throw new Error('Column ' + k + ' is missing. Reload the project (new fields were added to Code.gs).'); put_(sh, r, c, [[obj[k]]]); });
}
const nowStr_ = () => Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
function appLogAdd_(who, id, old, neu, enr, why) {
  const log = appLogSh_();
  put_(log, log.getLastRow() + 1, 1, [[nowStr_(), who, id, old, neu, enr || '', enr || '', why || '']]);
}

/**
 * ENROLLEE: submits the Online Enrollment Form. Draft -> Submitted. The form becomes read-only for the enrollee.
 */
function enrolleeSubmitApplication(token) {
  const lock = LockService.getScriptLock(); let u, row, id;
  try {
    u = who_(token);
    if (u.Role !== 'student') throw new Error('Only an enrollee can submit an application.');
    lock.waitLock(20000);
    const hit = findRow_('S', 'StudentID', u.StudentID);
    if (!hit) throw new Error('Application record not found.');
    row = hit.o; id = row.StudentID;
    if (!isNewFlow_(row)) throw new Error('This record does not need an application submission.');
    if (appStatusOf_(row) !== 'Draft') throw new Error('Your application was already submitted.');
    const miss = appMissing_(row);
    if (miss.length) throw new Error('Please complete these required items in your Online Enrollment Form first: ' + miss.join(', ') + '.');
    if (!String(row.ConsentAt || '').trim()) throw new Error('The Data Privacy consent is missing. Please contact the Admission Office.');
    const at = nowStr_(); row.ApplicationStatus = 'Submitted'; row.AppSubmittedAt = at;
    setCells_(sh_('S'), hit.r, { ApplicationStatus: 'Submitted', AppSubmittedAt: at });
    appLogAdd_(row.FullName || id, id, 'Draft', 'Submitted', row.EnrollStatus, 'Submitted by the enrollee');
  } catch (e) { return fail(e); } finally { try { lock.releaseLock(); } catch (_) {} }
  audit_(u, 'application.submit', id, '');
  notify_(row, 'Application received', 'We received your Online Enrollment Form. The Admission Office will review it and email you once there is an update. You cannot edit the form while it is under review.');
  return ok({ StudentID: id, ApplicationStatus: 'Submitted' }, 'Your application was submitted for review.');
}

/**
 * STAFF: moves an application along the review stages. Approving issues the Admission ID (once; it is never re-issued).
 * Allowed: Submitted -> Under Review | Declined, Under Review -> Approved | Declined, Approved -> Declined, Declined -> Under Review.
 */
function admissionApplicationStatusSet(token, studentId, status, reason) {
  const lock = LockService.getScriptLock(); let u, row, id, old, neu;
  try {
    u = who_(token, 'admin');
    if (u.Role !== 'admin') throw new Error('Not allowed.');
    neu = String(status || '').trim();
    if (APP_PIPE.STATUSES.indexOf(neu) < 0) throw new Error('Unknown application status.');
    id = String(studentId || '').trim();
    const why = String(reason || '').trim().slice(0, 300);
    lock.waitLock(15000);
    const hit = findRow_('S', 'StudentID', id);
    if (!hit) throw new Error('Student record not found.');
    row = hit.o; old = appStatusOf_(row);
    if (old === neu) return ok({ StudentID: id, ApplicationStatus: neu, Previous: old, AdmissionID: row.AdmissionID || '' }, 'No change.');
    if (old === 'Draft') throw new Error('The enrollee has not submitted the Online Enrollment Form yet.');
    if (row.EnrollStatus === 'Enrolled') throw new Error('This learner is already enrolled. Use the enrollment status (cancel / transfer) instead of the application status.');
    if ((APP_PIPE.FLOW[old] || []).indexOf(neu) < 0) throw new Error('An application cannot move from ' + old + ' to ' + neu + '. Next step: ' + ((APP_PIPE.FLOW[old] || []).join(' or ') || 'none') + '.');
    if (neu === 'Declined' && !why) throw new Error('Enter a reason for declining the application.');

    const sh = sh_('S'), cells = { ApplicationStatus: neu };
    if (neu === 'Approved') {
      if (!row.AdmissionID) { cells.AdmissionID = newAdmissionId_(admTaken_()); row.AdmissionID = cells.AdmissionID; }
      cells.ApprovedAt = nowStr_();
    }
    setCells_(sh, hit.r, cells);
    row.ApplicationStatus = neu;
    appLogAdd_(u.FullName || u.Username || '', id, old, neu, row.EnrollStatus, why + (cells.AdmissionID ? (why ? ' | ' : '') + 'Admission ID ' + cells.AdmissionID : ''));
  } catch (e) { return fail(e); } finally { try { lock.releaseLock(); } catch (_) {} }
  if (!row || !neu || old === neu) return ok({ StudentID: id, ApplicationStatus: neu }, 'No change.');
  audit_(u, 'application.status', id, old + ' -> ' + neu + (neu === 'Approved' ? ' (' + row.AdmissionID + ')' : ''));
  if (neu === 'Under Review') notify_(row, 'Your application is under review', 'The Admission Office is now reviewing your Online Enrollment Form.');
  else if (neu === 'Approved') notify_(row, 'Your application is approved', 'Your Admission ID is ' + row.AdmissionID + '.\n\nNext steps:\n1. Sign in to the Enrollee Portal and print your Online Enrollment Form and the Parental Consent & Data Privacy Undertaking Form. Have them signed.\n2. Bring the printed forms and your initial requirements personally to the Admission Office.\n3. The Admission Office will check your documents and update your requirements list in the portal. Once processed, you are enrolled and a section will be assigned.\n4. Submit the remaining (completion) requirements when they become available.');
  else if (neu === 'Declined') notify_(row, 'Update on your application', 'We are unable to approve your application at this time.' + (reason ? '\n\nReason: ' + String(reason).trim().slice(0, 300) : '') + '\n\nPlease visit the Admission Office if you have questions.');
  return ok({ StudentID: id, ApplicationStatus: neu, Previous: old, AdmissionID: row.AdmissionID || '' }, neu === 'Approved' ? 'Approved. Admission ID ' + row.AdmissionID + ' issued.' : 'Application status saved.');
}

/**
 * STAFF: the enrollee's initial requirements have been received and verified -> Enrolled. A section can be assigned from now on.
 * Same result as setting Enrollment Status = Enrolled in the learner record (same checks), in one click.
 */
function admissionProcessEnrollment(token, studentId) {
  const lock = LockService.getScriptLock(); let u, row, id, old;
  try {
    u = who_(token, 'admin');
    if (u.Role !== 'admin') throw new Error('Not allowed.');
    id = String(studentId || '').trim();
    lock.waitLock(20000);
    const hit = findRow_('S', 'StudentID', id);
    if (!hit) throw new Error('Student record not found.');
    row = hit.o; old = row.EnrollStatus || 'Not Enrolled';
    if (old === 'Enrolled') return ok({ StudentID: id, EnrollStatus: 'Enrolled' }, 'Already enrolled.');
    if (old === 'Cancelled' || old === 'Transferred Out') throw new Error('This enrollment was ' + old.toLowerCase() + '. Re-open it from the learner record first.');
    enrollGate_(row);
    const h = holdsOf_(id); if (h.length) throw new Error('Cannot mark as Enrolled: active hold from ' + h.join(', ') + '. Clear the hold, or use "Allow temporary enrollment".');
    row.EnrollStatus = 'Enrolled'; stampAudit_(row, u);
    put_(sh_('S'), hit.r, 1, [COLS.map(c => row[c] || '')]);
  } catch (e) { return fail(e); } finally { try { lock.releaseLock(); } catch (_) {} }
  audit_(u, 'enrollment.process', id, old + ' -> Enrolled');
  logStatus_([logRow_(row, old, u)]);
  notify_(row, 'You are now enrolled', 'The Admission Office has processed your initial requirements and you are now enrolled. Your section will be assigned and posted in the portal. Please submit any remaining requirements once they are available.');
  return ok({ StudentID: id, EnrollStatus: 'Enrolled' }, 'Enrolled. A section can now be assigned.');
}

/** OWNER, run once from the editor (optional). Gives an Admission ID to every learner who is already Approved / Enrolled and has none. */
function backfillAdmissionIds() {
  ownerOnly_();
  const lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    const rows = rows_('S'), taken = admTaken_(), col = COLS.indexOf('AdmissionID') + 1; let n = 0;
    if (!col) throw new Error('AdmissionID is not part of COLS. Add it to FIELDS first.');
    const sh = sh_('S'), out = rows.map(r => {
      let v = r.AdmissionID || '';
      if (!v && (r.EnrollStatus === 'Enrolled' || appStatusOf_(r) === 'Approved') && r.StudentID) { v = newAdmissionId_(taken); taken[v] = 1; n++; }
      return [v];
    });
    if (rows.length) put_(sh, 2, col, out);
    Logger.log('Admission IDs issued: ' + n);
    return { success: true, message: n + ' Admission ID(s) issued.' };
  } finally { try { lock.releaseLock(); } catch (_) {} }
}

/** Board data for the Pipeline view. One read of the current school year's learners. Drafts are counted, not listed. */
function admissionPipelineData(token, query, limit) {
  try {
    const u = who_(token, 'admin'); if (u.Role !== 'admin') throw new Error('Not allowed.');
    const q = String(query || '').trim().toLowerCase();
    const max = Math.max(25, Math.min(parseInt(limit, 10) || 120, 400));

    let rows = rowsSY_();
    if (q) {
      rows = rows.filter(function (r) {
        return (String(r.FullName || '') + ' ' + String(r.LRN || '') + ' ' + String(r.StudentID || '') + ' ' + String(r.AdmissionID || '')).toLowerCase().indexOf(q) >= 0;
      });
    }
    rows.sort(function (a, b) { return String(b.CreatedAt || '').localeCompare(String(a.CreatedAt || '')); });

    const stages = APP_PIPE.STATUSES.map(function (s) { return { key: s, count: 0, cards: [] }; });
    const slot = {};
    stages.forEach(function (s, i) { slot[s.key] = i; });
    let drafts = 0;

    rows.forEach(function (r) {
      const st = appStatusOf_(r);
      if (st === 'Draft') { drafts++; return; }
      const col = stages[slot[st]];
      if (!col) return;
      col.count++;
      if (col.cards.length >= max) return;
      const flow = isNewFlow_(r), plan = flow ? reqPlan_(r) : null, enrolled = r.EnrollStatus === 'Enrolled';
      const iDone = plan ? plan.initial.filter(function (k) { return isDone_(r[k]); }).length : 0;
      col.cards.push({
        StudentID: r.StudentID || '',
        AdmissionID: r.AdmissionID || '',
        FullName: r.FullName || '',
        LRN: r.LRN || '',
        GradeLevel: r.GradeLevel || '',
        Section: r.Section || '',
        Category: r.Category || '',
        SchoolYear: r.SchoolYear || '',
        EnrollStatus: r.EnrollStatus || '',
        ApplicationStatus: st,
        CreatedAt: r.CreatedAt || '',
        Flow: flow ? '1' : '',
        Allowed: enrolled ? [] : (APP_PIPE.FLOW[st] || []),
        InitialDone: iDone,
        InitialTotal: plan ? plan.initial.length : 0,
        CanEnroll: flow && !enrolled && st === 'Approved' && iDone === plan.initial.length && r.EnrollStatus !== 'Cancelled' && r.EnrollStatus !== 'Transferred Out' ? '1' : ''
      });
    });

    return ok({ total: rows.length - drafts, drafts: drafts, stages: stages, statuses: APP_PIPE.STATUSES });
  } catch (e) { return fail(e); }
}