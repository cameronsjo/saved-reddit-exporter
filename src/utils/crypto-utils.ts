/**
 * Cryptographically secure utilities
 */

/**
 * Generates a cryptographically secure random string
 * @param length - The desired length of the random string
 * @returns A secure random string
 */
export function generateSecureRandom(length: number = 32): string {
  // Use crypto.getRandomValues for cryptographically secure random
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);

  // Convert to base36 string (0-9, a-z)
  return Array.from(array)
    .map(byte => (byte % 36).toString(36))
    .join('')
    .substring(0, length);
}

/**
 * Generates a CSRF token using cryptographically secure random
 * @returns A secure CSRF token
 */
export function generateCsrfToken(): string {
  return generateSecureRandom(32);
}
