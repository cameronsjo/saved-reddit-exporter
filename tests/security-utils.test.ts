import { generateSecureRandom, generateCsrfToken } from '../src/utils/crypto-utils';
import { escapeHtml, safeHtml } from '../src/utils/html-escape';

describe('crypto-utils', () => {
  describe('generateSecureRandom', () => {
    it('should generate string of specified length', () => {
      const result = generateSecureRandom(16);
      expect(result.length).toBe(16);
    });

    it('should default to 32 characters', () => {
      const result = generateSecureRandom();
      expect(result.length).toBe(32);
    });

    it('should only contain base36 characters (0-9, a-z)', () => {
      const result = generateSecureRandom(100);
      expect(result).toMatch(/^[0-9a-z]+$/);
    });

    it('should generate different values on each call', () => {
      const results = new Set<string>();
      for (let i = 0; i < 100; i++) {
        results.add(generateSecureRandom(32));
      }
      // All 100 should be unique
      expect(results.size).toBe(100);
    });

    it('should handle edge case of length 1', () => {
      const result = generateSecureRandom(1);
      expect(result.length).toBe(1);
      expect(result).toMatch(/^[0-9a-z]$/);
    });

    it('should handle large lengths', () => {
      const result = generateSecureRandom(1000);
      expect(result.length).toBe(1000);
    });
  });

  describe('generateCsrfToken', () => {
    it('should generate 32-character token', () => {
      const token = generateCsrfToken();
      expect(token.length).toBe(32);
    });

    it('should only contain base36 characters', () => {
      const token = generateCsrfToken();
      expect(token).toMatch(/^[0-9a-z]+$/);
    });

    it('should generate unique tokens', () => {
      const token1 = generateCsrfToken();
      const token2 = generateCsrfToken();
      expect(token1).not.toBe(token2);
    });
  });
});

