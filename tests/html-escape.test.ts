import { escapeHtml, safeHtml } from '../src/utils/html-escape';

describe('html-escape', () => {
  describe('escapeHtml', () => {
    // Note: In browser/jsdom environment, escapeHtml uses DOM's textContent
    // which only escapes <, >, and & (since quotes and slashes are safe in text content).
    // The fallback for non-browser environments escapes more characters per OWASP.

    it('should escape ampersands', () => {
      expect(escapeHtml('foo & bar')).toBe('foo &amp; bar');
    });

    it('should escape less than signs', () => {
      expect(escapeHtml('foo < bar')).toBe('foo &lt; bar');
    });

    it('should escape greater than signs', () => {
      expect(escapeHtml('foo > bar')).toBe('foo &gt; bar');
    });

    it('should preserve double quotes (safe in text content)', () => {
      // DOM's textContent doesn't escape quotes - they're only dangerous in attributes
      expect(escapeHtml('foo "bar" baz')).toBe('foo "bar" baz');
    });

    it('should preserve single quotes (safe in text content)', () => {
      expect(escapeHtml("foo 'bar' baz")).toBe("foo 'bar' baz");
    });

    it('should preserve forward slashes (safe in text content)', () => {
      expect(escapeHtml('foo/bar')).toBe('foo/bar');
    });

    it('should escape HTML special characters in script tags', () => {
      const result = escapeHtml('<script>alert("XSS")</script>');
      expect(result).toContain('&lt;script&gt;');
      expect(result).toContain('&lt;/script&gt;');
    });

    it('should return empty string for empty input', () => {
      expect(escapeHtml('')).toBe('');
    });

    it('should return empty string for null/undefined input', () => {
      expect(escapeHtml(null as unknown as string)).toBe('');
      expect(escapeHtml(undefined as unknown as string)).toBe('');
    });

    it('should handle text without special characters', () => {
      expect(escapeHtml('Hello World')).toBe('Hello World');
    });

    it('should escape angle brackets in HTML tags', () => {
      const result = escapeHtml('<div class="test">content</div>');
      expect(result).toContain('&lt;div');
      expect(result).toContain('&gt;content&lt;');
      expect(result).toContain('/div&gt;');
    });

    it('should escape ampersands in URLs', () => {
      const result = escapeHtml('https://example.com?foo=1&bar=2');
      expect(result).toContain('&amp;');
    });

    it('should handle complex XSS attempts', () => {
      const xss = '<img src="x" onerror="alert(\'XSS\')">';
      const escaped = escapeHtml(xss);
      expect(escaped).not.toContain('<');
      expect(escaped).not.toContain('>');
      expect(escaped).toContain('&lt;');
      expect(escaped).toContain('&gt;');
    });

    it('should preserve event handler text (not in HTML context)', () => {
      // Quotes are safe in text content - only dangerous in attribute values
      expect(escapeHtml('onclick="alert(1)"')).toBe('onclick="alert(1)"');
    });
  });

  describe('safeHtml', () => {
    it('should replace single placeholder with escaped value', () => {
      const template = '<div>{{content}}</div>';
      const result = safeHtml(template, { content: 'Hello' });
      expect(result).toBe('<div>Hello</div>');
    });

    it('should replace multiple placeholders', () => {
      const template = '<div>{{title}}: {{content}}</div>';
      const result = safeHtml(template, { title: 'Title', content: 'Content' });
      expect(result).toBe('<div>Title: Content</div>');
    });

    it('should escape HTML in values', () => {
      const template = '<div>{{content}}</div>';
      const result = safeHtml(template, { content: '<script>alert("XSS")</script>' });
      expect(result).toContain('&lt;script&gt;');
      expect(result).toContain('&lt;/script&gt;');
      expect(result).not.toContain('<script>');
    });

    it('should replace repeated placeholders', () => {
      const template = '<div>{{name}} said: {{name}}</div>';
      const result = safeHtml(template, { name: 'John' });
      expect(result).toBe('<div>John said: John</div>');
    });

    it('should handle empty values', () => {
      const template = '<div>{{content}}</div>';
      const result = safeHtml(template, { content: '' });
      expect(result).toBe('<div></div>');
    });

    it('should leave unmatched placeholders', () => {
      const template = '<div>{{content}} {{other}}</div>';
      const result = safeHtml(template, { content: 'Hello' });
      expect(result).toBe('<div>Hello {{other}}</div>');
    });

    it('should handle special characters in placeholder values', () => {
      const template = '<a href="{{url}}">{{text}}</a>';
      const result = safeHtml(template, {
        url: 'https://example.com?a=1&b=2',
        text: 'Click <here>',
      });
      expect(result).toContain('&amp;');
      expect(result).toContain('&lt;here&gt;');
    });

    it('should prevent XSS through template values', () => {
      const template = '<input value="{{value}}">';
      const result = safeHtml(template, { value: '<script>alert(1)</script>' });
      expect(result).not.toContain('<script>');
      expect(result).toContain('&lt;script&gt;');
    });

    it('should handle complex templates', () => {
      const template = `
        <div class="post">
          <h1>{{title}}</h1>
          <p>By {{author}}</p>
          <div>{{content}}</div>
        </div>
      `;
      const result = safeHtml(template, {
        title: 'Test <Post>',
        author: 'Smith',
        content: 'Hello & goodbye',
      });
      expect(result).toContain('Test &lt;Post&gt;');
      expect(result).toContain('Smith');
      expect(result).toContain('Hello &amp; goodbye');
    });
  });
});
