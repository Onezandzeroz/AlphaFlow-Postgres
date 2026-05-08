/**
 * Password hashing utility using bcryptjs
 * Replaces the insecure simpleHash() function.
 *
 * - bcrypt with 12 salt rounds for production security
 * - Backward compatibility: detects old simpleHash format and re-hashes on login
 */

import bcrypt from 'bcryptjs';

const BCRYPT_ROUNDS = 12;

/**
 * Hash a password using bcrypt
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

/**
 * Verify a password against a bcrypt hash
 * Also handles backward compatibility with old simpleHash format
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  // bcrypt hashes start with $2a$, $2b$, or $2y$
  if (hash.startsWith('$2')) {
    return bcrypt.compare(password, hash);
  }

  // Legacy simpleHash fallback — matches the old bit-shifting hash
  // If it matches, caller should re-hash the password
  const legacyHash = simpleHash(password);
  return legacyHash === hash;
}

/**
 * Check if a hash needs upgrading (is not bcrypt)
 */
export function needsRehash(hash: string): boolean {
  return !hash.startsWith('$2');
}

/**
 * Legacy hash function for backward compatibility detection
 * DO NOT use for new passwords
 */
function simpleHash(password: string): string {
  let hash = 0;
  for (let i = 0; i < password.length; i++) {
    const char = password.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(16);
}
