# Password KDF Validation Plan

Status: validation plan only. No password-hashing code is enabled by this document.

## Scope

This plan validates the approved password-KDF direction for the Apps Script admission portal:

- PBKDF2-HMAC-SHA256
- Target work factor: 600,000 iterations (must be benchmarked in Apps Script before adoption)
- Derived key: 32 bytes
- Per-account random salt: at least 16 bytes (128 bits)
- UTF-8 password encoding
- Versioned stored representation using the existing `Users.PasswordHash` and `Users.PasswordSalt` fields

## Upstream candidate under review

Candidate only: `@noble/hashes@2.4.0`.

Reviewed upstream source:
- `src/pbkdf2.ts` exports synchronous `pbkdf2(hash, password, salt, { c, dkLen })`.
- String password and salt inputs are converted to UTF-8 bytes.
- The PBKDF2 implementation follows RFC 2898 / RFC 8018.
- Package metadata identifies the package as MIT licensed, zero-dependency, and ESM (`type: module`).
- Package metadata declares Node.js >=20.19.0 for its development environment.

This is not a security certification or approval of the dependency. Before pinning it, review the exact release provenance, license, audit scope, transitive/build dependencies, and generated bundle. Do not load the library from a runtime CDN.

## Required independent known-answer tests

Use RFC 7914, Appendix B PBKDF2-HMAC-SHA256 test vectors (also present in the candidate's upstream KDF test suite).

Vector 1:
- Password (UTF-8): `passwd`
- Salt (UTF-8): `salt`
- Iterations: `1`
- Derived-key length: `64` bytes
- Expected derived key (hex):

```
55ac046e56e3089fec1691c22544b605
f94185216dde0465e68b9d57c20dacbc
49ca9cccf179b645991664b39d77ef31
7c71b845b1e30bd509112041d3a19783
```

Vector 2:
- Password (UTF-8): `Password`
- Salt (UTF-8): `NaCl`
- Iterations: `80000`
- Derived-key length: `64` bytes
- Expected derived key (hex):

```
4ddcd8f60b98be21830cee5ef22701f9
641a4418d04c0414aeff08876b34ab56
a1d425a1225833549adb841b51c9b317
6a272bdebb a1d078478f62b397f33c8d
```

The vector above must be normalized by removing whitespace before comparison. For production-format tests, also verify the first 32 bytes when using a 32-byte derived key. Add at least one UTF-8 non-ASCII password test with expected output generated independently by a second implementation.

## Required adapter and storage tests

- Salt generation produces 16 or more cryptographically random bytes; do not assume `Utilities.getUuid()` alone is a cryptographic random source without a documented guarantee.
- Password and salt encoding is UTF-8 and deterministic.
- Derived output is exactly 32 bytes.
- Stored metadata identifies algorithm, version, iteration count, and encoding unambiguously.
- Verification rejects malformed, truncated, unknown-version, and unsupported-iteration records safely.
- Verification returns false for a wrong password and true only for the matching password.
- Comparison uses a constant-time byte comparison.
- Passwords, salts, derived keys, OTPs, and session tokens never appear in logs.
- Tests cover empty/long inputs and Unicode edge cases according to the chosen password policy.

## Build and release controls

Before committing a generated Apps Script bundle:

1. Pin the exact dependency version and lockfile integrity; do not use a floating semver range.
2. Build from a clean checkout using the lockfile.
3. Record the build command, tool versions, source entry points, and generated artifact hash.
4. Bundle only the required PBKDF2, HMAC, and SHA-256 code plus necessary internal helpers.
5. Inspect the generated bundle for unexpected imports, network access, dynamic code execution, or unrelated algorithms.
6. Keep original dependency sources, license notices, and build configuration in the repository.
7. Rebuild twice from clean installs and confirm byte-identical output.

## Apps Script runtime gate

The library must be benchmarked in the actual Apps Script V8 runtime, not just Node.js.

Measure password derivation at 100,000, 300,000, and 600,000 iterations with representative password lengths. Record median and worst observed runtime across repeated executions. Confirm the operation stays within the portal's execution and user-experience budgets under realistic load.

If 600,000 iterations is not reliable in Apps Script, do not silently lower the work factor. Reassess the authentication architecture or use a managed authentication service.

## Release gate

Do not enable password creation, login, password reset, or account provisioning until:

- The dependency/version and build are pinned and reviewed.
- Independent known-answer tests pass.
- Adapter, storage-format, and negative tests pass.
- The Apps Script runtime benchmark passes.
- A reviewer inspects the final generated bundle.

No spreadsheet schema change is expected: the current `Users` sheet already has `PasswordHash` and `PasswordSalt`. The final serialized format must be confirmed before implementation; add columns only if a genuine schema need is identified.
