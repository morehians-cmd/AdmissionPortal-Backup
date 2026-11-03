# Authentication Security Review

Review date: 2026-11-04  
Branch: `rebuild/clean-start`  
Scope: current `AP_Auth.gs`, `AP_Database.gs`, schema contract, account-lifecycle requirements, and isolated KDF lab.

## Decision

**Authentication is not ready for deployment.** The current code is a partial lifecycle foundation, not a complete authentication system. Keep username/password login, session issuance, parent account creation, student provisioning, and all protected data endpoints disabled until the gates below are implemented and tested.

No spreadsheet schema changes are required by this review.

## Confirmed positive controls

- The schema separates users, student/parent profiles, parent-student links, invitations, link requests, challenges, sessions, and audit logs.
- Parent invitations are checked against the submitted email, pending status, expiry, and a server-side HMAC of the invitation code.
- OTP challenges are purpose-bound, expire, have an attempt limit, and are stored as HMAC values rather than plaintext codes.
- OTP creation uses a script lock while checking resend/hourly limits and appending the challenge.
- Logout accepts an opaque token and stores/looks up its SHA-256 digest rather than storing the raw token.
- The isolated KDF helper rejects empty passwords, enforces salt and iteration bounds, stores algorithm/version metadata, and verifies derived keys using a byte-wise comparison.
- The latest recorded KDF lab workflow run (#21) passed its test-and-build job. The current 10-case authentication primitive suite was also run by the user in an isolated Google Apps Script V8 project and returned 10 passed, 0 failed. A subsequent refactor split lock-held verification-handle resolution from the standalone lock-acquiring wrapper; the user reran the existing 10-case suite against that refactor with 10 passed, 0 failed.

## Findings and required remediation

### AUTH-01 — OTP entropy and verification comparison

**Implemented for review:** OTPs now use 12 hexadecimal characters from a UUIDv4 value (48 bits of code space), and invitation/OTP HMAC strings are compared with a fixed-length character loop. A standalone Apps Script primitive test file was added at `tools/kdf-lab/gas/AP_AuthSecurityTest.gs`.

**Validated:** The user ran the isolated Apps Script V8 primitive suite after the lock-helper refactor: 10 passed, 0 failed. **Still required:** Obtain security review of the UUID-backed code-generation assumption and 48-bit code space; assess IP/device or global rate limits against distributed abuse. Existing attempt limits, expiry, resend throttling, and generic external errors remain in place.

### AUTH-02 — Invitation lifecycle must be atomic and one-time

**Observed:** The current OTP-request function validates a pending invitation, but invitation acceptance/account creation is not implemented.

**Required before implementing acceptance:** Under a script lock, re-read and revalidate invitation status, expiry, invited email, student ID, and verified challenge; create or attach the parent account and link only to the invited student; mark the invitation accepted in the same critical section. Reject replay, expired invitations, mismatched emails, and already-used invitations. Do not trust student IDs or relationship values returned by the browser.

### AUTH-03 — Enrollment must be rechecked at completion

**Observed:** New-student OTP issuance checks the enrollment setting, while the full registration completion endpoint does not yet exist.

**Required:** Recheck that enrollment is still enabled for the exact school year when the registration/application is committed. An OTP obtained while enrollment was open must not authorize completion after the school year is closed or changed. Bind the verified challenge to the exact registration context and consume it once.

### AUTH-04 — OTP verification response exposes internal linkage context

**Implemented for review:** `AP_verifyLifecycleOtp` now returns only a success flag and a signed opaque verification handle. The internal `AP_authConsumeVerificationHandle_` wrapper validates and consumes the handle under a script lock. The lower-level `AP_authResolveVerificationHandleLocked_` performs the same validation and state change without acquiring a lock, for use by future transaction handlers that already hold the script lock. Student ID, school year, and verified email are returned only to the downstream server-side caller.

**Validated:** The isolated Apps Script suite covers replay, wrong-purpose use, and expiry rejection. The user reran the suite after the lock-held resolver refactor with 10 passed, 0 failed. **Still required:** Add transaction-level tests for target-student binding, invitation revalidation, and complete enrollment/acceptance flows. Every consumer must independently authorize the target record and must never return the helper's internal context directly to the browser.

### AUTH-05 — HMAC secret lifecycle and deployment setup

**Observed:** `AP_setupAuthSecret` creates a Script Properties secret from concatenated UUID values when absent. The web app configuration currently executes as the deployer and allows anonymous access.

**Required:** Restrict setup helpers to a controlled administrator/deployment procedure; do not expose them as callable public actions. Verify secret presence and rotation/recovery procedures before enabling OTP endpoints. Treat every anonymous endpoint as public and apply strict validation, throttling, and data-minimization. Every protected operation must validate a server-issued session and authorize each record on the server. Do not rely on hidden UI controls.

### AUTH-06 — Session lifecycle and authorization are incomplete

**Observed:** Logout exists, but session issuance, validation, expiry enforcement, revocation checks, renewal policy, and authenticated endpoint guards are not implemented in the current authentication file.

**Required:** Use high-entropy opaque session tokens; store only token digests; enforce expiry and revocation on every protected request; rotate or renew sessions safely; invalidate sessions on password reset, account disablement, and credential compromise as policy requires. Add server-side role and record-scope authorization to every data endpoint.

### AUTH-07 — Account lockout and password-change policy need server-side enforcement

**Observed:** The Users schema contains failed-login and lockout fields, plus temporary-password/change-required flags, but login and password-change handlers are not implemented.

**Required:** Implement atomic failed-attempt updates and lockout checks; avoid username/email enumeration; require temporary-password change before access to ordinary portal functions; validate new password policy server-side; invalidate other sessions after credential changes; never log credentials or derived keys.

### KDF-01 — Password KDF implementation remains a candidate, not production-approved

**Observed:** PBKDF2-HMAC-SHA256 using `@noble/hashes@2.4.0` passed independent Node tests and Apps Script compatibility tests. The latest Apps Script benchmark reported a 600,000-iteration median of about 4.321 seconds and worst sample of 6.113 seconds. Salt generation currently relies on a documented UUID equivalence assumption, not an independent entropy certification.

**Required:** Complete dependency provenance/license/audit review; approve the salt-generation assumption or replace it with an approved source; add a committed dependency lockfile and reproducible clean build; test realistic Apps Script concurrency and execution limits; define a safe migration policy for iteration-count upgrades. Keep 600,000 iterations provisional until operational testing and security review are complete. Do not integrate the bundle into live Apps Script yet.

### OPS-01 — Deployment posture

**Observed:** `appsscript.json` currently declares `executeAs: USER_DEPLOYING` and `access: ANYONE_ANONYMOUS`.

**Required:** Do not publish or redeploy the portal for real users while authentication and authorization are incomplete. Before launch, review the deployment access mode, data exposure, Google account/Workspace constraints, script permissions, and all callable server functions. An anonymous deployment is not made safe merely by hiding pages in the frontend.

## Implementation order

1. Resolve OTP generation/comparison and rate-limit design.
2. Define and implement one-time invitation and enrollment completion transactions.
3. Implement password record adapter only after KDF and salt review gates pass.
4. Implement admin provisioning, login, forced password change, password reset, and lockout.
5. Implement session issuance/validation/revocation and server-side authorization helpers.
6. Protect every data endpoint; add negative authorization tests for cross-student and cross-parent access.
7. Perform Apps Script runtime/load tests, deployment review, and controlled acceptance testing.
8. Only then prepare a deployment and spreadsheet migration plan.

## Spreadsheet impact

**No spreadsheet changes are required by this review.** The current schema already has the fields needed for the identified controls. A schema change should be proposed only if a later implementation demonstrates a concrete missing field.

## User action

None at this stage. Continue keeping the standalone KDF compatibility project separate from the live admission spreadsheet and Apps Script project.
