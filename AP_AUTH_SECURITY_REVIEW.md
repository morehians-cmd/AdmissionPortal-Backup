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
- The isolated Apps Script V8 authentication primitive suite has passed **12 tests, 0 failed**. The separate database write primitive suite has passed **7 tests, 0 failed**. Coverage includes constant-time comparator checks, OTP format validation, verification-handle consumption, lock-held resolution, replay rejection, wrong-purpose rejection, expiry rejection, exact enrollment school-year matching, and legacy OTP format rejection. This validates the tested primitives only, not a complete registration transaction.

### DB-01 — Schema-guarded write primitives

**Implemented and validated:** `AP_DatabaseTransactions.gs` provides schema-ordered record mapping, rejects unknown fields, checks exact tab headers before writes, appends batches with one contiguous `setValues` call, and updates exactly one uniquely keyed row while the caller holds the script lock. The isolated Apps Script V8 harness `tools/kdf-lab/gas/AP_DatabaseWriteTest.gs` passed **5/5 tests**. The expanded isolated Apps Script V8 harness passed **7/7** after the keyed-update helper was added. This does not establish multi-tab atomicity, rollback, authorization, or transaction recovery.

## Findings and required remediation

### AUTH-01 — OTP entropy and verification comparison

**Implemented for review:** OTPs now use 12 hexadecimal characters from a UUIDv4 value (48 bits of code space), and invitation/OTP HMAC strings are compared with a fixed-length character loop. A standalone Apps Script primitive test file was added at `tools/kdf-lab/gas/AP_AuthSecurityTest.gs`.

**Validated:** The user ran the isolated Apps Script V8 primitive suite: 12 passed, 0 failed. **Still required:** Obtain security review of the UUID-backed code-generation assumption and 48-bit code space; assess IP/device or global rate limits against distributed abuse. Existing attempt limits, expiry, resend throttling, and generic external errors remain in place.

### DB-02 — Multi-tab transaction recovery remains unresolved

**Observed:** The append and keyed-update helpers each perform a single-sheet write, but a parent acceptance flow spans Users, ParentProfiles, ParentStudentLinks, ParentInvitations, AuthChallenges, and AuditLogs. Google Sheets does not provide a multi-tab transaction or guaranteed rollback through these helpers.

**Design and model validation:** A recovery-journal proposal is documented in `AP_AUTH_TRANSACTION_RECOVERY.md`. The isolated in-memory Apps Script V8 recovery-model harness passed **13/13 tests** on 2026-11-04, covering injected failures at each modeled stage, planned-ID idempotency, completed-transaction recognition, partial-record escalation, no premature success, and journal secret exclusion.

**Next test prepared:** The first user-run report returned 3 passed and 7 failed. The failures included fake Range dimension mismatches and downstream assertion failures; this is not sufficient evidence of production-helper defects because the initial harness reused shared fake-sheet state. The harness was revised so each test starts with a fresh fake workbook and dimension errors report both requested and supplied dimensions. The subsequent user report showed equal requested/supplied dimensions (for example, 2×16 and 2×16), revealing a harness defect: the `Array#some` callback incorrectly read `this.numCols` instead of a captured expected-column value. This made valid writes fail before the injected failure behavior could be exercised. The harness-only fix is committed; production helpers remain unchanged. The corrected `tools/kdf-lab/gas/AP_DatabaseFakeSheetIntegrationTest.gs` is awaiting a new user-run Apps Script V8 report. **Still required:** Real Google Sheets persistence, actual lock contention, Apps Script process termination, a production transaction coordinator, concurrent attempts, and journal-update failure recovery remain untested. Do not expose an acceptance endpoint until retries are idempotent and incomplete attempts can be safely reconciled. No schema change is approved or currently required; reassess only if implementation demonstrates a concrete schema gap.

### AUTH-02 — Invitation lifecycle must be atomic and one-time

**Observed:** The current OTP-request function validates a pending invitation, but invitation acceptance/account creation is not implemented.

**Required before implementing acceptance:** Under a script lock, re-read and revalidate invitation status, expiry, invited email, student ID, and verified challenge; create or attach the parent account and link only to the invited student; mark the invitation accepted in the same critical section. Reject replay, expired invitations, mismatched emails, and already-used invitations. Do not trust student IDs or relationship values returned by the browser.

### AUTH-03 — Enrollment must be rechecked at completion

**Implemented for review:** `AP_isNewEnrollmentOpen_` now fails closed. It requires the enrollment setting to be TRUE, a non-empty configured school year, a non-empty requested school year, and an exact school-year match.

**Validated:** The user ran the isolated Apps Script V8 suite: 12 passed, 0 failed, including a regression test for matching year, mismatched year, missing requested year, missing configured year, and disabled enrollment. **Still required:** The future registration-completion handler must re-read the enrollment settings under its transaction lock and repeat this exact check immediately before committing the registration. OTP issuance-time eligibility is not sufficient.

### AUTH-04 — OTP verification response exposes internal linkage context

**Implemented for review:** `AP_verifyLifecycleOtp` now returns only a success flag and a signed opaque verification handle. The internal `AP_authConsumeVerificationHandle_` wrapper validates and consumes the handle under a script lock. The lower-level `AP_authResolveVerificationHandleLocked_` performs the same validation and state change without acquiring a lock, for use by future transaction handlers that already hold the script lock. Student ID, school year, and verified email are returned only to the downstream server-side caller.

**Validated:** The 12-case isolated Apps Script suite covers consumption, lock-held resolution, replay, wrong-purpose use, and expiry rejection. **Still required:** Add transaction-level tests for target-student binding, invitation revalidation, and complete enrollment/acceptance flows. Every consumer must independently authorize the target record and must never return the helper's internal context directly to the browser.

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
2. Design and test failure-safe one-time invitation and enrollment completion transactions; keep account creation blocked until the password KDF gate is approved.
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
