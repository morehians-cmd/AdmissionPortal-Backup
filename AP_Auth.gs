/**
 * Moreh Academy — email OTP authentication foundation.
 * Requires AP_Config.gs and AP_Database.gs.
 *
 * IMPORTANT: Only active, pre-provisioned Users can sign in.
 * Public registration and profile linking are intentionally not enabled here.
 */

const AP_AUTH = Object.freeze({
  OTP_MINUTES: 10,
  OTP_MAX_ATTEMPTS: 5,
  OTP_RESEND_SECONDS: 60,
  OTP_MAX_PER_HOUR: 3,
  SESSION_HOURS: 8
});

function AP_setupAuthSecret() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('AP_AUTH_HMAC_SECRET')) {
    return {success:true, message:'Authentication secret is already configured.'};
  }
  props.setProperty('AP_AUTH_HMAC_SECRET', Utilities.getUuid() + Utilities.getUuid());
  return {success:true, message:'Authentication secret configured.'};
}

function AP_authSecret_() {
  const secret = PropertiesService.getScriptProperties().getProperty('AP_AUTH_HMAC_SECRET');
  if (!secret) throw new Error('Authentication is not configured. Ask the project administrator to run AP_setupAuthSecret.');
  return secret;
}

function AP_authHash_(value) {
  const bytes = Utilities.computeHmacSha256Signature(String(value), AP_authSecret_());
  return Utilities.base64Encode(bytes);
}

function AP_authEmail_(value) {
  const email = String(value || '').trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Enter a valid email address.');
  }
  return email;
}

function AP_authFindUser_(email) {
  const users = AP_readRows_('Users');
  for (let i = 0; i < users.length; i++) {
    if (String(users[i].Email || '').trim().toLowerCase() === email) {
      return {user:users[i], row:i + 2};
    }
  }
  return null;
}

function AP_authGenericResponse_() {
  return {success:true, message:'If this email belongs to an active account, a sign-in code will be sent.'};
}

/**
 * Sends an OTP only to an existing ACTIVE account.
 * The same response is returned for unknown/inactive addresses to reduce account enumeration.
 */
