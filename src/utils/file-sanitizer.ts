/**
 * File name sanitization utilities for cross-platform compatibility
 */

/**
 * Regex pattern to match emojis and other extended Unicode characters
 * that can cause issues across different operating systems
 *
 * Covers:
 * - Emoticons (U+1F600–U+1F64F)
 * - Misc Symbols and Pictographs (U+1F300–U+1F5FF)
 * - Transport and Map Symbols (U+1F680–U+1F6FF)
 * - Flags (U+1F1E0–U+1F1FF)
 * - Supplemental Symbols and Pictographs (U+1F900–U+1F9FF)
 * - Symbols and Pictographs Extended-A (U+1FA00–U+1FAFF)
 * - Misc Symbols (U+2600–U+26FF)
 * - Dingbats (U+2700–U+27BF)
 * - Variation Selectors (U+FE00–U+FE0F)
 * - Combining Diacritical Marks for Symbols (U+20D0–U+20FF)
 * - Enclosed Alphanumeric Supplement (U+1F100–U+1F1FF)
 * - Regional Indicator Symbols (for flags)
 * - Skin tone modifiers (U+1F3FB–U+1F3FF)
 * - Additional emoji modifiers and ZWJ sequences
 */
const EMOJI_AND_EXTENDED_UNICODE_PATTERN =
  /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{1F900}-\u{1F9FF}]|[\u{1FA00}-\u{1FAFF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{FE00}-\u{FE0F}]|[\u{20D0}-\u{20FF}]|[\u{1F100}-\u{1F1FF}]|[\u{E0020}-\u{E007F}]|[\u{1F3FB}-\u{1F3FF}]|[\u{200D}]|[\u{2300}-\u{23FF}]|[\u{2B50}-\u{2B55}]|[\u{2934}-\u{2935}]|[\u{25AA}-\u{25AB}]|[\u{25B6}]|[\u{25C0}]|[\u{25FB}-\u{25FE}]|[\u{2614}-\u{2615}]|[\u{2648}-\u{2653}]|[\u{267F}]|[\u{2693}]|[\u{26A1}]|[\u{26AA}-\u{26AB}]|[\u{26BD}-\u{26BE}]|[\u{26C4}-\u{26C5}]|[\u{26CE}]|[\u{26D4}]|[\u{26EA}]|[\u{26F2}-\u{26F3}]|[\u{26F5}]|[\u{26FA}]|[\u{26FD}]|[\u{2702}]|[\u{2705}]|[\u{2708}-\u{270D}]|[\u{270F}]|[\u{2712}]|[\u{2714}]|[\u{2716}]|[\u{271D}]|[\u{2721}]|[\u{2728}]|[\u{2733}-\u{2734}]|[\u{2744}]|[\u{2747}]|[\u{274C}]|[\u{274E}]|[\u{2753}-\u{2755}]|[\u{2757}]|[\u{2763}-\u{2764}]|[\u{2795}-\u{2797}]|[\u{27A1}]|[\u{27B0}]|[\u{27BF}]|[\u{2B1B}-\u{2B1C}]|[\u{2B05}-\u{2B07}]|[\u{3030}]|[\u{303D}]|[\u{3297}]|[\u{3299}]|[\u{00A9}]|[\u{00AE}]|[\u{203C}]|[\u{2049}]|[\u{2122}]|[\u{2139}]|[\u{2194}-\u{2199}]|[\u{21A9}-\u{21AA}]|[\u{231A}-\u{231B}]|[\u{2328}]|[\u{23CF}]|[\u{23E9}-\u{23F3}]|[\u{23F8}-\u{23FA}]|[\u{24C2}]/gu;

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
    // Remove emojis and extended Unicode characters that cause cross-platform issues
    .replace(EMOJI_AND_EXTENDED_UNICODE_PATTERN, '')
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
 * @returns A sanitized folder name (lowercase, no prefix)
 */
export function sanitizeSubredditName(subreddit: string): string {
  if (!subreddit || subreddit.trim() === '') {
    return 'unknown';
  }

  // Remove any r/ prefix if present
  let name = subreddit.replace(/^r\//i, '');

  // Sanitize for filesystem safety
  name = name
    // Keep only alphanumeric, underscore (valid subreddit chars)
    .replace(/[^a-zA-Z0-9_]/g, '')
    .toLowerCase();

  if (name.length === 0) {
    return 'unknown';
  }

  return name;
}
