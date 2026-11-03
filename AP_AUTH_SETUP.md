# Revised account lifecycle and authentication architecture

Schema version: 2.0.0

## Approved account lifecycle

### Existing students
1. Admin provisions each current student account.
2. The account receives a unique username and a temporary password through a controlled credential-distribution process.
3. Class advisers distribute credentials individually to students in their advisory class.
4. Student signs in with username and temporary password and is required to change the temporary password.
5. Student completes/updates their profile.
6. Student may submit a parent/guardian linking request from their portal.
7. Admin verifies the request and approves/rejects it. No parent access is granted before approval.

### Parents/guardians
1. Admin opens a student's profile and creates an invitation for a named parent/guardian email and relationship.
2. A unique, expiring invitation code is sent to that email.
3. Parent enters the invitation code and receives an OTP at the same invited email.
4. Parent verifies the OTP and completes account setup.
5. The account is linked only to the student named in the invitation, subject to server-side validation.
6. No self-service parent registration without a valid invitation.

### New students
1. Admin enables next-school-year enrollment using Settings.
2. Applicant submits the initial registration details and parent/guardian email.
3. OTP is sent to the parent/guardian email, not the student's email.
4. Verified parent email is associated with the new-student registration/application workflow.
5. Enrollment must be open for the selected school year. Parents do not gain unrestricted access to other student records.

## Authentication boundaries

- Existing student login: username + temporary password; force password change.
- Parent login: username/email + password after invitation-based account creation (not OTP-only login).
- New-student registration: OTP to parent/guardian email, gated by admin enrollment setting.
- Staff accounts: admin-provisioned only; staff role is assigned server-side.
- OTP is not the general sign-in method for existing students or parents.
- Never trust a role, student ID, parent ID, or account type supplied by the browser.
- Every protected endpoint must validate session and authorize the requested record on the server.

## Schema version 2.0.0

The schema now expects 17 tabs.

### Updated Users headers
`UserID | Username | Email | AccountType | PasswordHash | PasswordSalt | Role | AccountStatus | EmailVerifiedAt | MustChangePassword | PasswordChangeRequired | FailedLoginCount | LockedUntil | LastLoginAt | CreatedAt | UpdatedAt`

### Updated AuthChallenges headers
`ChallengeID | Email | Purpose | CodeHash | ExpiresAt | Attempts | MaxAttempts | Status | CreatedAt | LastSentAt | StudentID | SchoolYear`

### New ParentInvitations tab
`InvitationID | StudentID | ParentEmail | Relationship | InviteCodeHash | ExpiresAt | Status | CreatedByUserID | CreatedAt | AcceptedAt | AcceptedByUserID`

### New ParentLinkRequests tab
`RequestID | StudentID | StudentUserID | ParentEmail | ParentName | Relationship | Status | SubmittedAt | ReviewedByUserID | ReviewedAt | AdminRemarks`

### Existing tabs retained
Settings, ParentProfiles, StudentProfiles, ParentStudentLinks, Applications, AdmissionRequirements, AssessmentSlots, AssessmentBookings, Messages, Notifications, StaffAccess, AuditLogs, Sessions.

## Enrollment Settings keys

Add these rows to Settings (columns are SettingKey, SettingValue, Description, IsActive, UpdatedAt, UpdatedByUserID):
- `NEW_STUDENT_ENROLLMENT_ENABLED` | `FALSE` | Controls new-student OTP registration | `TRUE`
- `NEW_STUDENT_ENROLLMENT_SCHOOL_YEAR` | blank initially | Active school year for new-student registration | `TRUE`

Only an authorized admin workflow may change these values. Do not expose these settings as public client-editable controls.

## Important implementation status

The revised `AP_Auth.gs` currently provides:
- OTP challenge creation for new-student parent-email verification, gated by enrollment settings.
- OTP challenge creation after validating a pending parent invitation.
- OTP verification bound to purpose and (where applicable) student/school year.
- OTP hashes, expiry, attempt limits, resend throttling, and a Script Properties HMAC secret.
- Logout helper for existing session records.

It does NOT yet provide production-ready username/password verification, password reset/change, admin student provisioning, parent invitation creation/acceptance, student link-request submission/review, session issuance, or a complete authenticated UI. Those must be implemented before deployment.

### Password storage security gate

Do not implement password storage using plain SHA-256 or a homemade repeated-hash loop. Apps Script Utilities does not expose a native, vetted password KDF. Before enabling username/password login, integrate a reviewed Argon2id, bcrypt, or PBKDF2 implementation/service and test it. The existing PasswordHash/PasswordSalt columns are placeholders until that decision is made. Keep peppers/secrets in Script Properties or a managed secret store, never in Sheets or GitHub.

