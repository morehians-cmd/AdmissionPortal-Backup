# Authentication Transaction Design

Branch: `rebuild/clean-start`  
Review date: 2026-11-04  
Status: implementation plan; no public workflow enabled

## Purpose

Define the transaction boundaries for parent-invitation acceptance and new-student registration before adding account-creation endpoints. The existing one-time verification-handle primitive has passed 10/10 isolated Apps Script tests. That result validates the tested helper behavior only; it does not validate a complete registration transaction.

## Shared transaction rules

1. Every transaction that consumes a verification handle and changes an invitation, account, profile, link, or application must run under one `LockService.getScriptLock()` critical section.
2. Avoid nested lock acquisition. Refactor the current handle consumer into:
   - a lock-held internal resolver that validates and consumes a handle but does not acquire/release a lock; and
   - a wrapper for standalone callers that acquires/releases the script lock.
3. A lock-held resolver must re-read the challenge row inside the transaction and verify challenge ID, expected purpose, VERIFIED status, and original expiry immediately before setting CONSUMED.
4. All authorization inputs (invitation ID, student ID, role, account type, relationship, school year) must be derived from trusted server-side records or validated against them. Never accept browser-supplied role or linkage IDs as authority.
5. Validate all inputs and preconditions before the first persistent write. Where Apps Script/Sheets cannot provide a true multi-row database transaction, record enough before/after state to detect partial failure, and design a safe compensating/recovery path. Do not claim database atomicity merely because a script lock is used.
6. Append an audit event for successful material changes, without recording passwords, OTPs, invitation codes, session tokens, or derived keys.
7. Return only a minimal success response to the browser. Never return internal verification context, raw tokens, or full sheet rows.

## Parent invitation acceptance — required sequence

Preconditions:
- The invitation is found by its server-side identifier or a hash-verified invitation code.
- Invitation status is PENDING and ExpiresAt is in the future.
- The verified challenge purpose is PARENT_INVITATION_VERIFY.
- The challenge email exactly matches the normalized ParentEmail on the invitation.
- The challenge's StudentID matches the invitation's StudentID.
- The requested relationship matches the invitation's stored Relationship; the browser cannot override it.
- Password KDF integration has passed its separate security and runtime gates before account creation is enabled.

Transaction sequence under one script lock:
1. Re-read invitation and challenge rows.
2. Revalidate invitation status, expiry, email, student ID, and relationship.
3. Resolve and consume the verification handle using the lock-held helper.
4. Check for an existing account with the normalized email/unique username; do not silently attach an existing identity to a new student.
5. Validate the password record using the approved KDF adapter before any writes.
6. Create the parent User and ParentProfile, then create the ParentStudentLink using server-derived IDs and invitation relationship.
7. Mark the invitation ACCEPTED with AcceptedAt and AcceptedByUserID.
8. Append the audit record.
9. Return a generic completion response.

Failure and recovery:
- If any write fails after the first write, do not report success. Record or surface a recoverable transaction failure for controlled administrator reconciliation.
- The transaction must be idempotent: retrying the same invitation must never create a second account, profile, or link.
- A consumed challenge must not be reusable. Recovery must be an explicit admin-controlled re-invitation or reconciliation process, not a browser-side replay.

## New-student registration — required sequence

Preconditions:
- Enrollment is enabled for the exact requested school year at completion time.
- The selected school year equals the currently configured enrollment school year.
- The verified challenge purpose is NEW_STUDENT_PARENT_VERIFY.
- The challenge email matches the normalized parent/guardian email submitted with the registration.
- The challenge's SchoolYear equals the exact selected school year.
- The registration payload passes server-side validation and duplicate checks.

Transaction sequence under one script lock:
1. Re-read enrollment settings and challenge row.
2. Recheck enrollment enabled and exact school year; OTP issuance-time settings are not sufficient.
3. Resolve and consume the verification handle using the lock-held helper.
4. Verify challenge email and school year against the submitted registration context.
5. Validate all student, parent/guardian, and application fields; reject client-supplied IDs and status/decision fields.
6. Check duplicate/active registration rules for the same student and school year.
7. Create the StudentProfile, initial Application, and required AdmissionRequirements rows using server-generated IDs and approved defaults.
8. Append an audit record.
9. Return only a registration reference and generic next-step instructions; do not create a portal login or grant access unless a separate approved account workflow does so.

Failure and recovery:
- A school-year closure/change between OTP request and completion must reject completion.
- Replays must not create duplicate students or applications.
- If Sheets writes partially succeed, detect the partial state and route it to a controlled reconciliation path. Do not silently retry all appends.

## Required tests before enabling either workflow

- Correct handle, email, purpose, student ID, relationship, and school year.
- Replayed, expired, malformed, and tampered handles.
- Wrong invitation email, wrong student, wrong relationship, expired invitation, accepted invitation, and duplicate account.
- Enrollment disabled after OTP issuance; school year changed after OTP issuance; challenge school year mismatch.
- Two concurrent acceptance/registration attempts for the same invitation or registration identity.
- Injected write failure at every persistence step and verified recovery behavior.
- Browser attempts to submit a different student ID, role, account type, relationship, school year, status, or decision.
- Verify that no response or log contains password material, OTPs, invitation codes, verification handles, or session tokens.

## Current implementation boundary

The current code has a one-time verification-handle consumer that acquires its own script lock. It is not yet suitable for composition inside a larger transaction without the lock-held refactor above. Parent account creation also remains blocked on production approval of the PBKDF2 dependency, salt generation, reproducible build, and realistic runtime/load behavior.

No invitation-acceptance or new-student-registration endpoint should be exposed until the required transaction helpers, persistence/recovery design, authorization, and tests are complete.

## Spreadsheet impact

No spreadsheet changes are currently required. The existing schema contains the invitation, challenge, user, parent profile, student profile, parent-student link, application, requirements, settings, and audit fields needed for this design. Revisit the schema only if implementation identifies a concrete missing field.
