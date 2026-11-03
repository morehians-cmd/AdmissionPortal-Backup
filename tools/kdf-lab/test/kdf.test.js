import test from 'node:test';
import assert from 'node:assert/strict';
import { derivePasswordKey } from '../src/kdf-entry.js';
import { pbkdf2 as noblePbkdf2 } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { pbkdf2Sync as nodePbkdf2 } from 'node:crypto';

const utf8 = (value) => new TextEncoder().encode(value);
const toHex = (bytes) => Buffer.from(bytes).toString('hex');

test('RFC 7914 PBKDF2-HMAC-SHA256 vector 1', () => {
  const actual = noblePbkdf2(sha256, utf8('passwd'), utf8('salt'), { c: 1, dkLen: 64 });
  const expected =
    '55ac046e56e3089fec1691c22544b605' +
    'f94185216dde0465e68b9d57c20dacbc' +
    '49ca9cccf179b645991664b39d77ef31' +
    '7c71b845b1e30bd509112041d3a19783';
  assert.equal(toHex(actual), expected);
});

test('RFC 7914 PBKDF2-HMAC-SHA256 vector 2', () => {
  const actual = noblePbkdf2(sha256, utf8('Password'), utf8('NaCl'), { c: 80000, dkLen: 64 });
  const expected =
    '4ddcd8f60b98be21830cee5ef22701f9' +
    '641a4418d04c0414aeff08876b34ab56' +
    'a1d425a1225833549adb841b51c9b317' +
    '6a272bdebba1d078478f62b397f33c8d';
  assert.equal(toHex(actual), expected);
});

test('byte-only adapter agrees with Node crypto for UTF-8 input', () => {
  const password = utf8('Môrëh Academy 🔐');
  const salt = utf8('admission-portal-test-salt');
  const iterations = 1200;
  const actual = derivePasswordKey(password, salt, iterations);
  const expected = nodePbkdf2(password, salt, iterations, 32, 'sha256');
  assert.deepEqual(Buffer.from(actual), expected);
  assert.equal(actual.length, 32);
});

test('invalid inputs and iteration counts are rejected', () => {
  assert.throws(() => derivePasswordKey('password', utf8('salt'), 1), /Uint8Array/);
  assert.throws(() => derivePasswordKey(utf8('password'), utf8('salt'), 0), /iterations/);
  assert.throws(() => derivePasswordKey(utf8('password'), utf8('salt'), -1), /iterations/);
});
