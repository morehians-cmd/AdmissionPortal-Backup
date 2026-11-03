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
