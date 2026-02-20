import { describe, it, expect, vi } from 'vitest';
import { validateInput, parseJSON, removeMarkdownCodeBlocks, generateId } from '../../../shared/utils';
import type { Result } from '../../../shared/types';

describe('utils', () => {
  describe('validateInput', () => {
    it('should return true for valid input', () => {
      expect(validateInput('valid input')).toBe(true);
    });

    it('should return false for empty string', () => {
      expect(validateInput('')).toBe(false);
    });

    it('should return false for whitespace-only string', () => {
      expect(validateInput('   ')).toBe(false);
    });

    it('should return false for null/undefined', () => {
      expect(validateInput(null as unknown as string)).toBe(false);
      expect(validateInput(undefined as unknown as string)).toBe(false);
    });
  });

  describe('parseJSON', () => {
    it('should parse valid JSON', () => {
      const json = '{"success": true, "results": []}';
      const result = parseJSON<Result>(json, { success: false, results: [] });
      expect(result).toEqual({ success: true, results: [] });
    });

    it('should remove markdown code blocks before parsing', () => {
      const json = '```json\n{"success": true, "results": []}\n```';
      const result = parseJSON<Result>(json, { success: false, results: [] });
      expect(result).toEqual({ success: true, results: [] });
    });

    it('should handle code blocks with different languages', () => {
      const jsonBlocks = [
        '```javascript\n{"success": true}\n```',
        '```typescript\n{"success": true}\n```',
        '```js\n{"success": true}\n```',
        '```ts\n{"success": true}\n```',
      ];

      jsonBlocks.forEach((block) => {
        const result = parseJSON<{ success: boolean }>(block, { success: false });
        expect(result.success).toBe(true);
      });
    });

    it('should return fallback for invalid JSON', () => {
      const fallback = { success: false, results: [] };
      const result = parseJSON<Result>('not valid json', fallback);
      expect(result).toEqual(fallback);
    });

    it('should trim whitespace before parsing', () => {
      const json = '  \n  {"success": true, "results": []}  \n  ';
      const result = parseJSON<Result>(json, { success: false, results: [] });
      expect(result).toEqual({ success: true, results: [] });
    });

    it('should not log errors when logging is disabled', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {
        // Mock implementation
      });
      parseJSON('invalid', {}, false);
      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should log errors when logging is enabled', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {
        // Mock implementation
      });
      parseJSON('invalid', {}, true);
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('removeMarkdownCodeBlocks', () => {
    it('should remove json code blocks', () => {
      const input = '```json\ncontent\n```';
      expect(removeMarkdownCodeBlocks(input)).toBe('content');
    });

    it('should remove code blocks without language specifier', () => {
      const input = '```\ncontent\n```';
      expect(removeMarkdownCodeBlocks(input)).toBe('content');
    });

    it('should handle code blocks without newlines', () => {
      const input = '```json{"success":true}```';
      expect(removeMarkdownCodeBlocks(input)).toBe('{"success":true}');
    });

    it('should return original text if no code blocks', () => {
      const input = 'plain text';
      expect(removeMarkdownCodeBlocks(input)).toBe('plain text');
    });

    it('should handle multiline content in code blocks', () => {
      const input = '```json\n{\n  "success": true,\n  "data": "test"\n}\n```';
      const expected = '{\n  "success": true,\n  "data": "test"\n}';
      expect(removeMarkdownCodeBlocks(input)).toBe(expected);
    });
  });

  describe('generateId', () => {
    it('should generate ID with correct prefix', () => {
      const id = generateId('test');
      expect(id).toMatch(/^test-\d+-[a-z0-9]+$/);
    });

    it('should generate unique IDs', () => {
      const ids = new Set();
      for (let i = 0; i < 100; i++) {
        ids.add(generateId('test'));
      }
      expect(ids.size).toBe(100);
    });

    it('should work with different prefixes', () => {
      const prefixes = ['comment', 'tracked-change', 'highlight'];
      prefixes.forEach((prefix) => {
        const id = generateId(prefix);
        expect(id).toMatch(new RegExp(`^${prefix}-`));
      });
    });
  });
});
