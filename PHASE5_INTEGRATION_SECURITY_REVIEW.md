# Phase 5 — Integration and Security Review

Review branch: `integration/phase5-review`  
Baseline: `design/system-administrator-refresh`

## Changes in this phase

- Aligned the public homepage's primary navy and blue CSS tokens with the authenticated portal palette (`#082957` / `#245CC5`). Gold and orange accents are retained.
- Added this review note to record the inspected architecture, existing controls, and release checks without making unverified backend/security changes.

## Architecture reviewed

- Google Apps Script web app with HTML service front end.
- Google Sheets used for student and user records; Google Drive is used for stored files/images.
- `appsscript.json` currently declares `executeAs: USER_DEPLOYING` and `access: ANYONE_ANONYMOUS`.
- Core server logic is in `Code.gs`; authentication/session helpers are in `Security.gs`; personnel controls are in `StaffControl.gs`; academic-role logic is in `Academic.gs`.

## Existing security controls observed

- `Security.gs` uses per-password salts, an application pepper stored in Script Properties, iterative HMAC-SHA256 derivation, and a constant-time-style comparison helper.
- Session records are held in Script Cache and include an issue timestamp and session-version value. `who_()` checks absolute age, session version, role restrictions, and forced password-change state before refreshing the session.
- Owner-only setup and recovery helpers call `ownerOnly_()`; the setup flow generates a temporary password and requires a password change.
- `Code.gs` includes script locking around the student-record write path and validates email fields and several spreadsheet-formula-sensitive inputs.
- `StaffControl.gs` applies a system-owner gate to the staff directory operation.
- `Academic.gs` documents and implements deny-by-default, level-scoped academic-role access patterns.

These are code-inspection observations, not a penetration-test result or proof that every endpoint is correctly protected.

## Release-critical verification

Because the web app is configured for anonymous access while executing as the deploying account, every server function callable from the browser must independently validate its session and authorization. Hiding a menu item or disabling a button is not an authorization control.

Before production deployment, test the following with separate student, encoder, office, teacher/head-teacher, system-manager, and full-administrator accounts:

1. Directly invoke every server operation with no token, an invalid token, an expired token, and a token belonging to another role.
2. Confirm students can read and update only their own permitted fields and cannot change enrollment decisions, academic placement, or protected identity fields.
3. Confirm office and academic roles cannot call administrator-only functions by bypassing the UI.
4. Confirm deactivated personnel and sessions invalidated by password/role changes are rejected immediately.
5. Confirm file/image retrieval checks record ownership and authorization before returning Drive content; do not rely on an opaque Drive file ID as access control.
6. Confirm upload size, MIME type, file signature, ownership, and destination-folder restrictions on every upload path.
7. Confirm dynamic HTML output consistently escapes user-controlled values, including names, announcements, uploaded-file metadata, and report labels.
8. Confirm spreadsheet writes and CSV exports neutralize formula-leading values.
9. Confirm backup/retention jobs, audit logs, and recovery procedures work and are accessible only to authorized owners.
10. Verify the deployed Apps Script version, execution identity, sharing settings, and required OAuth scopes in the actual deployment.

## Items requiring a dedicated follow-up

- Perform a complete endpoint-by-endpoint authorization matrix for all public Apps Script functions and triggers. This review sampled the core session and role helpers; it did not exhaustively prove every endpoint.
- Trace each Drive file/photo call to its caller and verify authorization at the point of retrieval.
- Review all dynamic HTML interpolation and all file-upload handlers for context-safe escaping and validation.
- Test the deployed web app in a non-owner browser session and verify that owner-only setup/recovery functions are not exposed to anonymous callers.
- Run functional regression tests for registration, application submission, document upload, admission review, enrollment status, academic configuration, reports, and account recovery.

## Scope and deployment status

This phase makes a small public-brand consistency change and records a security review checklist. It intentionally does not change authentication, permissions, data schemas, Drive sharing, or deployment settings without a verified test plan. No merge or deployment is performed by this phase.
