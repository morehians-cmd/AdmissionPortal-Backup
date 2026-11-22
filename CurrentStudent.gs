/*****************************************************************************
 MOREH ACADEMY PORTAL - CURRENT STUDENT ACCOUNTS (add as a NEW file named "CurrentStudent")
 A dedicated "Create an account" for learners who are already enrolled this school year.

 WHAT IT DOES
   - Public form asks: Surname, First Name, Middle Name, LRN, Grade Level, Section, Category
     (+ TLC ID Number and Secondary Category when the Category is TLC SCHOLAR), then username, email and password.
   - The e-mail code check is the same as the enrollee sign-up (or no code while automatic mail is off).
   - If the LRN is ALREADY on the Students sheet (e.g. imported by the office) and has no login yet, and the surname and
     first name match, the new login is linked to that record: nothing the office keeps is overwritten, only blanks are filled.
   - Otherwise a new Students row is created: Classification Old, status Enrolled, current school year, Permanent Student ID
     (MAT-...) issued, TLC ID number saved to IDNumber. "Processed by" reads SELF-REGISTERED (UNVERIFIED) so staff can
     check the record against the masterlist (search the record, Audit Trail / Processing Metadata).
   - The learner then opens the standard Student Portal (not the enrollee portal) and completes the rest of the profile.
 Requires Security, Protection, Hardening, MailSwitch, SignInGuard, Identifiers (same as registerAccount).
*****************************************************************************/

const CUR_CAT_LABELS_ = { 'REGULAR':'REGULAR', 'TLC SCHOLAR':'TLC SCHOLAR', 'ESC GRANTEE':'ESC GRANTEE', 'VP-QVR':'VP-QVR', 'VP-QVA':'VP-QVA', 'IS':'IS' };
const CUR_TLC_CATS_ = ['TLC SCHOLAR'];            // same categories that get a Student ID card (IdCard.gs)
const CUR_TLC_RE_ = /^TLC\d{4}-\d{4}$/;

/** PUBLIC. What the form needs: grades, sections (Senior High sections carry their cluster code), categories, school year. */
function currentStudentOptions() {
  try {
    const sections = {};
    GRADES.forEach(g => {
      if (g === 'Grade 11' || g === 'Grade 12') {
        sections[g] = [];
        Object.keys(CL).forEach(c => (SEC[g + '|' + c] || []).forEach(s => sections[g].push([s, c])));
      } else sections[g] = (SEC[g] || []).map(s => [s, '']);
    });
    return ok({ sy: activeSY_(), grades: GRADES, sections: sections, clusters: CL,
      categories: CATS.map(c => ({ v: c, l: CUR_CAT_LABELS_[c] || c, tlc: CUR_TLC_CATS_.includes(c) })), secondary: SEC_CAT_LIST });
  } catch (e) { return fail(e); }
}

