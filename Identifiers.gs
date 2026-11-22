/*****************************************************************************
 MOREH ACADEMY PORTAL - IDENTIFIERS (add as a NEW file named "Identifiers")

 TWO IDENTIFIERS (same plain format for every learner, whatever the Category)
   PRIMARY    Permanent Student ID      MAT-2026-0001   MAT - school year (first year) - 4-digit sequence
              Assigned ONCE, at the moment an applicant becomes an officially Enrolled student. Never changes, never reused.
              The year is the starting year of the ACTIVE school year when it is issued (SY 2026-2027 -> MAT-2026-...).
              The sequence restarts at 0001 each year.
   SECONDARY  Enrollee Reference        ENR-2026-0001   ENR - school year - 4-digit sequence
              Assigned to every admission application or enrollment transaction when it is created
              (online registration, staff-encoded learner, and again for each yearly re-enrollment). Restarts at 0001 each year.
              (Numbers pass 9999 by simply getting longer: ENR-2026-10000.)

 HOW THEY ARE STORED
   Students sheet: two new columns appended at the END (AppRef = the ENR- reference, PermanentID = the MAT- ID). No existing column moves.
   Column A "StudentID" stays the learner's internal, never-changing record key (portal login, holds, history and logs all point to it).
   New records get their Enrollee Reference as that key, so a record's key is never renamed when the learner is enrolled.
   Older records keep their old key (for example 488011-2026-0001); they get a PermanentID / AppRef from backfillIdentifiers().
   The browser shows  PermanentID, else AppRef, else the old key  (see sidShow in Index.html).

 ONE-TIME SETUP (editor, owner only)
   1. Run backfillIdentifiers   - gives an ENR- reference to every record without one and a MAT- ID to every Enrolled learner.
   2. Deploy > Manage deployments > New version.
*****************************************************************************/

const APPREF_RE = /^ENR-(\d{4})-(\d{4,})$/;
const PERM_RE   = /^MAT-(\d{4})-(\d{4,})$/;

/** First year of a school year such as '2026-2027' (falls back to the active school year). */
const syYear_ = sy => { const y = String(sy || '').slice(0, 4); return /^\d{4}$/.test(y) ? y : activeSY_().slice(0, 4); };

/**
 * Returns a function sy -> next Enrollee Reference. `existing` = every AppRef already in use.
 * The counter lives in memory, so one call can hand out many references in a row (bulk re-enrollment).
 * The caller must hold the script lock.
 */
function appRefMaker_(existing) {
  const max = {};
  (existing || []).forEach(v => { const m = APPREF_RE.exec(String(v || '')); if (m) max[m[1]] = Math.max(max[m[1]] || 0, parseInt(m[2], 10)); });
  return sy => { const y = syYear_(sy); max[y] = (max[y] || 0) + 1; return 'ENR-' + y + '-' + String(max[y]).padStart(4, '0'); };
}
/** One Enrollee Reference (reads ONE column). Caller holds the script lock. */
const nextAppRef_ = sy => appRefMaker_(colVals_('AppRef'))(sy);
/** Keys for a brand-new record: the Enrollee Reference doubles as its permanent record key. */
const newKeys_ = sy => { const r = nextAppRef_(sy); return { StudentID: r, AppRef: r }; };

/**
 * Returns a function -> next Permanent Student ID (MAT-<year>-<4 digits>). The year is the STARTING year of the ACTIVE school year
 * at the moment of issue (not the learner's own school year, not the calendar year). Once issued, the ID never changes.
 * `existing` = every PermanentID already in use. The caller must hold the script lock.
 */
function permIdMaker_(existing) {
  const max = {};
  (existing || []).forEach(v => { const m = PERM_RE.exec(String(v || '')); if (m) max[m[1]] = Math.max(max[m[1]] || 0, parseInt(m[2], 10)); });
  return () => { const y = activeSY_().slice(0, 4); max[y] = (max[y] || 0) + 1; return 'MAT-' + y + '-' + String(max[y]).padStart(4, '0'); };
}
/** Gives `row` its Permanent Student ID if it has none (in memory only: the caller writes the row). Caller holds the script lock. */
function ensurePermId_(row) {
  if (!row.PermanentID) row.PermanentID = permIdMaker_(colVals_('PermanentID'))(row);
  return row.PermanentID;
}

/** What people see and quote: the Permanent Student ID once enrolled, otherwise the Enrollee Reference. */
const sidShow_ = r => (r && (r.PermanentID || r.AppRef || r.StudentID)) || '';
const sidLabel_ = r => (r && r.PermanentID) ? 'Student ID' : 'Enrollee Ref';

/**
 * OWNER ONLY, run from the editor (safe to run again).
 *   - every record without an Enrollee Reference gets one (oldest first, numbered per school year)
 *   - every Enrolled learner without a Permanent Student ID gets one (oldest first, numbered per school year)
 */
function backfillIdentifiers() {
  ownerOnly_();
  const lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    const sh = sh_('S'), rows = rows_('S'), aCol = COLS.indexOf('AppRef') + 1, pCol = COLS.indexOf('PermanentID') + 1;
    if (!aCol || !pCol) throw new Error('AppRef / PermanentID are not part of COLS. Update Code.gs first.');
    const order = rows.map((r, i) => i).sort((a, b) => String(rows[a].CreatedAt || '').localeCompare(String(rows[b].CreatedAt || '')) || a - b);
    const mkApp = appRefMaker_(rows.map(r => r.AppRef)), mkPerm = permIdMaker_(rows.map(r => r.PermanentID));
    let nA = 0, nP = 0;
    order.forEach(i => {
      const r = rows[i];
      if (!r.StudentID) return;
      if (!r.AppRef) { r.AppRef = mkApp(r.SchoolYear); nA++; }
      if (!r.PermanentID && r.EnrollStatus === 'Enrolled') {
        r.PermanentID = mkPerm(r); nP++;
      }
    });
    if (rows.length) { put_(sh, 2, aCol, rows.map(r => [r.AppRef || ''])); put_(sh, 2, pCol, rows.map(r => [r.PermanentID || ''])); }
    stBump_();
    audit_('owner', 'ids.backfill', nA + ' AppRef, ' + nP + ' PermanentID', '');
    Logger.log('Enrollee References issued: ' + nA + '\nPermanent Student IDs issued: ' + nP);
    return { success: true, message: nA + ' Enrollee Reference(s) and ' + nP + ' Student ID(s) issued.' };
  } finally { try { lock.releaseLock(); } catch (_) {} }
}