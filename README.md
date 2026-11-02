# Admission Portal v2.0 — feature branch

This branch contains the in-progress admission approval, role-boundary, fee-reference, and Parent / Guardian access work. It is not merged to `main` and has not been deployed to Apps Script.

## Branch

`feature/admission-approval-and-hold-workflow`

## Implemented in this branch

- Application review queue and append-only approval history.
- System Admin and System Manager approval; approval sets `EnrollStatus = Enrolled` independently of documentary completeness.
- Active holds block approval unless an authorized officer explicitly provides an exception reason. The hold remains active and the exception is logged.
- Admission and Registrar Encoder account types, plus System Manager (Registrar Head). Existing Guidance, Accounting, and Academic office account types remain supported.
- Static fee reference schedule. It displays published rows only; it does not select a payment plan, compute a balance, or assess fees. Official fee assessment remains the School Cashier's responsibility.
- Verified Parent / Guardian invitation flow in `GuardianAccess.gs`. Staff send an invitation to the email already stored in the learner's `GuardEmail` field. The recipient must enter the emailed invitation reference and one-time code before a guardian account/link is created.
- Guardian accounts can view only explicitly linked learners, through a limited read-only view of enrollment/review status and documentary requirement status.

## Guardian access notes

1. Save the correct Parent / Guardian name and email in the learner record.
2. Open the learner record's Account menu and choose **Invite Parent / Guardian**.
3. The invitation is sent to the stored guardian email. The email contains an invitation reference and a one-time verification code that expires after 15 minutes.
4. The guardian opens the portal login page, chooses **Parent / Guardian? Accept an invitation**, and enters the reference and code. A first-time guardian creates a password; an existing guardian account can link another learner using its existing password.
5. The guardian signs in using the invited email address as the username.

A guardian email typed into registration does not create an account or grant access. Guardian access is read-only. Each additional learner requires a separate verified invitation.

## Financial boundary

The portal must not assess or calculate enrollment fees, refunds, or settlements. The fee schedule is reference-only. The School Cashier performs official fee assessment; any manual cancellation/refund/settlement amounts are handled by the authorized school office outside portal calculations.

## Before deployment

The following remain required:

- Test against a **copy** of the production spreadsheet, not the live student database.
- Verify sheet headers and auto-created sheets (`Approval History`, `Guardian Links`) in the test copy.
- Test each role with separate accounts: System Admin, System Manager, Admission Encoder, Registrar Encoder, legacy office accounts, Student, and Parent / Guardian.
- Test guardian invitations for correct email delivery, expiry, wrong-code limits, duplicate invitations, existing guardian accounts, and attempts to access an unlinked learner.
- Test approval with no holds, active holds without an exception, active holds with an exception reason, returned applications, incomplete requirements, and concurrent approval attempts.
- Test fee schedule display for every configured tier and confirm no client-side fee calculation or plan selection remains.
- Run Apps Script authorization and deployment checks after the test suite passes.

No merge to `main` or production deployment is authorized by these changes.