## Installation/migration

1. Update `AP_Config.gs` and `AP_Auth.gs` from this branch in the bound Apps Script project.
2. Keep the existing tabs and back up the spreadsheet before changing headers.
3. Update the Users row-1 headers exactly to the schema above. Existing records must be migrated by matching old columns by header name; do not shift data blindly. Preserve UserID, Email, Role, AccountStatus, timestamps and existing password fields. Populate Username and AccountType through a controlled admin process. Set PasswordChangeRequired TRUE for student accounts receiving temporary passwords.
4. Update AuthChallenges row-1 headers to the 12-column schema above. Existing challenges are disposable; clear old challenge rows before migration because the purpose and extra context fields changed.
5. Add ParentInvitations and ParentLinkRequests tabs with the exact headers above.
6. Add the two Settings rows above.
7. Keep Sessions headers unchanged.
8. Run AP_healthCheck and confirm all 17 tabs are OK.
9. Do not deploy publicly. Password login, invitation acceptance, admin workflows, session issuance, and complete authorization remain unfinished.

Never put actual student data, credentials, OTPs, invitation codes, session tokens, or secrets in GitHub. No requirement uploads or payment processing/tracking are part of this portal.

## Approved password-KDF direction (2026-11-03)

The project has selected **PBKDF2-HMAC-SHA256** as its password-storage direction. This is an algorithm decision, not permission to enable password login before implementation validation.

### Required password record format

- Algorithm: PBKDF2-HMAC-SHA256.
- Work factor: target 600,000 iterations, subject to Apps Script runtime benchmarking.
- Salt: independently generated for every account, with at least 128 bits of entropy.
- Derived key: 32 bytes.
- Store the algorithm/version, iteration count, salt, and derived key in a versioned, parseable representation in the existing PasswordHash and PasswordSalt fields. Do not add spreadsheet columns solely for these parameters unless the final format requires it.
- Never store plaintext passwords. Never log passwords, salts, derived keys, OTPs, or session tokens.

### Library integration requirements

`@noble/hashes` is a candidate implementation, not yet an approved production dependency. Its current package is ESM-based, so it must be bundled into an Apps Script-compatible source file through a reproducible build. Pin the exact dependency version and integrity hash; do not load cryptographic code from a runtime CDN.

Before use:
1. Review the exact pinned release, its license, release provenance, and applicable audit scope.
2. Bundle only PBKDF2, HMAC, and SHA-256 dependencies needed by the adapter.
3. Add a thin Apps Script adapter for UTF-8 conversion, byte/base64 encoding, salt generation, and constant-time derived-key comparison.
4. Verify the adapter against independent published PBKDF2-HMAC-SHA256 test vectors, including edge cases for UTF-8 passwords and salts.
5. Benchmark the target work factor in the actual Apps Script runtime and confirm it fits execution limits under expected concurrent usage.
6. Test account creation, successful verification, incorrect-password rejection, and parameter/version parsing.
7. Keep login disabled until all checks pass.

Apps Script Utilities exposes HMAC-SHA256 and UUID helpers, but these helpers alone are not a PBKDF2 implementation. Do not replace the reviewed library with an improvised repeated-hash routine. If the bundled implementation cannot be made reliable or fast enough, use a managed authentication service instead.

### Current status (reviewed 2026-11-04)

- Algorithm direction: approved; production integration is not approved yet.
- Candidate library: `@noble/hashes@2.4.0`, exact-pinned in the lab package manifest; dependency provenance/license/audit review remains open.
- Apps Script bundle: successfully generated by GitHub Actions as a validation artifact only; it has not been copied into the portal project.
- Published test vectors: passed in Node.js and in a separate standalone Apps Script V8 project.
- Apps Script adapter: UTF-8, Base64, UUID salt adapter, record create/verify, and invalid-iteration checks passed in the isolated harness.
- Runtime benchmark: 600,000 iterations measured a latest median of about 4.321 seconds and worst sample of 6.113 seconds in a local Apps Script run; performance varies and realistic concurrency/load testing remains open.
- Salt generation: currently uses two UUIDv4 values from `Utilities.getUuid()`; the Java UUID equivalence is documented but the entropy assumption still requires security review.
- Dependency lockfile: generated by CI and included in short-lived validation artifacts, but not yet committed; reproducible dependency installation remains an open gate.
- Username/password login: NOT READY; keep disabled.
- Spreadsheet schema: unchanged; existing PasswordHash and PasswordSalt columns are retained.
- Security review: see [AP_AUTH_SECURITY_REVIEW.md](AP_AUTH_SECURITY_REVIEW.md) for unresolved OTP, invitation, enrollment, session, authorization, and deployment gates.