function AP_requestEmailOtp(emailInput) {
  const email = AP_authEmail_(emailInput);
  const found = AP_authFindUser_(email);
  if (!found || String(found.user.AccountStatus).toUpperCase() !== 'ACTIVE') {
    return AP_authGenericResponse_();
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  let challengeId, code;
  try {
    const sh = AP_getSpreadsheet_().getSheetByName('AuthChallenges');
    const rows = sh.getLastRow() > 1 ? sh.getRange(2,1,sh.getLastRow()-1,10).getValues() : [];
    const now = Date.now();
    const recent = rows.filter(function(r) {
      return String(r[1]).toLowerCase() === email &&
        r[9] instanceof Date && now - r[9].getTime() < 60 * 60 * 1000;
    });
    if (recent.some(function(r) { return r[9] instanceof Date && now - r[9].getTime() < AP_AUTH.OTP_RESEND_SECONDS * 1000; })) {
      return {success:false, message:'Please wait before requesting another code.'};
    }
    if (recent.length >= AP_AUTH.OTP_MAX_PER_HOUR) {
      return {success:false, message:'You have reached the code request limit. Try again later.'};
    }

    code = Utilities.getUuid().replace(/-/g,'').substring(0,8).toUpperCase();
    challengeId = Utilities.getUuid();
    const expires = new Date(now + AP_AUTH.OTP_MINUTES * 60 * 1000);
    const codeHash = AP_authHash_(challengeId + ':' + code);
    sh.appendRow([challengeId,email,'SIGN_IN',codeHash,expires,0,AP_AUTH.OTP_MAX_ATTEMPTS,'PENDING',new Date(now),new Date(now)]);
  } finally {
    lock.releaseLock();
  }

  try {
    MailApp.sendEmail({
      to:email,
      subject:'Your Moreh Academy sign-in code',
      body:'Your Moreh Academy sign-in code is ' + code + '. It expires in ' +
        AP_AUTH.OTP_MINUTES + ' minutes. If you did not request this code, you can ignore this email.',
      name:'Moreh Academy Admissions'
    });
  } catch (err) {
    AP_authSetChallengeStatus_(challengeId,'DELIVERY_FAILED');
    throw new Error('We could not send the sign-in email. Please try again later.');
  }
  return AP_authGenericResponse_();
}

function AP_authSetChallengeStatus_(challengeId,status) {
  const sh = AP_getSpreadsheet_().getSheetByName('AuthChallenges');
  if (sh.getLastRow() < 2) return;
  const ids = sh.getRange(2,1,sh.getLastRow()-1,1).getValues();
  for (let i=ids.length-1;i>=0;i--) {
    if (ids[i][0] === challengeId) {
      sh.getRange(i+2,8).setValue(status);
      return;
    }
  }
}

/** Verifies the latest pending sign-in challenge and returns a short-lived session token. */
function AP_verifyEmailOtp(emailInput, codeInput) {
  const email = AP_authEmail_(emailInput);
  const code = String(codeInput || '').trim().toUpperCase();
  if (!/^[A-F0-9]{8}$/.test(code)) throw new Error('Enter the 8-character code from your email.');

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const ss = AP_getSpreadsheet_();
    const challenges = ss.getSheetByName('AuthChallenges');
    if (challenges.getLastRow() < 2) throw new Error('The code is invalid or expired.');
    const values = challenges.getRange(2,1,challenges.getLastRow()-1,10).getValues();
    let idx = -1;
    for (let i=values.length-1;i>=0;i--) {
      if (String(values[i][1]).toLowerCase() === email &&
          values[i][2] === 'SIGN_IN' && values[i][7] === 'PENDING') { idx=i; break; }
    }
    if (idx < 0) throw new Error('The code is invalid or expired.');

    const row = values[idx], sheetRow = idx + 2, now = new Date();
    if (!(row[4] instanceof Date) || row[4].getTime() < now.getTime()) {
      challenges.getRange(sheetRow,8).setValue('EXPIRED');
      throw new Error('The code is invalid or expired. Request a new one.');
    }
    if (Number(row[5]) >= Number(row[6])) {
      challenges.getRange(sheetRow,8).setValue('LOCKED');
      throw new Error('Too many incorrect attempts. Request a new code.');
    }
    if (AP_authHash_(row[0] + ':' + code) !== row[3]) {
      const attempts = Number(row[5]) + 1;
      challenges.getRange(sheetRow,6).setValue(attempts);
      if (attempts >= Number(row[6])) challenges.getRange(sheetRow,8).setValue('LOCKED');
      throw new Error('The code is incorrect.');
    }

    const found = AP_authFindUser_(email);
    if (!found || String(found.user.AccountStatus).toUpperCase() !== 'ACTIVE') {
      challenges.getRange(sheetRow,8).setValue('REJECTED');
      throw new Error('This account is not active. Contact the admissions office.');
    }

    challenges.getRange(sheetRow,8).setValue('USED');
    const token = Utilities.getUuid() + Utilities.getUuid();
    const tokenHash = Utilities.base64Encode(
      Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, token)
    );
    const expires = new Date(now.getTime() + AP_AUTH.SESSION_HOURS * 60 * 60 * 1000);
    ss.getSheetByName('Sessions').appendRow([
      Utilities.getUuid(),found.user.UserID,tokenHash,now,expires,now,'',''
    ]);

    const userHeaders = AP_SCHEMA.Users;
    const lastLoginCol = userHeaders.indexOf('LastLoginAt') + 1;
    ss.getSheetByName('Users').getRange(found.row,lastLoginCol).setValue(now);
    return {
      success:true,
      token:token,
      expiresAt:expires.toISOString(),
      user:{userId:found.user.UserID,email:email,role:found.user.Role}
    };
  } finally {
    lock.releaseLock();
  }
}

/** Server-side session validation. Never trust a role supplied by the browser. */
function AP_getSessionUser(tokenInput) {
  const token = String(tokenInput || '');
  if (token.length < 40 || token.length > 200) throw new Error('Your session is invalid. Please sign in again.');
  const hash = Utilities.base64Encode(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, token)
  );
  const sessions = AP_readRows_('Sessions');
  for (let i=sessions.length-1;i>=0;i--) {
    const s = sessions[i];
    if (s.TokenHash !== hash || s.RevokedAt) continue;
    const expiry = new Date(s.ExpiresAt);
    if (isNaN(expiry.getTime()) || expiry.getTime() <= Date.now()) {
      throw new Error('Your session has expired. Please sign in again.');
    }
    const users = AP_readRows_('Users');
    const user = users.find(function(u) { return String(u.UserID) === String(s.UserID); });
    if (!user || String(user.AccountStatus).toUpperCase() !== 'ACTIVE') {
      throw new Error('This account is not active.');
    }
    return {userId:user.UserID,email:user.Email,role:user.Role,expiresAt:expiry.toISOString()};
  }
  throw new Error('Your session is invalid. Please sign in again.');
}

function AP_logout(tokenInput) {
  const token = String(tokenInput || '');
  if (token.length < 40 || token.length > 200) return {success:true};
  const hash = Utilities.base64Encode(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, token)
  );
  const sh = AP_getSpreadsheet_().getSheetByName('Sessions');
  if (sh.getLastRow() < 2) return {success:true};
  const values = sh.getRange(2,1,sh.getLastRow()-1,8).getValues();
  for (let i=values.length-1;i>=0;i--) {
    if (values[i][2] === hash && !values[i][6]) {
      sh.getRange(i+2,7).setValue(new Date());
      break;
    }
  }
  return {success:true};
}
