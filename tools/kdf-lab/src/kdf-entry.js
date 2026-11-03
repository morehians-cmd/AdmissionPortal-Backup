import { pbkdf2 } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';

// Narrow bundle entry point. Salt generation, storage, and Apps Script adapters
// are deliberately excluded until their security properties are separately reviewed.
function derivePasswordKey(password, salt, iterations) {
  if (typeof password !== 'string' || typeof salt !== 'string') {
    throw new TypeError('password and salt must be UTF-8 strings');
  }
  if (!Number.isSafeInteger(iterations) || iterations < 1) {
    throw new RangeError('iterations must be a positive safe integer');
  }
  return pbkdf2(sha256, password, salt, { c: iterations, dkLen: 32 });
}

export { derivePasswordKey };