/** Validates the form. Returns the cleaned values or throws a friendly Error. */
function curClean_(f) {
  const up = v => String(v || '').trim().toUpperCase().replace(/\s+/g, ' ');
  const p = { sn: up(f.surname), fn: up(f.firstName), mn: up(f.middleName), lrn: String(f.lrn || '').trim(), grade: String(f.grade || '').trim(),
    section: up(f.section), cat: String(f.category || '').trim(), sec: String(f.secondaryCategory || '').trim(), tlc: up(f.tlcId), un: String(f.username || '').trim().toLowerCase(),
    em0: String(f.email || '').trim(), pw: String(f.password || '') };
  p.em = p.em0.toLowerCase();
  if (!f.consent) throw new Error('You must accept the Data Privacy Notice to create an account.');
  if (!p.sn || !p.fn) throw new Error('Surname and first name are required.');
  if (!NAME_RE.test(p.sn) || !NAME_RE.test(p.fn) || (p.mn && !NAME_RE.test(p.mn))) throw new Error('Names may contain letters, spaces, periods, apostrophes and hyphens only.');
  if (!/^[1-5]\d{11}$/.test(p.lrn)) throw new Error('LRN must be 12 digits and start with 1, 2, 3, 4 or 5.');
  if (GRADES.indexOf(p.grade) < 0) throw new Error('Select your grade level.');
  let cluster = '';
  if (p.grade === 'Grade 11' || p.grade === 'Grade 12') {
    const c = Object.keys(CL).find(k => (SEC[p.grade + '|' + k] || []).indexOf(p.section) >= 0);
    if (!c) throw new Error('Select your section.');
    cluster = CL[c];
  } else if ((SEC[p.grade] || []).indexOf(p.section) < 0) throw new Error('Select your section.');
  p.cluster = cluster;
  if (CATS.indexOf(p.cat) < 0) throw new Error('Select your category.');
  if (CUR_TLC_CATS_.includes(p.cat)) {
    if (!CUR_TLC_RE_.test(p.tlc)) throw new Error('Enter your TLC ID number exactly as issued, like TLC2026-0001.');
    const yr = parseInt(p.tlc.slice(3, 7), 10), top = parseInt(activeSY_().slice(0, 4), 10) + 1;
    if (yr < 2018 || yr > top) throw new Error('The year in the TLC ID number must be between 2018 and ' + top + '.');
    if (SEC_CAT_LIST.indexOf(p.sec) < 0) throw new Error('Select your Secondary Category (TLC-OVAP, TLC-ESC or Not Applicable).');
  } else { p.tlc = ''; p.sec = ''; }
  if (!USER_RE.test(p.un)) throw new Error('Choose a username of 4 to 30 characters: letters, numbers, dot, underscore or hyphen (no spaces, no @).');
  if (rows_('U').some(u => u.Username === p.un)) throw new Error('That username is already taken. Please choose another one.');
  if (!EMAIL_RE.test(p.em0)) throw new Error('Enter a valid email address.');
  if (p.pw.length < 8 || p.pw === DEFAULT_PW) throw new Error('Password must be at least 8 characters.');
  return p;
}

/** The record this sign-up may link to: same LRN, same surname + first name, and no login yet. */
function curClaimable_(all, users, p) {
  const s = all.find(x => x.LRN === p.lrn);
  if (!s) return null;
  if (String(s.Surname || '').toUpperCase() !== p.sn || String(s.FirstName || '').toUpperCase() !== p.fn) return null;
  if (users.some(u => u.StudentID === s.StudentID)) return null;
  return s;
}
/** True when this sign-up cannot go ahead (an account or record already uses these details). */
function curDup_(all, users, p) {
  const claim = curClaimable_(all, users, p);
  const lrnTaken = all.some(s => s.LRN === p.lrn) && !claim;
  const mailTaken = all.some(s => (s.Email || '').toLowerCase() === p.em && (!claim || s.StudentID !== claim.StudentID)) || users.some(u => (u.Email || '').toLowerCase() === p.em);
  const tlcTaken = !!p.tlc && all.some(s => s.IDNumber === p.tlc && (!claim || s.StudentID !== claim.StudentID));
  return lrnTaken || mailTaken || tlcTaken || users.some(u => u.Username === p.un);
}

/** PUBLIC step 1. Same behaviour and response as registerAccount: a code is e-mailed, nothing is created yet. */
function registerCurrentAccount(f) {
  try {
    const p = curClean_(f || {});
    if (!mailOn_()) return curDirect_(p);
    const cache = CacheService.getScriptCache();
    if (cache.get('rg_' + p.em)) throw new Error('A code was sent recently. Please wait a minute, or enter the code you already received.');
    cache.put('rg_' + p.em, '1', 60);
    if (!pubMailOk_('reg')) throw new Error('Registration is busy right now. Please try again later.');
    const ch = Utilities.getUuid();
    if (!curDup_(rows_('S'), rows_('U'), p)) {
      const code = String(parseInt(Utilities.getUuid().replace(/-/g, '').slice(0, 8), 16) % 1000000).padStart(6, '0');
      const keep = Object.assign({}, p); delete keep.pw;
      cache.put('rc_' + ch, JSON.stringify({ p: keep, hash: hash_(p.pw), h: otHash_(ch, code), n: 0, exp: Date.now() + 900000 }), 900);
      try {
        MailApp.sendEmail({ to: p.em0, name: 'Moreh Academy Admissions', subject: 'Moreh Academy portal: verify your email',
          body: 'Your verification code is: ' + code + '\n\nEnter it on the registration screen within 15 minutes to finish creating your student account. If you did not start a registration, ignore this email.' });
      } catch (e) { cache.remove('rc_' + ch); throw new Error('Could not send the verification email. Please check the address and try again.'); }
    }
    return ok({ pending: true, challenge: ch, hint: maskEmail_(p.em0) }, 'If this email can be registered, a 6-digit code has been sent. Enter it to finish.');
  } catch (e) { return fail(e); }
}

