# Password KDF lab

This is an isolated Node.js test/build workspace. It is not imported by the Apps Script application and does not enable login.

## Pinned inputs

- Node.js: 22.16.0 or newer
- `@noble/hashes`: 2.4.0
- `esbuild`: 0.25.12

Both npm package versions are exact pins. A committed `package-lock.json` is still required before this workspace can be called fully reproducible. The repository workflow `.github/workflows/kdf-lab.yml` currently generates a lockfile inside its clean runner, runs the tests/build, and uploads the lockfile and bundle as a short-lived validation artifact. It does not commit the lockfile or deploy the bundle.

## First local setup

From this directory:

```sh
npm install --package-lock-only
npm ci
npm test
npm run build
```

Review and commit the generated `package-lock.json` after verifying its registry integrity fields. Do not use `npm install` in place of `npm ci` for subsequent clean builds.

The build output is written to `dist/AP_KdfBundle.gs`. The generated bundle is intentionally not committed or copied into Apps Script yet. The GitHub Actions workflow uploads it for inspection only.

## Current test coverage

- RFC 7914 PBKDF2-HMAC-SHA256 known-answer vector (1 iteration)
- RFC 7914 PBKDF2-HMAC-SHA256 known-answer vector (80,000 iterations)
- UTF-8 cross-check against Node.js `crypto.pbkdf2Sync`
- Invalid iteration count rejection

## Not covered yet

- Apps Script V8 compatibility and runtime benchmark
- Cryptographically secure salt generation in Apps Script
- Constant-time comparison adapter
- Versioned storage serialization and parsing
- Account creation, login, reset, or migration

Do not enable authentication based on these Node.js tests alone.


## Google Apps Script compatibility check

A separate, non-production harness is provided at `gas/AP_KdfCompatibilityTest.gs`.

1. Wait for the GitHub Actions run to pass and download its `kdf-lab-validation` artifact.
2. Extract `dist/AP_KdfBundle.gs` from the ZIP.
3. Create a **new, empty standalone Apps Script project** at [script.google.com](https://script.google.com). Do not use the live admission portal project or its spreadsheet-bound script.
4. Add the contents of `AP_KdfBundle.gs` as one script file and the contents of `gas/AP_KdfCompatibilityTest.gs` as another.
5. Select and run `runKdfCompatibilityTests`, authorize the test project if prompted, and inspect the execution log.
6. Send the complete JSON report, including benchmark timings, for review.

The harness checks a published known-answer vector, a UTF-8 test vector, key length, rejection of zero iterations, and one timing sample at 100k, 300k, and 600k iterations. It does not generate production salts, store passwords, create sessions, or change any admission data. Do not connect this test project to the admission spreadsheet.

The benchmark is preliminary. We will assess whether 600k iterations is operationally practical after seeing the actual Apps Script timings. No authentication code should be enabled from this test alone.
