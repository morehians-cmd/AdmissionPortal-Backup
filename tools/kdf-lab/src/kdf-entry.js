import { pbkdf2 } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';

// The Apps Script adapter must convert text to UTF-8 bytes with Utilities.
// Keeping this entry point byte-only avoids relying on TextEncoder in GAS.
function derivePasswordKey(passwordBytes, saltBytes, iterations) {
  if (!(passwordBytes instanceof Uint8Array) || !(saltBytes instanceof Uint8Array)) {
    throw new TypeError('passwordBytes and saltBytes must be Uint8Array values');
  }
  if (!Number.isSafeInteger(iterations) || iterations < 1) {
    throw new RangeError('iterations must be a positive safe integer');
  }
  return pbkdf2(sha256, passwordBytes, saltBytes, { c: iterations, dkLen: 32 });
}

export { derivePasswordKey };
