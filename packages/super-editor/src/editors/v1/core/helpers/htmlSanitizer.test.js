import { describe, it, expect } from 'vitest';
import { stripHtmlStyles } from './htmlSanitizer.js';

describe('htmlSanitizer', () => {
  describe('stripHtmlStyles', () => {
    it('removes all style attributes', () => {
      const input = '<p style="color: red; font-size: 20px;">Text</p>';
      const result = stripHtmlStyles(input);
      expect(result).toBe('<p>Text</p>');
    });

    it('removes class and id attributes', () => {
      const input = '<div class="container" id="main">Content</div>';
      const result = stripHtmlStyles(input);
      expect(result).toBe('<div>Content</div>');
    });

    it('preserves semantic attributes', () => {
      const input = '<a href="https://example.com" style="color: blue;">Link</a>';
      const result = stripHtmlStyles(input);
      expect(result).toBe('<a href="https://example.com">Link</a>');
    });

    it('preserves image attributes', () => {
      const input = '<img src="test.jpg" alt="Test" class="image" style="width: 100px;">';
      const result = stripHtmlStyles(input);
      expect(result).toBe('<img src="test.jpg" alt="Test">');
    });

    it('preserves table attributes in complete table structure', () => {
      const input =
        '<table style="width: 100%;"><tr><td colspan="2" rowspan="3" style="background: red;">Cell</td></tr></table>';
      const result = stripHtmlStyles(input);
      expect(result).toBe('<table><tbody><tr><td colspan="2" rowspan="3">Cell</td></tr></tbody></table>');
    });

    it('handles nested elements', () => {
      const input =
        '<div style="padding: 10px;"><p style="color: red;"><strong style="font-size: 20px;">Text</strong></p></div>';
      const result = stripHtmlStyles(input);
      expect(result).toBe('<div><p><strong>Text</strong></p></div>');
    });

    it('returns empty string for null/undefined', () => {
      expect(stripHtmlStyles(null)).toBe('');
      expect(stripHtmlStyles(undefined)).toBe('');
      expect(stripHtmlStyles('')).toBe('');
    });

    it('preserves list type attribute', () => {
      const input = '<ol type="A" style="margin: 10px;"><li>Item</li></ol>';
      const result = stripHtmlStyles(input);
      expect(result).toBe('<ol type="A"><li>Item</li></ol>');
    });

    it('preserves text-align style', () => {
      const input = '<p style="margin-bottom: 11px; line-height: 1; text-align: center;"><span>Text</span></p>';
      const result = stripHtmlStyles(input);
      expect(result).toBe('<p style="text-align: center;"><span>Text</span></p>');
    });

    it('removes style tag if no text-align found', () => {
      const input = '<p style="margin-bottom: 11px; line-height: 1;"><span>Text</span></p>';
      const result = stripHtmlStyles(input);
      expect(result).toBe('<p><span>Text</span></p>');
    });

    it('preserves trailing space in span', () => {
      const input = '<p><span>Text </span></p>';
      const result = stripHtmlStyles(input);
      expect(result).toBe('<p><span>Text&nbsp;</span></p>');
    });

    it('preserves trailing space in span defined by \n', () => {
      const input = '<p><span>Text\n</span></p>';
      const result = stripHtmlStyles(input);
      expect(result).toBe('<p><span>Text&nbsp;</span></p>');
    });

    it('preserves leading space in span', () => {
      const input = '<p><span> Text</span></p>';
      const result = stripHtmlStyles(input);
      expect(result).toBe('<p><span>&nbsp;Text</span></p>');
    });
  });
});
