# Install the clean GAS foundation

The repository branch still contains legacy source files as historical reference. **Do not copy the legacy `.gs` or `.html` files into the new Apps Script project.** The legacy implementation remains available on `main`.

## New Apps Script project
1. Open the new database spreadsheet and choose Extensions → Apps Script.
2. In that new, bound Apps Script project, create/copy only these files from `rebuild/clean-start`: `AP_Config.gs`, `AP_Database.gs`, `AP_Web.gs`, and `AP_Index.html`.
3. Save the project.
4. Select `AP_healthCheck` in the function selector, run it, and approve the Google authorization prompt.
5. Confirm all 13 sheets return `OK`. The check is read-only and does not alter spreadsheet contents.
6. Do not deploy publicly yet. Authentication, role enforcement, input validation, and audit integration are not implemented.

The spreadsheet ID is configured in `AP_Config.gs`. The app uses `SpreadsheetApp.openById`, not active spreadsheet context.

## Product boundaries
No requirement-file uploads and no payment collection/recording/tracking. Payments remain in the official school system. Do not put real student data or secrets in GitHub.
