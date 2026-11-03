import test from 'node:test';
import { pbkdf2Sync } from 'node:crypto';
import { derivePasswordKey } from '../src/kdf-entry.js';
import assert from 'node:assert/strict';
import { createPasswordRecord, verifyPasswordRecord, constantTimeEqual } from '../src/password-record.js';

const utf8 = (value) => new TextEncoder().encode(value);
const encode = (bytes) => Buffer.from(bytes).toString('base64');
const decode = (value) => new Uint8Array(Buffer.from(value, 'base64'));

test('creates versioned record and verifies only the correct password', () => {
  const password = utf8('Môrëh Academy 🔐');
  const salt = Uint8Array.from({ length: 32 }, (_, index) => index + 1);
  const record = createPasswordRecord(password, salt, 100000, encode);
  assert.match(record.passwordHash, /^pbkdf2-sha256\$v1\$100000\$/);
  assert.equal(record.passwordSalt, encode(salt));
  assert.equal(verifyPasswordRecord(password, record, decode), true);
  assert.equal(verifyPasswordRecord(utf8('wrong password'), record, decode), false);
});

test('rejects empty passwords on creation and verification', () => {
  const salt = new Uint8Array(32).fill(9);
  assert.throws(() => createPasswordRecord(new Uint8Array(0), salt, 100000, encode), /must not be empty/);
  const record = createPasswordRecord(utf8('valid password'), salt, 100000, encode);
  assert.throws(() => verifyPasswordRecord(new Uint8Array(0), record, decode), /must not be empty/);
});

test('rejects short salts and out-of-policy work factors on creation', () => {
  assert.throws(() => createPasswordRecord(utf8('pw'), new Uint8Array(15), 100000, encode), /16 bytes/);
  assert.throws(() => createPasswordRecord(utf8('pw'), new Uint8Array(16), 99999, encode), /Iterations/);
});

test('rejects malformed, unsupported, and tampered stored records', () => {
  const record = createPasswordRecord(utf8('pw'), new Uint8Array(32).fill(7), 100000, encode);
  for (const bad of [
    { ...record, passwordHash: 'sha256$v1$100000$AAAA' },
    { ...record, passwordHash: 'pbkdf2-sha256$v2$100000$AAAA' },
    { ...record, passwordHash: 'pbkdf2-sha256$v1$0$AAAA' },
    { ...record, passwordHash: 'pbkdf2-sha256$v1$100000$***' },
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


test('matches RFC 7914 PBKDF2-HMAC-SHA256 vector 1 (32-byte prefix)', () => {
  const actual = derivePasswordKey(utf8('passwd'), utf8('salt'), 1);
  const expected = Buffer.from(
    '55ac046e56e3089fec1691c22544b605f94185216dde0465e68b9d57c20dacbc',
    'hex'
  );
  assert.deepEqual(Buffer.from(actual), expected);
});

test('matches Node crypto for a non-ASCII UTF-8 password', () => {
  const password = utf8('Môrëh Academy 🔐');
  const salt = utf8('independent UTF-8 cross-check salt');
  const iterations = 120000;
  const actual = derivePasswordKey(password, salt, iterations);
  const expected = pbkdf2Sync(password, salt, iterations, 32, 'sha256');
  assert.deepEqual(Buffer.from(actual), expected);
});
