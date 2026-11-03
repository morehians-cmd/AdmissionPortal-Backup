/**
 * Moreh Academy account lifecycle — revised authentication contract.
 *
 * IMPORTANT:
 * - Legacy email-only sign-in endpoints are intentionally removed.
 * - Existing students: admin-issued username + temporary password.
 * - Parents: admin invitation only; invitation email verification is OTP-based.
 * - New students: enrollment-gated application; OTP is sent to the parent/guardian email.
 *
 * Password verification/provisioning is deliberately not enabled in this file.
 * Before implementing it, integrate a vetted password KDF (Argon2id/bcrypt/PBKDF2
 * via a reviewed service/library). Apps Script Utilities does not expose a native
 * password KDF. Do NOT replace this with plain SHA-256 or a homemade hash loop.
 */

const AP_AUTH_POLICY = Object.freeze({
  PARENT_OTP_MINUTES: 10,
  OTP_MAX_ATTEMPTS: 5,
  OTP_RESEND_SECONDS: 60,
  OTP_MAX_PER_HOUR: 3,
  INVITATION_HOURS: 72,
  SESSION_HOURS: 8
});

function AP_authGetSetting_(key) {
  const rows = AP_readRows_('Settings');
  const item = rows.find(function(r) {
    return String(r.SettingKey) === key && String(r.IsActive).toUpperCase() === 'TRUE';
  });
  return item ? String(item.SettingValue) : '';
}

function AP_isNewEnrollmentOpen_(schoolYear) {
  const active = AP_authGetSetting_('NEW_STUDENT_ENROLLMENT_ENABLED') === 'TRUE';
  const configuredYear = AP_authGetSetting_('NEW_STUDENT_ENROLLMENT_SCHOOL_YEAR');
  return active && (!schoolYear || !configuredYear || configuredYear === String(schoolYear));
}

function AP_authRequireEmail_(value) {
  const email = String(value || '').trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Enter a valid email address.');
  }
  return email;
}

function AP_authSecret_() {
  const secret = PropertiesService.getScriptProperties().getProperty('AP_AUTH_HMAC_SECRET');
  if (!secret) throw new Error('Authentication secret is not configured.');
  return secret;
}

function AP_authHmac_(value) {
  return Utilities.base64Encode(Utilities.computeHmacSha256Signature(String(value), AP_authSecret_()));
}

/** Compare fixed-format authentication MACs without early character exits. */
function AP_authConstantTimeEqual_(expected, actual) {
  if (typeof expected !== 'string' || typeof actual !== 'string' || expected.length !== actual.length) return false;
  let difference = 0;
  for (let i = 0; i < expected.length; i++) {
    difference |= expected.charCodeAt(i) ^ actual.charCodeAt(i);
  }
  return difference === 0;
}

function AP_setupAuthSecret() {
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('AP_AUTH_HMAC_SECRET')) {
    props.setProperty('AP_AUTH_HMAC_SECRET', Utilities.getUuid() + Utilities.getUuid());
  }
  return {success:true,message:'Authentication secret is configured in Script Properties.'};
}

/**
 * Creates an OTP challenge addressed to the parent/guardian email.
 * This function only establishes a verification challenge; the enrollment
 * workflow must create the student/application after OTP verification.
 */
function AP_requestNewStudentParentOtp(parentEmail, schoolYear) {
  const email = AP_authRequireEmail_(parentEmail);
  if (!AP_isNewEnrollmentOpen_(schoolYear)) {
    throw new Error('New-student enrollment is not currently open.');
  }
  return AP_createEmailChallenge_(email,'NEW_STUDENT_PARENT_VERIFY','',String(schoolYear || ''));
}

/** Parent registration can only begin with a live invitation created by an admin. */
function AP_requestParentInvitationOtp(invitationCode, parentEmail) {
  const email = AP_authRequireEmail_(parentEmail);
  const code = String(invitationCode || '').trim();
  if (code.length < 16 || code.length > 128) throw new Error('The invitation is invalid or expired.');
  const rows = AP_readRows_('ParentInvitations');
  const match = rows.find(function(r) {
    return String(r.ParentEmail).toLowerCase() === email &&
      r.Status === 'PENDING' && new Date(r.ExpiresAt).getTime() > Date.now() &&
      AP_authConstantTimeEqual_(r.InviteCodeHash, AP_authHmac_(code));
  });
  if (!match) throw new Error('The invitation is invalid or expired.');
  return AP_createEmailChallenge_(email,'PARENT_INVITATION_VERIFY',match.StudentID,'');
}

