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

- Salt generation produces at least 16 cryptographically random bytes. The current Apps Script lab adapter concatenates two UUIDv4 values from `Utilities.getUuid()` to form 32 bytes. Apps Script documents this method as equivalent to Java `UUID.randomUUID()`, whose Java contract specifies a cryptographically strong pseudorandom number generator. Treat this as a documented-equivalence assumption requiring security review; the smoke test does not prove entropy or certify Google's implementation.
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


## Preliminary Apps Script measurement (2026-11-03)

A user-run test in a separate Google Apps Script V8 project reported:

| Iterations | Single observed run |
|---:|---:|
| 100,000 | 468 ms |
| 300,000 | 1,441 ms |
| 600,000 | 2,816 ms |

All three compatibility checks passed in that run: RFC 7914 vector 1 (32-byte prefix), UTF-8 byte conversion/derived-key length, and rejection of zero iterations.

This is one sample per work factor, not a production benchmark. It is encouraging evidence that the 600,000-iteration target is technically feasible in the tested Apps Script runtime, but it does not establish median/worst-case latency, concurrency behavior, or production suitability. The target remains provisional.

The Apps Script harness has been updated to warm up each work factor and collect five samples, reporting median and worst observed time. Run the updated harness in the same isolated test project and provide the complete JSON report before approving the work factor.


### Repeated Apps Script benchmark results (2026-11-03)

The updated harness was run in the isolated Apps Script V8 project. All three compatibility checks passed again.

| Iterations | Samples (ms) | Median | Worst |
|---:|---|---:|---:|
| 100,000 | 607, 630, 597, 551, 573 | 597 ms | 630 ms |
| 300,000 | 1,845, 1,758, 1,910, 1,895, 1,825 | 1,845 ms | 1,910 ms |
| 600,000 | 3,864, 3,677, 3,884, 3,843, 3,746 | 3,843 ms | 3,884 ms |

Across these five samples per work factor, 600,000 iterations took a median of approximately 3.84 seconds and a worst observed time of approximately 3.88 seconds. This is a useful repeatability check, but it is still a single test session on one Apps Script project. It does not measure concurrent login load, cold starts, service contention, or execution quotas.

**Decision:** retain 600,000 iterations as the provisional target for further design and testing. Do not yet call it production-approved. A roughly four-second derivation may be noticeable to users and must be assessed in the complete login flow and under realistic load. Do not reduce the work factor without a documented security review.


### Apps Script adapter and password-record results (2026-11-03)

The expanded harness was run in the isolated Google Apps Script V8 project. All six tests passed:

- RFC 7914 PBKDF2-HMAC-SHA256 vector 1 (32-byte prefix)
- UTF-8 conversion and 32-byte derived-key length
- Apps Script Base64 adapter round-trip, including high-bit byte values
- UUIDv4 salt adapter returned distinct 32-byte values in the smoke test
- Versioned record creation and verification through the Apps Script adapters; correct password accepted and wrong password rejected
- Invalid KDF iteration count rejected

The salt smoke test confirms output shape and that two sampled salts differed. It is not an entropy test and does not prove the underlying random-number generator's security. The two-UUID construction remains subject to review of the documented-equivalence assumption above.

Latest five-sample timing report:

| Iterations | Samples (ms) | Median | Worst |
|---:|---|---:|---:|
| 100,000 | 467, 531, 572, 565, 534 | 534 ms | 572 ms |
| 300,000 | 1,374, 1,744, 1,677, 1,967, 2,377 | 1,744 ms | 2,377 ms |
| 600,000 | 7,973, 3,645, 3,083, 3,197, 3,485 | 3,485 ms | 7,973 ms |

The 600,000-iteration median is approximately 3.49 seconds, but the observed 7.97-second outlier is significant. Compared with the prior five-sample session, the median is in a similar range while the worst observed time is substantially higher. This reinforces that the runtime has variability and that a single local session is insufficient to establish a predictable login latency.

**Decision:** retain 600,000 iterations as a provisional security target, not a production approval. Before final adoption, repeat tests across multiple sessions/days and assess full login latency, concurrency, Apps Script quotas, and user experience. Do not reduce the work factor merely to improve speed; if the latency is unacceptable, review the authentication architecture or a managed authentication service.


### Apps Script adapter and password-record results — follow-up run (2026-11-03)

A further run of the expanded harness in the isolated Google Apps Script V8 project again passed all six functional tests:

- RFC 7914 PBKDF2-HMAC-SHA256 vector 1 (32-byte prefix)
- UTF-8 conversion and 32-byte derived-key length
- Apps Script Base64 adapter round-trip
- UUIDv4 salt adapter produced distinct 32-byte salts in the smoke test
- Versioned password-record creation and verification using the Apps Script adapters
- Invalid iteration count rejected

Latest five-sample timing report:

| Iterations | Samples (ms) | Median | Worst |
|---:|---|---:|---:|
| 100,000 | 512, 462, 516, 546, 535 | 516 ms | 546 ms |
| 300,000 | 1,381, 1,461, 1,390, 1,272, 1,372 | 1,381 ms | 1,461 ms |
| 600,000 | 3,075, 2,934, 3,630, 3,403, 2,965 | 3,075 ms | 3,630 ms |

In this session, 600,000 iterations had a median of approximately 3.08 seconds and a worst observed time of 3.63 seconds. This is faster and less variable than the immediately preceding session (3.49-second median and 7.97-second worst sample). Across sessions, the timing still varies, so these results are evidence of feasibility rather than a production latency guarantee.

**Decision:** keep 600,000 iterations as the provisional target. The functional tests and repeated local timing runs are encouraging, but production approval remains blocked on independent review of the salt-generation assumption, dependency/build provenance and generated bundle, full authentication-flow testing, and realistic concurrency/quota/user-experience testing. Do not lower the work factor solely to improve latency.

The harness ran in a separate Apps Script project. No live portal code or spreadsheet was changed by this test.


### Apps Script adapter and password-record results — additional follow-up run (2026-11-04)

A further run of the expanded harness in the isolated Google Apps Script V8 project again passed all six functional tests:

- RFC 7914 PBKDF2-HMAC-SHA256 vector 1 (32-byte prefix)
- UTF-8 conversion and 32-byte derived-key length
- Apps Script Base64 adapter round-trip
- UUIDv4 salt adapter produced distinct 32-byte salts in the smoke test
- Versioned password-record creation and verification using the Apps Script adapters
- Invalid iteration count rejected

Latest five-sample timing report:

| Iterations | Samples (ms) | Median | Worst |
|---:|---|---:|---:|
| 100,000 | 660, 1,151, 798, 771, 911 | 798 ms | 1,151 ms |
| 300,000 | 1,884, 1,623, 1,741, 1,653, 2,536 | 1,741 ms | 2,536 ms |
| 600,000 | 4,194, 4,402, 6,113, 4,321, 3,888 | 4,321 ms | 6,113 ms |

The latest 600,000-iteration median is approximately 4.32 seconds, with a worst observed sample of 6.11 seconds. All six functional checks passed, but timing variation across sessions remains material. These local measurements do not establish production capacity, concurrent-login performance, or quota safety.

**Decision:** retain 600,000 iterations as a provisional security target, not a production approval. The repeated runs support technical compatibility, while the variable latency requires full login-flow and realistic concurrency/quota/user-experience testing. The salt-generation assumption, dependency/build provenance, and generated bundle still require independent review. Do not reduce the work factor solely to improve latency.

The harness ran in a separate Apps Script project. No live portal code or spreadsheet was changed by this test.
