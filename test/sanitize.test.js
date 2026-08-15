import { describe, it, expect } from 'vitest';
import {
  escapeHtml,
  isValidUuid4,
  parsePositiveInt,
  extractTitleFromHtml,
  extractDescriptionFromHtml
} from '../src/utils/sanitize.js';

describe('Sanitization & Validation Utilities', () => {
  describe('escapeHtml', () => {
    it('escapes dangerous HTML characters', () => {
      const malicious = '<script>alert("XSS & theft")</script>\'';
      const escaped = escapeHtml(malicious);
      expect(escaped).toBe('&lt;script&gt;alert(&quot;XSS &amp; theft&quot;)&lt;/script&gt;&#39;');
      expect(escaped).not.toContain('<');
      expect(escaped).not.toContain('>');
      expect(escaped).not.toContain('"');
    });

    it('handles empty and null inputs safely', () => {
      expect(escapeHtml('')).toBe('');
      expect(escapeHtml(null)).toBe('');
      expect(escapeHtml(undefined)).toBe('');
    });
  });

  describe('isValidUuid4', () => {
    it('accepts valid RFC 4122 UUID-4 strings', () => {
      expect(isValidUuid4('a81c2d94-3450-48e2-b13c-0e241764df8a')).toBe(true);
      expect(isValidUuid4('4f8b2e31-89ab-4c3e-9012-7a8b9c0d1e2f')).toBe(true);
    });

    it('rejects path traversal, malformed strings, and non-UUIDs', () => {
      expect(isValidUuid4('../../../etc/passwd')).toBe(false);
      expect(isValidUuid4('a81c2d94-3450-48e2-b13c-0e241764df8a/v1')).toBe(false);
      expect(isValidUuid4('not-a-uuid')).toBe(false);
      expect(isValidUuid4('')).toBe(false);
      expect(isValidUuid4(null)).toBe(false);
    });
  });

  describe('parsePositiveInt', () => {
    it('parses positive integers >= 1', () => {
      expect(parsePositiveInt('1')).toBe(1);
      expect(parsePositiveInt('42')).toBe(42);
      expect(parsePositiveInt(5)).toBe(5);
    });

    it('returns NaN for 0, negative numbers, floats, or invalid strings', () => {
      expect(Number.isNaN(parsePositiveInt('0'))).toBe(true);
      expect(Number.isNaN(parsePositiveInt('-1'))).toBe(true);
      expect(Number.isNaN(parsePositiveInt('3.14'))).toBe(true);
      expect(Number.isNaN(parsePositiveInt('abc'))).toBe(true);
      expect(Number.isNaN(parsePositiveInt(null))).toBe(true);
    });
  });

  describe('extractTitleFromHtml', () => {
    it('extracts text from <title> tag', () => {
      const html = '<html><head><title>My Awesome Dashboard</title></head><body></body></html>';
      expect(extractTitleFromHtml(html)).toBe('My Awesome Dashboard');
    });

    it('strips inner HTML tags inside title', () => {
      const html = '<title><b>Bold</b> Title & <i>Italics</i></title>';
      expect(extractTitleFromHtml(html)).toBe('Bold Title & Italics');
    });

    it('falls back to <h1> when no <title> exists', () => {
      const html = '<html><body><h1>Primary Heading</h1><p>Content</p></body></html>';
      expect(extractTitleFromHtml(html)).toBe('Primary Heading');
    });

    it('returns "Untitled Artifact" if no title or h1 exists', () => {
      const html = '<div>Just a plain div with no title</div>';
      expect(extractTitleFromHtml(html)).toBe('Untitled Artifact');
    });
  });

  describe('extractDescriptionFromHtml', () => {
    it('extracts content from meta description tag', () => {
      const html = '<html><head><meta name="description" content="Detailed chart analysis."></head></html>';
      expect(extractDescriptionFromHtml(html)).toBe('Detailed chart analysis.');
    });

    it('returns empty string if no meta description exists', () => {
      const html = '<html><head><title>Test</title></head></html>';
      expect(extractDescriptionFromHtml(html)).toBe('');
    });
  });
});