/** Internal OTP sender with per-email throttling and hashed challenge storage. */
function AP_createEmailChallenge_(email,purpose,studentId,schoolYear) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  let challengeId, code;
  try {
    const sh = AP_getSpreadsheet_().getSheetByName('AuthChallenges');
    const values = sh.getLastRow() > 1 ? sh.getRange(2,1,sh.getLastRow()-1,12).getValues() : [];
    const now = Date.now();
    const recent = values.filter(function(r) {
      return String(r[1]).toLowerCase() === email && r[2] === purpose &&
        r[9] instanceof Date && now-r[9].getTime() < 3600000;
    });
    if (recent.some(function(r) { return r[9] instanceof Date && now-r[9].getTime() < AP_AUTH_POLICY.OTP_RESEND_SECONDS*1000; })) {
      throw new Error('Please wait before requesting another code.');
    }
    if (recent.length >= AP_AUTH_POLICY.OTP_MAX_PER_HOUR) {
      throw new Error('Too many code requests. Try again later.');
    }
    code = Utilities.getUuid().replace(/-/g,'').substring(0,12).toUpperCase();
    challengeId = Utilities.getUuid();
    const expires = new Date(now + AP_AUTH_POLICY.PARENT_OTP_MINUTES*60000);
    sh.appendRow([challengeId,email,purpose,AP_authHmac_(challengeId+':'+code),expires,0,
      AP_AUTH_POLICY.OTP_MAX_ATTEMPTS,'PENDING',new Date(now),new Date(now),studentId,schoolYear]);
  } finally {
    lock.releaseLock();
  }
  try {
    MailApp.sendEmail({
      to:email,
      subject:'Moreh Academy verification code',
      body:'Your Moreh Academy verification code is '+code+'. It expires in '+
        AP_AUTH_POLICY.PARENT_OTP_MINUTES+' minutes. If you did not request this, ignore this email.',
      name:'Moreh Academy Admissions'
    });
  } catch (err) {
    AP_authSetChallengeStatus_(challengeId,'DELIVERY_FAILED');
    throw new Error('The verification email could not be sent. Please try again later.');
  }
  return {success:true,message:'If the request is eligible, a verification code has been sent.'};
}

function AP_authSetChallengeStatus_(challengeId,status) {
  const sh=AP_getSpreadsheet_().getSheetByName('AuthChallenges');
  if (sh.getLastRow()<2) return;
  const ids=sh.getRange(2,1,sh.getLastRow()-1,1).getValues();
  for(let i=ids.length-1;i>=0;i--) if(ids[i][0]===challengeId) {
    sh.getRange(i+2,8).setValue(status); return;
  }
}

/**
 * Verify OTP for a specific purpose. This does not itself create an account
 * or link a parent; those actions require separate authorized workflow handlers.
 */
function AP_verifyLifecycleOtp(emailInput,codeInput,purpose) {
  const email=AP_authRequireEmail_(emailInput);
  const code=String(codeInput||'').trim().toUpperCase();
  const allowed=['NEW_STUDENT_PARENT_VERIFY','PARENT_INVITATION_VERIFY'];
  if (allowed.indexOf(String(purpose))<0 || !/^[A-F0-9]{12}$/.test(code)) {
    throw new Error('The verification code is invalid or expired.');
  }
  const lock=LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sh=AP_getSpreadsheet_().getSheetByName('AuthChallenges');
    if(sh.getLastRow()<2) throw new Error('The verification code is invalid or expired.');
    const rows=sh.getRange(2,1,sh.getLastRow()-1,12).getValues();
    let index=-1;
    for(let i=rows.length-1;i>=0;i--) {
      if(String(rows[i][1]).toLowerCase()===email && rows[i][2]===purpose && rows[i][7]==='PENDING') {index=i;break;}
    }
    if(index<0) throw new Error('The verification code is invalid or expired.');
    const row=rows[index], sheetRow=index+2, now=new Date();
    if(!(row[4] instanceof Date)||row[4].getTime()<=now.getTime()) {
      sh.getRange(sheetRow,8).setValue('EXPIRED');
      throw new Error('The verification code is invalid or expired.');
    }
    if(Number(row[5])>=Number(row[6])) {
      sh.getRange(sheetRow,8).setValue('LOCKED');
      throw new Error('Too many attempts. Request a new code.');
    }
    if(!AP_authConstantTimeEqual_(row[3], AP_authHmac_(row[0]+':'+code))) {
      const attempts=Number(row[5])+1;
      sh.getRange(sheetRow,6).setValue(attempts);
      if(attempts>=Number(row[6])) sh.getRange(sheetRow,8).setValue('LOCKED');
      throw new Error('The verification code is incorrect.');
    }
    sh.getRange(sheetRow,8).setValue('VERIFIED');
    return {success:true,purpose:purpose,studentId:row[10]||'',schoolYear:row[11]||'',email:email};
  } finally {
    lock.releaseLock();
  }
}

/** Revoke a session by its opaque token. Session issuance awaits approved password KDF. */
function AP_logout(tokenInput) {
  const token=String(tokenInput||'');
  if(token.length<40||token.length>200) return {success:true};
  const hash=Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,token));
  const sh=AP_getSpreadsheet_().getSheetByName('Sessions');
  if(sh.getLastRow()<2) return {success:true};
  const rows=sh.getRange(2,1,sh.getLastRow()-1,8).getValues();
  for(let i=rows.length-1;i>=0;i--) if(rows[i][2]===hash&&!rows[i][6]) {
    sh.getRange(i+2,7).setValue(new Date()); break;
  }
  return {success:true};
}
