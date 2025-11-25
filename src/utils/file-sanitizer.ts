/**
 * File name sanitization utilities for cross-platform compatibility
 */

// Windows reserved filenames
const WINDOWS_RESERVED_NAMES: ReadonlyArray<string> = [
  'CON',
  'PRN',
  'AUX',
  'NUL',
  'COM1',
  'COM2',
  'COM3',
  'COM4',
  'COM5',
  'COM6',
  'COM7',
  'COM8',
  'COM9',
  'LPT1',
  'LPT2',
  'LPT3',
  'LPT4',
  'LPT5',
  'LPT6',
  'LPT7',
  'LPT8',
  'LPT9',
] as const;

// Maximum filename length (conservative for all platforms)
const MAX_FILENAME_LENGTH = 200;

// Minimum percentage of original length to keep when truncating
const MIN_TRUNCATION_RATIO = 0.7;

const DEFAULT_FILENAME = 'Untitled';
const RESERVED_NAME_SUFFIX = '_file';

/**
 * Sanitizes a filename to be safe across Windows, macOS, and Linux
 * @param name - The filename to sanitize
 * @returns A sanitized filename safe for all platforms
 */
export function sanitizeFileName(name: string): string {
  if (!name || name.trim() === '') {
    return DEFAULT_FILENAME;
  }

  // Start with the original name
  let sanitized = name;

  // Remove/replace characters that are invalid on Windows, macOS, and Linux
  sanitized = sanitized
    // Windows forbidden characters: < > : " | ? * \ /
    .replace(/[<>:"/\\|?*]/g, '-')
    // Control characters (0-31) and DEL (127)
    // eslint-disable-next-line no-control-regex -- Need to match control characters for sanitization
    .replace(/[\u0000-\u001F\u007F]/g, '')
    // Zero-width characters and other problematic Unicode
    .replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g, '')
    // Multiple spaces to single space
    .replace(/\s+/g, ' ')
    // Remove leading/trailing spaces and dots (Windows issue)
    .replace(/^[\s.]+|[\s.]+$/g, '');

  // Handle Windows reserved names (case insensitive)
  if (WINDOWS_RESERVED_NAMES.includes(sanitized.toUpperCase())) {
    sanitized = sanitized + RESERVED_NAME_SUFFIX;
  }

  // Ensure filename isn't empty after sanitization
  if (sanitized.length === 0) {
    sanitized = DEFAULT_FILENAME;
  }

  // Limit filename length (leaving room for extension and counter)
  if (sanitized.length > MAX_FILENAME_LENGTH) {
    // Try to cut at word boundary
    const truncated = sanitized.substring(0, MAX_FILENAME_LENGTH);
    const lastSpace = truncated.lastIndexOf(' ');
    if (lastSpace > MAX_FILENAME_LENGTH * MIN_TRUNCATION_RATIO) {
      // Only if we're not cutting too much
      sanitized = truncated.substring(0, lastSpace);
    } else {
      sanitized = truncated;
    }
  }

  // Final trim in case we introduced trailing spaces
  sanitized = sanitized.trim();

  // One more check for empty result
  if (sanitized.length === 0) {
    sanitized = DEFAULT_FILENAME;
  }

  return sanitized;
}

/**
 * Validates if a path is safe and doesn't contain directory traversal attempts
 * @param path - The path to validate
 * @returns true if the path is safe, false otherwise
 */
export function isPathSafe(path: string): boolean {
  if (!path) return false;

  // Check for directory traversal attempts
  const dangerousPatterns = ['../', '..\\', '%2e%2e', '%252e%252e'];

  return !dangerousPatterns.some(pattern => path.toLowerCase().includes(pattern));
}

/**
 * Normalizes a path by removing any directory traversal attempts
 * @param path - The path to normalize
 * @returns A safe, normalized path
 */
export function normalizePath(path: string): string {
  if (!path) return '';

  // Remove any directory traversal attempts
  return path
    .replace(/\.\.\//g, '')
    .replace(/\.\.\\/g, '')
    .replace(/%2e%2e/gi, '')
    .replace(/%252e%252e/gi, '');
}

/**
 * Sanitizes a subreddit name for use as a folder name
 * @param subreddit - The subreddit name (without r/ prefix)
 * @returns A sanitized folder name like "r-subredditname"
 */
export function sanitizeSubredditName(subreddit: string): string {
  if (!subreddit || subreddit.trim() === '') {
    return 'r-unknown';
  }

  // Remove any r/ prefix if present
  let name = subreddit.replace(/^r\//i, '');

  // Sanitize for filesystem safety
  name = name
    // Keep only alphanumeric, underscore (valid subreddit chars)
    .replace(/[^a-zA-Z0-9_]/g, '')
    .toLowerCase();

  if (name.length === 0) {
    return 'r-unknown';
  }

  return `r-${name}`;
}
