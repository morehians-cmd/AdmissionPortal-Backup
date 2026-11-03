# Authentication Transaction Recovery Design

Branch: `rebuild/clean-start`
Review date: 2026-11-04
Status: design proposal; no account-creation endpoint enabled

## 1. Problem

Parent invitation acceptance spans several independent Google Sheets tabs:

1. AuthChallenges — consume the verified one-time handle.
2. Users — create the parent account.
3. ParentProfiles — create the parent profile.
4. ParentStudentLinks — link the parent to the invited student.
5. ParentInvitations — mark the invitation accepted.
6. AuditLogs — record the outcome.

A script lock serializes cooperating executions, but Sheets does not provide a multi-tab transaction. A process interruption or service error can leave some writes committed and later writes absent. Blindly retrying the full sequence can create duplicates or an inconsistent account.

## 2. Proposed journal using the existing AuditLogs tab

The current AuditLogs schema has the fields needed to hold a compact transaction journal without adding a tab:

`AuditID, ActorUserID, ActorRole, Action, EntityType, EntityID, BeforeValue, AfterValue, IPAddress, UserAgent, CreatedAt`

Proposal:
- Generate a transaction ID and all new record IDs before the first write.
- Append one journal row before mutating business records.
- Use `Action` values with a reserved prefix, such as `TXN_PARENT_INVITE_STARTED`, `TXN_PARENT_INVITE_STEP`, `TXN_PARENT_INVITE_COMMITTED`, and `TXN_PARENT_INVITE_NEEDS_REVIEW`.
- Set `EntityType` to `PARENT_INVITATION_ACCEPTANCE` and `EntityID` to the invitation ID.
- Store a versioned, minimal JSON journal payload in `AfterValue`: transaction ID, invitation ID, challenge ID, planned UserID, ParentID, LinkID, current phase, and timestamps. Do not store passwords, password hashes, OTPs, invitation codes, verification handles, session tokens, or derived keys.
- Update the journal row by its unique AuditID using `AP_updateOneLocked_` after each completed step.
- The initial journal row must be durable before any user/profile/link/invitation mutation.

This is a proposal, not an implementation. AuditLogs currently has no dedicated transaction-state columns, so the payload format must be versioned and validated strictly. Ordinary audit events and transaction journal records must be distinguishable.

## 3. Acceptance sequence with recovery markers

All steps run under one script lock, with schema checks performed before mutation:

A. Preflight (no persistent writes):
- Resolve the invitation from server-side data and validate PENDING status and expiry.
- Resolve the verification handle only after validating the invitation's email and student binding; ensure the challenge purpose and expiry are correct.
- Check for an existing user and duplicate parent/link records.
- Validate all submitted profile fields and the approved password record.
- Generate transaction, user, parent, and link IDs.
- Build the complete write plan and validate every target tab's headers.

B. Journal start:
- Append the STARTED journal record with all planned IDs and phase `PREPARED`.
- If this append fails, stop; do not mutate business records.

C. Consume verification:
- Consume the challenge with `AP_authResolveVerificationHandleLocked_`.
- Update journal phase to `CHALLENGE_CONSUMED`.
- If the challenge was consumed but the phase update fails, recovery checks the challenge row by ID and verifies its status before deciding what happened.

D. Create records:
- Append exactly one Users row; update journal phase.
- Append exactly one ParentProfiles row; update journal phase.
- Append exactly one ParentStudentLinks row; update journal phase.
- Mark the invitation ACCEPTED; update journal phase.
- Append the final ordinary audit event and mark the journal COMMITTED.

E. Response:
- Return success only after the committed marker is persisted.
- If a later journal update fails, do not guess. Treat the transaction as uncertain and require recovery inspection.

## 4. Recovery rules

Recovery must be idempotent and must use the planned IDs from the STARTED journal row.

- `PREPARED`: no business writes should have occurred. Confirm this by checking all planned IDs and challenge state before marking ABORTED or allowing a controlled retry.
- `CHALLENGE_CONSUMED`: verify the challenge is consumed and inspect each planned business ID. Do not reuse the handle. Resume only if all preconditions and remaining steps can be safely proven; otherwise mark NEEDS_REVIEW.
- Any record-creation phase: inspect every planned ID across all affected tabs. If a planned record exists, verify its immutable ownership/binding fields before considering the step complete. Never append a second row for an existing planned ID.
- Invitation accepted but journal not committed: verify the user, profile, link, invitation, and audit event all agree; then finalize the journal if the state is complete. Otherwise mark NEEDS_REVIEW.
- `NEEDS_REVIEW`: no automated retries. An authorized administrator reconciles the state and records the resolution.

No recovery action may attach an existing parent account to a student merely because the email matches. That must be a separate explicit, authorized linking workflow.

## 5. Failure-injection test plan

Build a fake-sheet harness that injects an exception:
- before journal creation;
- after journal creation;
- after challenge consumption;
- after each of Users, ParentProfiles, ParentStudentLinks, and ParentInvitations writes;
- during the final audit write;
- during each journal phase update.

For each failure point, assert:
- no duplicate planned IDs are appended;
- invitation state and challenge state are discoverable;
- the journal accurately identifies the last confirmed phase or is treated as uncertain;
- retry does not blindly repeat a completed append;
- no success response is returned before COMMITTED;
- secrets and credentials never appear in the journal.

Also test two concurrent attempts using the same invitation and verification handle. Exactly one attempt may consume the challenge and progress.

## 6. Important limitation

A journal update can itself fail after a business write. Therefore the journal's last phase is not definitive proof that the preceding write failed. Recovery must inspect the target tabs by their pre-generated IDs. The journal is a recovery index, not a substitute for checking actual sheet state.

If the existing AuditLogs structure proves insufficient for operational recovery or retention, propose a dedicated transaction table as a separately reviewed schema migration. Do not silently change the 17-tab schema.

## 7. Security and operational gates

- Do not implement account creation until PBKDF2 dependency, salt generation, reproducible build, and runtime/load review are approved.
- Do not expose a recovery function to anonymous callers. Recovery is administrator-only and must have server-side authorization.
- Do not log OTPs, invitation codes, verification handles, passwords, password hashes, salts, or session tokens.
- Keep public deployment disabled while session validation and protected endpoint authorization are incomplete.
- Do not use the live admission spreadsheet for failure-injection tests. Use a separate Apps Script project with fake in-memory sheets.

## 8. Spreadsheet impact

No spreadsheet changes are proposed at this stage. This design uses existing AuditLogs fields as a journal proposal. A dedicated transaction tab or schema change requires a separate decision and approval before implementation.
