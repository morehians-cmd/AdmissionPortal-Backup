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
