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

- RFC 7914 PBKDF2-HMAC-SHA256 known-answer vectors (1 and 80,000 iterations)
- UTF-8 cross-check against Node.js `crypto.pbkdf2Sync`
- Invalid KDF input rejection
- Versioned password record serialization using existing PasswordHash / PasswordSalt fields
- Correct-password and wrong-password verification
- Strict algorithm/version/iteration/Base64/length validation
- Constant-time byte comparison behavior

## Not covered yet

- Cryptographically secure salt generation in Apps Script
- Apps Script Base64 and UTF-8 adapter compatibility (harness added; must be run manually in isolated GAS project)
- Full Apps Script record creation/verification integration
- Account creation, login, reset, session issuance, or migration

The storage format is currently:
- `PasswordHash`: `pbkdf2-sha256$v1$<iterations>$<base64-derived-key>`
- `PasswordSalt`: Base64-encoded random salt bytes (minimum 16 bytes; target 32 bytes)

The isolated Apps Script harness now tests a 32-byte salt adapter made by concatenating two UUIDv4 values from `Utilities.getUuid()`. Apps Script documents this method as equivalent to Java `UUID.randomUUID()`, and Java documents that method as using a cryptographically strong pseudorandom number generator. This is a documented-equivalence assumption, not an independent certification of Google's implementation; the harness validates UUIDv4 shape and distinct outputs but cannot prove entropy. A security review must approve this assumption before production use. Do not substitute `Math.random()`, timestamps, or predictable values for salt generation.\n\nThe 600,000 iteration setting remains provisional. The parser accepts 100,000 through 2,000,000 iterations to allow explicit future migration policy; creation must use the configured approved work factor. No login endpoint should call this module yet.

Do not enable authentication based on these lab tests alone.


## Google Apps Script compatibility check

A separate, non-production harness is provided at `gas/AP_KdfCompatibilityTest.gs`.

1. Wait for the GitHub Actions run to pass and download its `kdf-lab-validation` artifact.
2. Extract `dist/AP_KdfBundle.gs` from the ZIP.
3. Create a **new, empty standalone Apps Script project** at [script.google.com](https://script.google.com). Do not use the live admission portal project or its spreadsheet-bound script.
4. Add the contents of `AP_KdfBundle.gs` as one script file and the contents of `gas/AP_KdfCompatibilityTest.gs` as another.
5. Select and run `runKdfCompatibilityTests`, authorize the test project if prompted, and inspect the execution log.
6. Send the complete JSON report, including benchmark timings, for review.

The compatibility harness checks published KDF vectors, UTF-8 conversion, key length, invalid iteration rejection, and preliminary performance. It does not generate production salts, store passwords, create sessions, or change admission data. Do not connect this test project to the admission spreadsheet.

The benchmark is preliminary. We will assess whether 600k iterations is operationally practical after seeing the actual Apps Script timings. No authentication code should be enabled from this test alone.