describe('html-escape', () => {
  // Note: In browser/JSDOM environment, escapeHtml uses textContent which only escapes <, >, &
  // The fallback (non-browser) also escapes quotes and slashes per OWASP guidelines
  describe('escapeHtml', () => {
    it('should escape ampersand', () => {
      expect(escapeHtml('foo & bar')).toBe('foo &amp; bar');
    });

    it('should escape less than', () => {
      expect(escapeHtml('a < b')).toBe('a &lt; b');
    });

    it('should escape greater than', () => {
      expect(escapeHtml('a > b')).toBe('a &gt; b');
    });

    it('should escape HTML tags', () => {
      // Core functionality: prevent HTML injection
      const result = escapeHtml('<script>alert(1)</script>');
      expect(result).toContain('&lt;');
      expect(result).toContain('&gt;');
      expect(result).not.toMatch(/<script>/);
    });

    it('should handle empty string', () => {
      expect(escapeHtml('')).toBe('');
    });

    it('should handle null/undefined', () => {
      expect(escapeHtml(null as unknown as string)).toBe('');
      expect(escapeHtml(undefined as unknown as string)).toBe('');
    });

    it('should leave safe strings unchanged', () => {
      expect(escapeHtml('Hello World')).toBe('Hello World');
      expect(escapeHtml('12345')).toBe('12345');
    });

    it('should escape core HTML entities', () => {
      // The three core entities that must always be escaped
      const result = escapeHtml('<>&');
      expect(result).toBe('&lt;&gt;&amp;');
    });

    // OWASP XSS Prevention tests
    it('should prevent basic XSS in HTML context', () => {
      const malicious = '<img src=x onerror=alert(1)>';
      const escaped = escapeHtml(malicious);
      expect(escaped).not.toContain('<');
      expect(escaped).not.toContain('>');
    });

    it('should handle unicode characters', () => {
      expect(escapeHtml('Hello 世界 🌍')).toBe('Hello 世界 🌍');
    });

    it('should handle newlines and tabs', () => {
      expect(escapeHtml('line1\nline2\ttab')).toBe('line1\nline2\ttab');
    });

    it('should handle complex HTML injection attempts', () => {
      const attacks = [
        '<script>alert(document.cookie)</script>',
        '<img src="x" onerror="alert(1)">',
        '<svg onload="alert(1)">',
        '<body onload="alert(1)">',
      ];

      for (const attack of attacks) {
        const escaped = escapeHtml(attack);
        expect(escaped).not.toMatch(/<[a-z]/i); // No opening tags
      }
    });
  });

  describe('safeHtml', () => {
    it('should replace placeholders with escaped values', () => {
      const template = '<div>{{name}}</div>';
      const result = safeHtml(template, { name: '<script>alert(1)</script>' });

      // Browser textContent escapes <, >, &
      expect(result).toContain('&lt;script&gt;');
      expect(result).toContain('&lt;/script&gt;');
      expect(result).not.toContain('<script>');
    });

    it('should handle multiple placeholders', () => {
      const template = '<span>{{first}} {{last}}</span>';
      const result = safeHtml(template, { first: 'John', last: 'Doe' });

      expect(result).toBe('<span>John Doe</span>');
    });

    it('should handle same placeholder multiple times', () => {
      const template = '{{name}} - {{name}}';
      const result = safeHtml(template, { name: 'Test' });

      expect(result).toBe('Test - Test');
    });

    it('should escape special characters in values', () => {
      const template = '<a href="{{url}}">{{text}}</a>';
      const result = safeHtml(template, {
        url: 'https://example.com?a=1&b=2',
        text: 'Click <here>',
      });

      expect(result).toContain('&amp;');
      expect(result).toContain('&lt;here&gt;');
    });

    it('should leave unmatched placeholders unchanged', () => {
      const template = '{{known}} {{unknown}}';
      const result = safeHtml(template, { known: 'value' });

      expect(result).toBe('value {{unknown}}');
    });

    it('should handle empty template', () => {
      const result = safeHtml('', { name: 'test' });
      expect(result).toBe('');
    });

    it('should handle empty values object', () => {
      const template = 'Hello {{name}}';
      const result = safeHtml(template, {});

      expect(result).toBe('Hello {{name}}');
    });

    it('should handle template without placeholders', () => {
      const template = '<div>Static content</div>';
      const result = safeHtml(template, { unused: 'value' });

      expect(result).toBe('<div>Static content</div>');
    });

    it('should prevent script tag injection', () => {
      const template = '<div>{{content}}</div>';
      const result = safeHtml(template, { content: '<script>alert(1)</script>' });

      // No executable script tags
      expect(result).not.toMatch(/<script>/i);
      expect(result).toContain('&lt;script&gt;');
    });
  });
});

describe('Security integration tests', () => {
  it('should generate cryptographically distinct tokens', () => {
    // Generate many tokens and check distribution
    const tokens = Array.from({ length: 1000 }, () => generateCsrfToken());
    const uniqueTokens = new Set(tokens);

    // All should be unique
    expect(uniqueTokens.size).toBe(1000);
  });

  it('should escape core HTML characters', () => {
    // Core HTML characters that must be escaped to prevent injection
    const escaped = escapeHtml('&<>');

    // & becomes &amp;, < becomes &lt;, > becomes &gt;
    expect(escaped).toBe('&amp;&lt;&gt;');

    // Verify no literal unescaped angle brackets remain
    expect(escaped).not.toMatch(/(?<!&amp|&lt|&gt)[<>]/);
  });

  it('should safely handle user input in HTML templates', () => {
    const userInput = {
      username: '<script>document.cookie</script>',
      bio: 'I like text & ampersands',
      website: 'https://example.com',
    };

    const template = `
      <div class="profile">
        <h1>{{username}}</h1>
        <p>{{bio}}</p>
        <a href="{{website}}">Website</a>
      </div>
    `;

    const result = safeHtml(template, userInput);

    // No unescaped script tags
    expect(result).not.toContain('<script>');
    expect(result).not.toContain('</script>');

    // Special characters escaped
    expect(result).toContain('&lt;script&gt;');
    expect(result).toContain('&amp;');
  });
});
