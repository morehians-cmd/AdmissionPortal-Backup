/**
 * HomepageBridge.gs — lets the New AP homepage keep its sign-in / register / password modals
 * while using Old AP's credentials, sessions and sheets.
 *
 * There is exactly ONE account system in the merged app: Old AP's Users sheet and
 * login()/verifyOtp()/forgotPassword()/resetPassword()/registerAccount()/confirmRegistration().
 * These wrappers only trim the payload so the homepage receives what it needs, and keep the
 * portal's session key ('mrh_t') as the single browser token.
 */

/** Step 1 of sign-in. Returns {token} on success, {otp,challenge,hint} for staff who need a code. */
function homepageSignIn(username, password) {
  const r = login(username, password);
  if (r && r.success && r.data && r.data.otp) {
    return { success: true, otp: true, challenge: r.data.challenge, hint: r.data.hint, message: 'Enter the 6-digit code sent to your email.' };
  }
  if (r && r.success && r.data && r.data.token) {
    const u = r.data.user || {};
    return { success: true, token: r.data.token, name: u.FullName || u.Username || '', role: u.Role || '' };
  }
  return { success: false, error: (r && r.error) || 'Invalid username or password.' };
}

/** Step 2 of staff sign-in. Returns the same session token the portal uses. */
function homepageVerifyCode(challenge, code) {
  const r = verifyOtp(challenge, code);
  if (r && r.success && r.data && r.data.token) {
    const u = r.data.user || {};
    return { success: true, token: r.data.token, name: u.FullName || u.Username || '', role: u.Role || '' };
  }
  return { success: false, error: (r && r.error) || 'Invalid or expired code.' };
}

/** Public registration step 1: emails a 6-digit code (or registers directly when mail is off). */
function homepageRegister(form) {
  const f = form || {};
  const r = registerAccount({
    surname: f.surname, firstName: f.firstName, lrn: f.lrn, birthdate: f.birthdate,
    email: f.email, password: f.password, password2: f.password2,
    consent: f.consent === true, mobile: f.mobile,
    guardName: f.guardName, guardRel: f.guardRel, guardEmail: f.guardEmail, guardMobile: f.guardMobile
  });
  if (r && r.success && r.data && r.data.pending) {
    return { success: true, challenge: r.data.challenge, hint: r.data.hint, message: r.message || '' };
  }
  if (r && r.success) return { success: true, challenge: '', message: (r && r.message) || 'Account created. You can sign in now.' };
  return { success: false, error: (r && r.error) || 'Could not create the account.' };
}

/** Public registration step 2. */
function homepageConfirmRegistration(challenge, code) {
  const r = confirmRegistration(challenge, code);
  if (r && r.success) return { success: true, id: (r.data && r.data.id) || '', message: r.message || 'Email verified. You can sign in now.' };
  return { success: false, error: (r && r.error) || 'Invalid or expired code.' };
}

/** Always reports the same message, whether or not the account exists (Old AP behaviour). */
function homepageForgotPassword(identifier) {
  const r = forgotPassword(identifier);
  if (r && r.success) return { success: true, message: r.message || 'If the account exists, a 6-digit code has been sent.' };
  return { success: false, error: (r && r.error) || 'Could not send the code.' };
}

function homepageResetPassword(identifier, code, newPassword) {
  const r = resetPassword(identifier, code, newPassword);
  if (r && r.success) return { success: true, message: r.message || 'Password changed. Please sign in.' };
  return { success: false, error: (r && r.error) || 'Could not reset the password.' };
}

/** The homepage never holds a session after redirecting to the portal; this exists for parity. */
function homepageSignOut(token) {
  return logout(token);
}

/* The homepage's content endpoints (getPublishedHomepage, getDraftHomepage and the
 * per-page stubs) live in Website.gs, together with the Website Management editor's
 * save/reset functions. This file is authentication only. */
