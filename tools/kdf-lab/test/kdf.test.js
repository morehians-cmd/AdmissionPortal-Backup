import test from 'node:test';
import assert from 'node:assert/strict';
import { createPasswordRecord, verifyPasswordRecord, constantTimeEqual } from '../src/password-record.js';

const utf8 = (value) => new TextEncoder().encode(value);
const encode = (bytes) => Buffer.from(bytes).toString('base64');
const decode = (value) => new Uint8Array(Buffer.from(value, 'base64'));

test('creates versioned record and verifies only the correct password', () => {
  const password = utf8('Môrëh Academy 🔐');
  const salt = Uint8Array.from({ length: 32 }, (_, index) => index + 1);
  const record = createPasswordRecord(password, salt, 1200, encode);
  assert.match(record.passwordHash, /^pbkdf2-sha256\$v1\$1200\$/);
  assert.equal(record.passwordSalt, encode(salt));
  assert.equal(verifyPasswordRecord(password, record, decode), true);
  assert.equal(verifyPasswordRecord(utf8('wrong password'), record, decode), false);
});

test('rejects short salts and out-of-policy work factors on creation', () => {
  assert.throws(() => createPasswordRecord(utf8('pw'), new Uint8Array(15), 1200, encode), /16 bytes/);
  assert.throws(() => createPasswordRecord(utf8('pw'), new Uint8Array(16), 99999, encode), /Iterations/);
});

test('rejects malformed, unsupported, and tampered stored records', () => {
  const record = createPasswordRecord(utf8('pw'), new Uint8Array(32).fill(7), 1200, encode);
  for (const bad of [
    { ...record, passwordHash: 'sha256$v1$1200$AAAA' },
    { ...record, passwordHash: 'pbkdf2-sha256$v2$1200$AAAA' },
    { ...record, passwordHash: 'pbkdf2-sha256$v1$0$AAAA' },
    { ...record, passwordHash: 'pbkdf2-sha256$v1$1200$***' },
    { ...record, passwordSalt: 'not-base64' },
    { ...record, passwordHash: record.passwordHash.replace(/\$[^$]+$/, '$AAAA') }
  ]) {
    assert.throws(() => verifyPasswordRecord(utf8('pw'), bad, decode));
  }
});

test('constant-time comparator returns expected results and rejects wrong types', () => {
  assert.equal(constantTimeEqual(Uint8Array.of(1, 2, 3), Uint8Array.of(1, 2, 3)), true);
  assert.equal(constantTimeEqual(Uint8Array.of(1, 2, 3), Uint8Array.of(1, 2, 4)), false);
  assert.equal(constantTimeEqual(Uint8Array.of(1), Uint8Array.of(1, 0)), false);
  assert.throws(() => constantTimeEqual([1], [1]), /Uint8Array/);
});