/** PUBLIC step 2. Creates (or links) the record and the login only after the e-mailed code is correct. */
function confirmCurrentRegistration(challenge, code) {
  const lock = LockService.getScriptLock(); let held = false, res = null;
  try {
    if (!lock.tryLock(8000)) throw new Error('The service is busy. Please try again.'); held = true;
    const cache = CacheService.getScriptCache(), ch = String(challenge || ''), ck = 'rc_' + ch, raw = cache.get(ck), bad = new Error('Invalid or expired code. Please register again.');
    if (!raw) throw bad;
    const rec = JSON.parse(raw);
    if (Date.now() > rec.exp) { cache.remove(ck); throw bad; }
    if (!safeEq_(rec.h, otHash_(ch, String(code || '').trim()))) {
      rec.n++; if (rec.n >= 5) cache.remove(ck); else cache.put(ck, JSON.stringify(rec), Math.max(1, Math.ceil((rec.exp - Date.now()) / 1000)));
      throw bad;
    }
    const p = rec.p; p.pw = { hash: rec.hash };
    if (curDup_(rows_('S'), rows_('U'), p)) { cache.remove(ck); throw bad; }
    res = curCreate_(p, 'e-mail verified');
    cache.remove(ck);
  } catch (e) { return fail(e); } finally { if (held) { try { lock.releaseLock(); } catch (_) {} } }
  curNotify_(res);
  return ok({ id: res.row.PermanentID || res.row.StudentID, username: res.un }, 'Email verified. Your student account is ready. You can now sign in.');
}

/** Used while automatic mail is OFF: no code, but a per-LRN throttle and the shared daily cap. */
function curDirect_(p) {
  const lock = LockService.getScriptLock(); let held = false, res = null;
  try {
    if (!lock.tryLock(8000)) throw new Error('The service is busy. Please try again.'); held = true;
    const cache = CacheService.getScriptCache(), pr = PropertiesService.getScriptProperties(), tz = Session.getScriptTimeZone();
    if (cache.get('rd_' + p.lrn)) throw new Error('Please wait a minute before trying again.');
    cache.put('rd_' + p.lrn, '1', 60);
    const day = Utilities.formatDate(new Date(), tz, 'yyyyMMdd'), cur = String(pr.getProperty('REG_DAY') || '').split(':'),
      n = cur[0] === day ? parseInt(cur[1] || '0', 10) : 0, cap = parseInt(pr.getProperty('REG_DAILY_CAP') || '300', 10);
    if (n >= cap) { alert_('regcap', 'Daily registration cap reached', 'More than ' + cap + ' registrations today. Could be a busy day, or abuse.'); throw new Error('Registration is busy right now. Please try again tomorrow or visit the Admissions Office.'); }
    if (curDup_(rows_('S'), rows_('U'), p)) throw new Error('We could not create an account with these details. If you already registered, please sign in; otherwise visit the Admission Office.');
    res = curCreate_(p, 'no e-mail verification (mail switch off)');
    pr.setProperty('REG_DAY', day + ':' + (n + 1));
  } catch (e) { return fail(e); } finally { if (held) { try { lock.releaseLock(); } catch (_) {} } }
  curNotify_(res);
  return ok({ id: res.row.PermanentID || res.row.StudentID, username: res.un }, 'Account created. Your username is "' + res.un + '". You can now sign in.');
}

