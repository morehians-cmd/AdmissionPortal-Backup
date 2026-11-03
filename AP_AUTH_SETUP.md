# Email OTP authentication setup

This is the first authentication foundation for the Moreh Academy Admission Portal. It supports sign-in for **existing, pre-provisioned ACTIVE users only**. It does not provide public registration, password login, staff provisioning, or a finished sign-in UI.

## Files to copy into the bound Apps Script project

Copy/update these files from this branch:
- Update `AP_Config.gs` (schema version 1.1.0; adds two tabs).
- Add `AP_Auth.gs`.
- Keep `AP_Database.gs`, `AP_Web.gs`, and `AP_Index.html`.

Do not copy legacy files from the repository.

## Spreadsheet changes required

Create two new tabs with these exact names and row-1 headers. Do not add extra columns.

### AuthChallenges
`ChallengeID | Email | Purpose | CodeHash | ExpiresAt | Attempts | MaxAttempts | Status | CreatedAt | LastSentAt`

### Sessions
`SessionID | UserID | TokenHash | CreatedAt | ExpiresAt | LastSeenAt | RevokedAt | UserAgent`

Keep the existing 13 tabs unchanged. The schema health check will now expect 15 tabs.

## Configure the authentication secret

1. In Apps Script, add the new `AP_Auth.gs` file and update `AP_Config.gs`.
2. Save the project.
3. Select `AP_setupAuthSecret` and run it once.
4. Approve the requested Apps Script authorization.
5. Confirm the function reports that the authentication secret is configured. The secret is stored in Script Properties; never put it in the spreadsheet or GitHub.

## Provision a test account

The sign-in endpoint intentionally works only for a pre-existing row in `Users` where `AccountStatus` is exactly `ACTIVE` (case-insensitive). Do not make the public registration flow available yet. Provision test accounts only through a trusted administrator process and use an address you control.

## Current server functions

- `AP_requestEmailOtp(email)`: sends an eight-character, ten-minute code to an active account. It applies a 60-second resend delay and a maximum of three requests per email per hour.
- `AP_verifyEmailOtp(email, code)`: checks the latest pending code, allows up to five attempts, then creates an eight-hour session.
- `AP_getSessionUser(token)`: validates the token and reloads the user's current role/status from the server-side database.
- `AP_logout(token)`: revokes the session.
- `AP_healthCheck()`: validates the 15-tab schema.

OTP values are not stored in plaintext. Session tokens are returned once to the calling client; store them only in session-scoped client memory/storage and never log them.

## Important deployment limitations

- Do not deploy publicly yet. The UI is not wired to these endpoints.
- No self-service registration, guardian linking, email-change flow, staff invitation, account recovery, or admin role-management UI is implemented.
- Do not trust a role sent by the browser. Every future data operation must validate the session and authorize the requested action server-side.
- Add broader abuse controls, operational monitoring, privacy/retention rules, and security testing before production.
- Apps Script email quotas and account restrictions apply. Test delivery with school-controlled accounts.
- Apps Script does not provide a reliable client IP address to this implementation; no IP-based rate limit is claimed.
- Never store real student information, OTPs, session tokens, or secrets in GitHub.
