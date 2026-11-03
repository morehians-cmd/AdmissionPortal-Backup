import test from 'node:test';
import assert from 'node:assert/strict';
import { pbkdf2 as noblePbkdf2 } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { pbkdf2Sync as nodePbkdf2 } from 'node:crypto';

const toHex = (bytes) => Buffer.from(bytes).toString('hex');

test('RFC 7914 PBKDF2-HMAC-SHA256 vector 1', () => {
  const actual = noblePbkdf2(sha256, 'passwd', 'salt', { c: 1, dkLen: 64 });
  const expected =
    '55ac046e56e3089fec1691c22544b605' +
    'f94185216dde0465e68b9d57c20dacbc' +
    '49ca9cccf179b645991664b39d77ef31' +
    '7c71b845b1e30bd509112041d3a19783';
  assert.equal(toHex(actual), expected);
});

test('RFC 7914 PBKDF2-HMAC-SHA256 vector 2', () => {
  const actual = noblePbkdf2(sha256, 'Password', 'NaCl', { c: 80000, dkLen: 64 });
  const expected =
    '4ddcd8f60b98be21830cee5ef22701f9' +
    '641a4418d04c0414aeff08876b34ab56' +
    'a1d425a1225833549adb841b51c9b317' +
    '6a272bdebba1d078478f62b397f33c8d';
  assert.equal(toHex(actual), expected);
});

test('Noble PBKDF2 agrees with Node crypto for UTF-8 input', () => {
  const password = 'Môrëh Academy 🔐';
  const salt = 'admission-portal-test-salt';
  const iterations = 1200;
  const noble = noblePbkdf2(sha256, password, salt, { c: iterations, dkLen: 32 });
  const node = nodePbkdf2(password, salt, iterations, 32, 'sha256');
  assert.deepEqual(Buffer.from(noble), node);
});

test('invalid iteration counts are rejected', () => {
  assert.throws(
    () => noblePbkdf2(sha256, 'password', 'salt', { c: 0, dkLen: 32 }),
    /iterations/
  );
  assert.throws(
    () => noblePbkdf2(sha256, 'password', 'salt', { c: -1, dkLen: 32 }),
    /iterations/
  );
});
