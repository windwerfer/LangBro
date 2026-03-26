import DOMPurify from 'dompurify';

/**
 * Shared sanitize function for dictionary HTML.
 * Focuses on security by using DOMPurify. 
 * Note: Custom tag conversion (e.g., <thai> -> <span>) is now performed during import 
 * for better lookup performance.
 */
export function sanitizeDictHTML(html) {
  // Sanitize with DOMPurify, allowing only safe tags and attributes.
  // We keep style for legacy support and for potentially dynamic content.
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      'span', 'b', 'i', 'em', 'strong', 'br', 'hr', 'p', 'div', 
      'ul', 'li', 'ol', 'details', 'summary', 'style', 'a',
      'ruby', 'rt', 'rp', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th'
    ],
    ALLOWED_ATTR: ['class', 'href', 'target', 'title'],
    SAFE_FOR_TEMPLATES: true
  });
}

// For global use in non-module environments
if (typeof window !== 'undefined') {
  window.sanitizeDictHTML = sanitizeDictHTML;
}
