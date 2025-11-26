import { sanitizeFileName, isPathSafe, sanitizeSubredditName } from '../src/utils/file-sanitizer';

describe('file-sanitizer', () => {
  describe('sanitizeFileName', () => {
    it('should remove invalid characters', () => {
      expect(sanitizeFileName('file<name>test')).toBe('file-name-test');
      expect(sanitizeFileName('file:name|test')).toBe('file-name-test');
      expect(sanitizeFileName('file"name?test')).toBe('file-name-test');
    });

    it('should handle empty strings', () => {
      expect(sanitizeFileName('')).toBe('Untitled');
      expect(sanitizeFileName('   ')).toBe('Untitled');
    });

    it('should handle Windows reserved names', () => {
      expect(sanitizeFileName('CON')).toBe('CON_file');
      expect(sanitizeFileName('PRN')).toBe('PRN_file');
      expect(sanitizeFileName('AUX')).toBe('AUX_file');
    });

    it('should truncate long filenames', () => {
      const longName = 'a'.repeat(250);
      const result = sanitizeFileName(longName);
      expect(result.length).toBeLessThanOrEqual(200);
    });

    it('should handle special characters', () => {
      expect(sanitizeFileName('file\\name/test')).toBe('file-name-test');
      expect(sanitizeFileName('file*name')).toBe('file-name');
    });
  });

  describe('isPathSafe', () => {
    it('should return true for safe paths', () => {
      expect(isPathSafe('folder/file.md')).toBe(true);
      expect(isPathSafe('Reddit Saved/post.md')).toBe(true);
    });

    it('should return false for directory traversal attempts', () => {
      expect(isPathSafe('../../../etc/passwd')).toBe(false);
      expect(isPathSafe('folder/../../../file')).toBe(false);
      expect(isPathSafe('..\\..\\file')).toBe(false);
    });

    it('should return false for empty paths', () => {
      expect(isPathSafe('')).toBe(false);
    });

    it('should detect encoded traversal attempts', () => {
      expect(isPathSafe('%2e%2e/file')).toBe(false);
      expect(isPathSafe('%252e%252e/file')).toBe(false);
    });
  });

  describe('sanitizeSubredditName', () => {
    it('should create proper folder name from subreddit', () => {
      expect(sanitizeSubredditName('Obsidian')).toBe('obsidian');
      expect(sanitizeSubredditName('AskReddit')).toBe('askreddit');
      expect(sanitizeSubredditName('programming')).toBe('programming');
    });

    it('should handle subreddits with underscores', () => {
      expect(sanitizeSubredditName('learn_programming')).toBe('learn_programming');
      expect(sanitizeSubredditName('web_dev')).toBe('web_dev');
    });

    it('should remove r/ prefix if present', () => {
      expect(sanitizeSubredditName('r/Obsidian')).toBe('obsidian');
      expect(sanitizeSubredditName('R/AskReddit')).toBe('askreddit');
    });

    it('should handle empty or invalid input', () => {
      expect(sanitizeSubredditName('')).toBe('unknown');
      expect(sanitizeSubredditName('   ')).toBe('unknown');
    });

    it('should remove special characters', () => {
      expect(sanitizeSubredditName('test!@#$%')).toBe('test');
      expect(sanitizeSubredditName('sub-reddit')).toBe('subreddit');
    });

    it('should handle subreddits with numbers', () => {
      expect(sanitizeSubredditName('2meirl4meirl')).toBe('2meirl4meirl');
      expect(sanitizeSubredditName('formula1')).toBe('formula1');
    });
  });
});
