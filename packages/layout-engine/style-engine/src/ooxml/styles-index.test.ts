import { describe, expect, it } from 'vitest';
import { StylesIndex } from './styles-index.js';
import type { StyleDefinition } from './styles-types.js';

describe('StylesIndex', () => {
  describe('getStyleById', () => {
    it('returns a style by its styleId', () => {
      const styles: StyleDefinition[] = [{ styleId: 'Heading1', name: 'Heading 1', type: 'paragraph' }];
      const index = new StylesIndex(styles);

      expect(index.getStyleById('Heading1')).toBe(styles[0]);
    });

    it('returns undefined for unknown styleId', () => {
      const index = new StylesIndex([]);
      expect(index.getStyleById('Missing')).toBeUndefined();
    });

    it('uses first-wins policy for duplicate styleId', () => {
      const first: StyleDefinition = { styleId: 'Dup', name: 'First' };
      const second: StyleDefinition = { styleId: 'Dup', name: 'Second' };
      const index = new StylesIndex([first, second]);

      expect(index.getStyleById('Dup')).toBe(first);
    });
  });

  describe('getStyleByName', () => {
    it('returns a style by its name', () => {
      const styles: StyleDefinition[] = [{ styleId: 'Heading1', name: 'Heading 1' }];
      const index = new StylesIndex(styles);

      expect(index.getStyleByName('Heading 1')).toBe(styles[0]);
    });

    it('returns undefined for unknown name', () => {
      const index = new StylesIndex([]);
      expect(index.getStyleByName('Missing')).toBeUndefined();
    });

    it('uses first-wins policy for duplicate name', () => {
      const first: StyleDefinition = { styleId: 'A', name: 'Shared' };
      const second: StyleDefinition = { styleId: 'B', name: 'Shared' };
      const index = new StylesIndex([first, second]);

      expect(index.getStyleByName('Shared')).toBe(first);
    });
  });

  describe('getAllStyles', () => {
    it('returns all styles in original order', () => {
      const styles: StyleDefinition[] = [
        { styleId: 'B', name: 'Beta' },
        { styleId: 'A', name: 'Alpha' },
        { styleId: 'C', name: 'Charlie' },
      ];
      const index = new StylesIndex(styles);

      expect(index.getAllStyles()).toEqual(styles);
    });
  });

  describe('empty input', () => {
    it('handles empty arrays gracefully', () => {
      const index = new StylesIndex([]);

      expect(index.getStyleById('any')).toBeUndefined();
      expect(index.getStyleByName('any')).toBeUndefined();
      expect(index.getAllStyles()).toEqual([]);
    });
  });

  describe('skips entries without keys', () => {
    it('skips styles without styleId', () => {
      const styles: StyleDefinition[] = [{ name: 'NoId' }, { styleId: 'HasId', name: 'HasId' }];
      const index = new StylesIndex(styles);

      expect(index.getStyleById('HasId')).toBe(styles[1]);
      expect(index.getAllStyles()).toHaveLength(2);
    });
  });
});
