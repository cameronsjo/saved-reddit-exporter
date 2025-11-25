/**
 * HTML escaping utilities for XSS protection
 * Uses browser's built-in DOM API for safe, reliable escaping
 */

/**
 * Escapes HTML special characters to prevent XSS attacks
 * Uses the browser's textContent API which is the safest approach
 * @param text - The text to escape
 * @returns HTML-safe text
 */
export function escapeHtml(text: string): string {
  if (!text) return '';

  // Use browser's built-in text node for escaping - this is the safest method
  // as it leverages the browser's own escaping implementation
  if (typeof document !== 'undefined') {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Fallback for non-browser environments (testing)
  // This is the standard set of HTML entities that must be escaped
  // per OWASP recommendations: https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html
  const htmlEscapeMap: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;',
  };

  return text.replace(/[&<>"'/]/g, char => htmlEscapeMap[char] || char);
}

/**
 * Creates a safe HTML string by escaping user-controlled content
 * @param template - The HTML template with placeholders
 * @param values - Object containing values to escape and insert
 * @returns Safe HTML string
 */
export function safeHtml(template: string, values: Record<string, string>): string {
  let result = template;

  for (const [key, value] of Object.entries(values)) {
    const placeholder = `{{${key}}}`;
    result = result.replace(new RegExp(placeholder, 'g'), escapeHtml(value));
  }

  return result;
}