/** Writes the record + login. The CALLER holds the script lock and has already run curDup_. */
function curCreate_(p, how) {
  const sh = sh_('S'), tz = Session.getScriptTimeZone(), d = new Date(), now = Utilities.formatDate(d, tz, 'yyyy-MM-dd HH:mm:ss');
  const all = rows_('S'), users = rows_('U'), claim = curClaimable_(all, users, p);
  let row, claimed = false;
  if (claim) {                                    // an existing record: link the login, fill blanks only
    claimed = true; row = Object.assign({}, claim);
    const fill = (k, v) => { if (!row[k] && v) row[k] = v; };
    fill('MiddleName', p.mn); fill('Email', p.em0); fill('GradeLevel', p.grade); fill('Section', p.section); fill('Cluster', p.cluster); fill('Category', p.cat);
    if (CUR_TLC_CATS_.includes(row.Category)) { fill('IDNumber', p.tlc); fill('SecondaryCategory', p.sec); }
    fill('ConsentAt', now);
    row.FullName = [row.Surname + ',', row.FirstName, row.MiddleName ? row.MiddleName[0] + '.' : '', row.Suffix].filter(Boolean).join(' ');
    if (row.EnrollStatus === 'Enrolled') ensurePermId_(row);
    const hit = findStudent_(claim.StudentID); if (!hit) throw new Error('Record not found.');
    put_(sh, hit.r, 1, [COLS.map(c => row[c] || '')]);
  } else {
    row = Object.assign({}, newKeys_(activeSY_()), { CreatedAt: now, Surname: p.sn, FirstName: p.fn, MiddleName: p.mn, LRN: p.lrn, Email: p.em0,
      Classification: 'Old', SchoolYear: activeSY_(), EnrollStatus: 'Enrolled', GradeLevel: p.grade, Section: p.section, Cluster: p.cluster, Category: p.cat,
      IDNumber: p.tlc, SecondaryCategory: p.sec, ReqConsent: 'None', ConsentAt: now,
      ProcessedBy: 'SELF-REGISTERED (UNVERIFIED)', ProcessedDate: Utilities.formatDate(d, tz, 'yyyy-MM-dd'), ProcessedTime: Utilities.formatDate(d, tz, 'hh:mm:ss a'), StatusChangedAt: now });
    row.FullName = [p.sn + ',', p.fn, p.mn ? p.mn[0] + '.' : ''].filter(Boolean).join(' ');
    ensurePermId_(row);
    put_(sh, sh.getLastRow() + 1, 1, [COLS.map(c => row[c] || '')]);
  }
  addUser_(p.un, p.pw, 'student', row.FullName, row.StudentID, p.em0);
  audit_('self:' + p.un, claimed ? 'student.register.current.link' : 'student.register.current', row.StudentID, (claimed ? 'linked to existing record; ' : 'new record, self-declared current student, verify against the masterlist; ') + how);
  return { row: row, un: p.un, claimed: claimed };
}

function curNotify_(res) {
  notify_(res.row, 'Student account ready', 'Your student account is ready.\nUsername: ' + res.un + '\n\nSign in with your username and complete your student profile in the portal. Your Student ID is ' + (res.row.PermanentID || res.row.StudentID) + '.');
}

/* ---------- homepage wrappers (flat results, like the other homepage* functions in Website.gs) ---------- */
function homepageRegisterCurrent(form) {
  const r = registerCurrentAccount(form || {});
  if (r && r.success && r.data && r.data.pending) return { success: true, challenge: r.data.challenge, hint: r.data.hint, message: r.message || '' };
  if (r && r.success) return { success: true, challenge: '', message: r.message || 'Account created. You can sign in now.' };
  return { success: false, error: (r && r.error) || 'Could not create the account.' };
}
function homepageConfirmCurrent(challenge, code) {
  const r = confirmCurrentRegistration(challenge, code);
  if (r && r.success) return { success: true, id: (r.data && r.data.id) || '', message: r.message || 'Email verified. You can sign in now.' };
  return { success: false, error: (r && r.error) || 'Invalid or expired code.' };
}