import DOMPurify from 'dompurify';

// Shared sanitize function for dictionary HTML
export function sanitizeDictHTML(html) {
  // Replace common inline styles with classes and convert custom tags to spans
  let processed = html
    .replace(/style="color:green"/g, 'class="dict-type"')
    .replace(/style="color:brown"/g, 'class="dict-pron"')
    .replace(/style="font-size:0\.7em"/g, 'class="dict-level"')
    .replace(/<type/g, '<span')
    .replace(/<\/type>/g, '</span>')
    .replace(/<pron/g, '<span')
    .replace(/<\/pron>/g, '</span>')
    .replace(/<level/g, '<span')
    .replace(/<\/level>/g, '</span>')
    .replace(/<thai/g, '<span')
    .replace(/<\/thai>/g, '</span>')
    .replace(/<def/g, '<span')
    .replace(/<\/def>/g, '</span>');

  // Sanitize with DOMPurify, allowing only safe tags and attributes
  return DOMPurify.sanitize(processed, {
    ALLOWED_TAGS: ['span', 'b', 'i', 'em', 'strong', 'br', 'p', 'div', 'ul', 'li', 'ol'],
    ALLOWED_ATTR: ['class'],
    SAFE_FOR_TEMPLATES: true
  });
}

// For global use in non-module environments
if (typeof window !== 'undefined') {
  window.sanitizeDictHTML = sanitizeDictHTML;
}