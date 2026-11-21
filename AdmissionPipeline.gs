/**
 * AdmissionPipeline.gs — merged from New AP: application-status lifecycle + status log.
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
  STATUSES: ['Submitted', 'Under Review', 'Approved', 'Declined'],
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
  if (APP_PIPE.STATUSES.indexOf(v) >= 0) return v;
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

/** Staff-only status change with a serialised write and an append-only log row. */
function admissionApplicationStatusSet(token, studentId, status, reason) {
  try {
    const u = who_(token, 'admin');
    const neu = String(status || '').trim();
    if (APP_PIPE.STATUSES.indexOf(neu) < 0) throw new Error('Unknown application status.');

    const id = String(studentId || '').trim();
    const hit = findRow_('S', 'StudentID', id);
    if (!hit) throw new Error('Student record not found.');

    const col = COLS.indexOf(APP_PIPE.COLUMN) + 1;
    if (!col) throw new Error('The ApplicationStatus column is missing. Run migrateApplicationStatus() once.');

    const old = appStatusOf_(hit.o);
    const why = String(reason || '').trim().slice(0, 300);
    if (old === neu) return ok({ StudentID: id, ApplicationStatus: neu, Previous: old }, 'No change.');
    if (neu === 'Declined' && !why) throw new Error('Enter a reason for declining the application.');

    const lock = LockService.getScriptLock();
    if (!lock.tryLock(15000)) throw new Error('The service is busy. Please try again.');
    try {
      put_(sh_('S'), hit.r, col, [[neu]]);
      const log = appLogSh_();
      put_(log, log.getLastRow() + 1, 1, [[
        Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss'),
        (u.FullName || u.Username || ''), id, old, neu,
        hit.o.EnrollStatus || '', hit.o.EnrollStatus || '', why
      ]]);
    } finally {
      try { lock.releaseLock(); } catch (_) {}
    }

    audit_(u, 'application.status', id, old + ' -> ' + neu + (why ? ' (' + why + ')' : ''));
    return ok({ StudentID: id, ApplicationStatus: neu, Previous: old }, 'Application status saved.');
  } catch (e) { return fail(e); }
}

/** Board data for the Pipeline view. One read of the current school year's learners. */
function admissionPipelineData(token, query, limit) {
  try {
    who_(token, 'admin');
    const q = String(query || '').trim().toLowerCase();
    const max = Math.max(25, Math.min(parseInt(limit, 10) || 120, 400));

    let rows = rowsSY_();
    if (q) {
      rows = rows.filter(function (r) {
        return (String(r.FullName || '') + ' ' + String(r.LRN || '') + ' ' + String(r.StudentID || '')).toLowerCase().indexOf(q) >= 0;
      });
    }
    rows.sort(function (a, b) { return String(b.CreatedAt || '').localeCompare(String(a.CreatedAt || '')); });

    const stages = APP_PIPE.STATUSES.map(function (s) { return { key: s, count: 0, cards: [] }; });
    const slot = {};
    stages.forEach(function (s, i) { slot[s.key] = i; });

    rows.forEach(function (r) {
      const st = appStatusOf_(r), col = stages[slot[st]];
      if (!col) return;
      col.count++;
      if (col.cards.length >= max) return;
      col.cards.push({
        StudentID: r.StudentID || '',
        FullName: r.FullName || '',
        LRN: r.LRN || '',
        GradeLevel: r.GradeLevel || '',
        Section: r.Section || '',
        Category: r.Category || '',
        SchoolYear: r.SchoolYear || '',
        EnrollStatus: r.EnrollStatus || '',
        ApplicationStatus: st,
        CreatedAt: r.CreatedAt || ''
      });
    });

    return ok({ total: rows.length, stages: stages, statuses: APP_PIPE.STATUSES });
  } catch (e) { return fail(e); }
}
