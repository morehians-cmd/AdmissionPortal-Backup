# Install the Moreh Academy admission portal foundation

The `rebuild/clean-start` branch contains the new AP_ implementation and legacy files for reference. **Copy only AP_ files.** The `main` branch remains untouched.

## Account lifecycle schema v2.0.0
1. Back up the spreadsheet before making structural changes.
2. Update the `Users` and `AuthChallenges` headers exactly as listed in `AP_AUTH_SETUP.md`.
3. Add `ParentInvitations` and `ParentLinkRequests` tabs with the exact headers in `AP_AUTH_SETUP.md`.
4. Add the enrollment-control rows to `Settings`.
5. Preserve existing user records by migrating columns by header name, not by shifting cells.
6. Update `AP_Config.gs` and `AP_Auth.gs` in the bound Apps Script project.
7. Run `AP_healthCheck`; it should validate all 17 tabs.

## Current implementation status
The code contains the revised OTP challenge foundation for parent-email verification during new-student registration and invitation-based parent registration. The complete username/password login, password-change flow, admin account provisioning, invitation management, link-request management, session issuance, and authenticated UI are not yet complete.

Do not deploy publicly. Read `AP_AUTH_SETUP.md` for the required password-KDF security gate and migration instructions. Do not copy legacy files into the new project.

No requirement uploads or payment processing/recording/tracking. Never put real student data, passwords, OTPs, invitation codes, session tokens, or secrets in GitHub.
