import { derivePasswordKey } from './kdf-entry.js';

const ALGORITHM = 'pbkdf2-sha256';
const VERSION = 'v1';
const KEY_BYTES = 32;
const MIN_SALT_BYTES = 16;
const MIN_ITERATIONS = 100000;
const MAX_ITERATIONS = 2000000;

function constantTimeEqual(left, right) {
  if (!(left instanceof Uint8Array) || !(right instanceof Uint8Array)) {
    throw new TypeError('Comparison values must be Uint8Array values');
  }
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

function validateBase64(value, label) {
  if (typeof value !== 'string' || value.length === 0 ||
      value.length % 4 !== 0 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new TypeError(label + ' is not valid canonical Base64');
  }
}

function createPasswordRecord(passwordBytes, saltBytes, iterations, base64Encode) {
  if (!(passwordBytes instanceof Uint8Array) || !(saltBytes instanceof Uint8Array)) {
    throw new TypeError('Password and salt must be Uint8Array values');
  }
  if (passwordBytes.length === 0) throw new RangeError('Password must not be empty');
  if (saltBytes.length < MIN_SALT_BYTES) throw new RangeError('Salt must be at least 16 bytes');
  if (!Number.isSafeInteger(iterations) || iterations < MIN_ITERATIONS || iterations > MAX_ITERATIONS) {
    throw new RangeError('Iterations must be between 100000 and 2000000');
  }
  if (typeof base64Encode !== 'function') throw new TypeError('Base64 encoder is required');

  const derivedKey = derivePasswordKey(passwordBytes, saltBytes, iterations);
  const encodedSalt = base64Encode(saltBytes);
  const encodedKey = base64Encode(derivedKey);
  validateBase64(encodedSalt, 'Salt');
  validateBase64(encodedKey, 'Derived key');
  return {
    passwordHash: [ALGORITHM, VERSION, String(iterations), encodedKey].join('$'),
    passwordSalt: encodedSalt
  };
}

function verifyPasswordRecord(passwordBytes, record, base64Decode) {
  if (!(passwordBytes instanceof Uint8Array)) throw new TypeError('Password must be Uint8Array');
  if (passwordBytes.length === 0) throw new RangeError('Password must not be empty');
  if (!record || typeof record.passwordHash !== 'string' || typeof record.passwordSalt !== 'string') {
    throw new TypeError('Password record is incomplete');
  }
  if (typeof base64Decode !== 'function') throw new TypeError('Base64 decoder is required');

  const parts = record.passwordHash.split('$');
  if (parts.length !== 4 || parts[0] !== ALGORITHM || parts[1] !== VERSION) {
    throw new TypeError('Unsupported password hash format');
  }
  if (!/^(?:[1-9][0-9]*)$/.test(parts[2])) throw new TypeError('Invalid iteration metadata');
  const iterations = Number(parts[2]);
  if (!Number.isSafeInteger(iterations) || iterations < MIN_ITERATIONS || iterations > MAX_ITERATIONS) {
    throw new RangeError('Unsupported password hash iteration count');
  }
  validateBase64(record.passwordSalt, 'Salt');
  validateBase64(parts[3], 'Derived key');

  const saltBytes = base64Decode(record.passwordSalt);
  const expectedKey = base64Decode(parts[3]);
  if (!(saltBytes instanceof Uint8Array) || saltBytes.length < MIN_SALT_BYTES) {
    throw new TypeError('Stored salt is invalid');
  }
  if (!(expectedKey instanceof Uint8Array) || expectedKey.length !== KEY_BYTES) {
    throw new TypeError('Stored derived key is invalid');
  }
  const actualKey = derivePasswordKey(passwordBytes, saltBytes, iterations);
  return constantTimeEqual(actualKey, expectedKey);
}

export {
  constantTimeEqual,
  createPasswordRecord,
  verifyPasswordRecord
};
