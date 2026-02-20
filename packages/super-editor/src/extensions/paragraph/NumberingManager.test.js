import { describe, it, expect } from 'vitest';
import { createNumberingManager } from './NumberingManager.js';

describe('NumberingManager', () => {
  describe.each([
    { cacheEnabled: false, mode: 'with cache disabled' },
    { cacheEnabled: true, mode: 'with cache enabled' },
  ])('when running $mode', ({ cacheEnabled }) => {
    function makeNumberingManager() {
      const manager = createNumberingManager();
      if (cacheEnabled) {
        manager.enableCache();
      }
      return manager;
    }

    /*
     * list1
     * - (10) Level 0, first item
     * - (11) Level 0, second item
     */
    it('increments sequential level 0 counters and caches the last seen entry', () => {
      const numberingManager = makeNumberingManager();
      numberingManager.setStartSettings('list1', 0, 1, null);

      expect(numberingManager.getCounter('list1', 0, 10)).toBeNull();

      const first = numberingManager.calculateCounter('list1', 0, 10);
      expect(first).toBe(1);
      numberingManager.setCounter('list1', 0, 10, first);

      expect(numberingManager.getCounter('list1', 0, 10)).toBe(1);

      const second = numberingManager.calculateCounter('list1', 0, 11);
      expect(second).toBe(2);
      numberingManager.setCounter('list1', 0, 11, second);
      expect(numberingManager.calculatePath('list1', 0, 11)).toEqual([2]);
    });

    it('tracks counters by abstractId across numbering definitions', () => {
      const numberingManager = makeNumberingManager();
      numberingManager.setStartSettings('numA', 0, 1, null);
      numberingManager.setStartSettings('numB', 0, 1, null);

      const first = numberingManager.calculateCounter('numA', 0, 10, 'abs-1');
      expect(first).toBe(1);
      numberingManager.setCounter('numA', 0, 10, first, 'abs-1');

      const second = numberingManager.calculateCounter('numB', 0, 20, 'abs-1');
      expect(second).toBe(2);
      numberingManager.setCounter('numB', 0, 20, second, 'abs-1');

      expect(numberingManager.getCounter('numA', 0, 10)).toBe(1);
      expect(numberingManager.getCounter('numB', 0, 20)).toBe(2);
      expect(numberingManager.calculatePath('numB', 0, 20)).toEqual([2]);
    });

    it('uses the highest previous position even if counters are set out of order', () => {
      const numberingManager = makeNumberingManager();
      numberingManager.setStartSettings('list1', 0, 1, null);

      numberingManager.setCounter('list1', 0, 20, 2, 'abs-3');
      numberingManager.setCounter('list1', 0, 10, 1, 'abs-3');

      const next = numberingManager.calculateCounter('list1', 0, 30, 'abs-3');
      expect(next).toBe(3);
    });

    it('respects startOverridden by isolating cache lookups to the numId', () => {
      const numberingManager = makeNumberingManager();
      numberingManager.setStartSettings('numA', 0, 1, null);
      numberingManager.setStartSettings('numB', 0, 1, null, true);

      const first = numberingManager.calculateCounter('numA', 0, 10, 'abs-2');
      numberingManager.setCounter('numA', 0, 10, first, 'abs-2');

      const next = numberingManager.calculateCounter('numB', 0, 20, 'abs-2');
      if (cacheEnabled) {
        expect(next).toBe(1);
      } else {
        expect(next).toBe(2);
      }
    });

    /*
     * list1
     * - (10) Level 0, first item
     * - (11) Level 0, second item
     *   - (13) Level 1, first item
     *   - (14) Level 1, second item
     * - (15) Level 0, third item
     *   - (16) Level 1, first item (should restart to 1)
     */
    it('restarts level 1 numbering when a new level 0 item appears with default restart rules', () => {
      const numberingManager = makeNumberingManager();
      numberingManager.setStartSettings('list1', 0, 1, null);
      numberingManager.setStartSettings('list1', 1, 1, null);

      const firstTop = numberingManager.calculateCounter('list1', 0, 10);
      numberingManager.setCounter('list1', 0, 10, firstTop);

      const secondTop = numberingManager.calculateCounter('list1', 0, 11);
      numberingManager.setCounter('list1', 0, 11, secondTop);

      const firstChild = numberingManager.calculateCounter('list1', 1, 13);
      expect(firstChild).toBe(1);
      numberingManager.setCounter('list1', 1, 13, firstChild);

      const secondChild = numberingManager.calculateCounter('list1', 1, 14);
      expect(secondChild).toBe(2);
      numberingManager.setCounter('list1', 1, 14, secondChild);

      const thirdTop = numberingManager.calculateCounter('list1', 0, 15);
      expect(thirdTop).toBe(3);
      numberingManager.setCounter('list1', 0, 15, thirdTop);

      const restartedChild = numberingManager.calculateCounter('list1', 1, 16);
      expect(restartedChild).toBe(1);
      numberingManager.setCounter('list1', 1, 16, restartedChild);
      expect(numberingManager.getAncestorsPath('list1', 1, 16)).toEqual([3]);
      expect(numberingManager.calculatePath('list1', 1, 16)).toEqual([3, 1]);
    });

    /*
     * list1
     * - (10) Level 0, first item
     * - (11) Level 0, second item
     *   - (13) Level 1, first item
     *   - (14) Level 1, second item
     * - (15) Level 0, third item
     *   - (16) Level 1, first item
     *     - (17) Level 2, first item
     * - (18) Level 0, fourth item
     *   - (19) Level 1, first item
     *   - (20) Level 1, second item
     *     - (21) Level 2, second item (should continue as 2)
     */
    it('continues level 2 numbering when restart setting is zero despite lower-level usage', () => {
      const numberingManager = makeNumberingManager();
      numberingManager.setStartSettings('list1', 0, 1, null);
      numberingManager.setStartSettings('list1', 2, 1, 0);

      const top10 = numberingManager.calculateCounter('list1', 0, 10);
      numberingManager.setCounter('list1', 0, 10, top10);

      const top11 = numberingManager.calculateCounter('list1', 0, 11);
      numberingManager.setCounter('list1', 0, 11, top11);

      const child13 = numberingManager.calculateCounter('list1', 1, 13);
      numberingManager.setCounter('list1', 1, 13, child13);

      const child14 = numberingManager.calculateCounter('list1', 1, 14);
      numberingManager.setCounter('list1', 1, 14, child14);

      const top15 = numberingManager.calculateCounter('list1', 0, 15);
      numberingManager.setCounter('list1', 0, 15, top15);

      const child16 = numberingManager.calculateCounter('list1', 1, 16);
      expect(child16).toBe(1);
      numberingManager.setCounter('list1', 1, 16, child16);

      const grandchild17 = numberingManager.calculateCounter('list1', 2, 17);
      expect(grandchild17).toBe(1);
      numberingManager.setCounter('list1', 2, 17, grandchild17);

      const top18 = numberingManager.calculateCounter('list1', 0, 18);
      numberingManager.setCounter('list1', 0, 18, top18);

      const child19 = numberingManager.calculateCounter('list1', 1, 19);
      numberingManager.setCounter('list1', 1, 19, child19);

      const child20 = numberingManager.calculateCounter('list1', 1, 20);
      numberingManager.setCounter('list1', 1, 20, child20);

      const grandchild21 = numberingManager.calculateCounter('list1', 2, 21);
      expect(grandchild21).toBe(2);
      numberingManager.setCounter('list1', 2, 21, grandchild21);
      expect(numberingManager.calculatePath('list1', 2, 21)).toEqual([4, 2, 2]);
    });

    /*
     * list2
     * - (100) Level 0, first item
     *   - (101) Level 1, first item
     *     - (102) Level 2, first item (start at 4)
     *   - (103) Level 1, second item
     *     - (104) Level 2, second item (should restart to 4 because restart setting = 1)
     */
    it('restarts level 2 numbering when restart threshold is met', () => {
      const numberingManager = makeNumberingManager();
      numberingManager.setStartSettings('list2', 0, 1, null);
      numberingManager.setStartSettings('list2', 2, 4, 1);

      const top100 = numberingManager.calculateCounter('list2', 0, 100);
      numberingManager.setCounter('list2', 0, 100, top100);

      const child101 = numberingManager.calculateCounter('list2', 1, 101);
      numberingManager.setCounter('list2', 1, 101, child101);

      const grandchild102 = numberingManager.calculateCounter('list2', 2, 102);
      expect(grandchild102).toBe(4);
      numberingManager.setCounter('list2', 2, 102, grandchild102);

      const child103 = numberingManager.calculateCounter('list2', 1, 103);
      expect(child103).toBe(2);
      numberingManager.setCounter('list2', 1, 103, child103);

      const grandchild104 = numberingManager.calculateCounter('list2', 2, 104);
      expect(grandchild104).toBe(4);
      numberingManager.setCounter('list2', 2, 104, grandchild104);
      expect(numberingManager.calculatePath('list2', 2, 104)).toEqual([1, 2, 4]);
    });

    /*
     * list3
     * - (400) Level 0, first item
     *   - (401) Level 1, first item
     *     - (402) Level 2, first item
     *       - (403) Level 3, first item (start at 7)
     *     - (404) Level 2, second item
     *       - (405) Level 3, second item (continues to 8)
     *   - (406) Level 1, second item
     *     - (407) Level 2, first item (restarts to 1)
     *       - (408) Level 3, third item (restarts to 7 because level 1 used)
     */
    it('restarts when the restart threshold is two levels below the current level after intermediate siblings', () => {
      const numberingManager = makeNumberingManager();
      numberingManager.setStartSettings('list3', 0, 1, null);
      numberingManager.setStartSettings('list3', 3, 7, 1);

      const top400 = numberingManager.calculateCounter('list3', 0, 400);
      expect(top400).toBe(1);
      numberingManager.setCounter('list3', 0, 400, top400);

      const child401 = numberingManager.calculateCounter('list3', 1, 401);
      expect(child401).toBe(1);
      numberingManager.setCounter('list3', 1, 401, child401);

      const grand402 = numberingManager.calculateCounter('list3', 2, 402);
      expect(grand402).toBe(1);
      numberingManager.setCounter('list3', 2, 402, grand402);

      const level3First = numberingManager.calculateCounter('list3', 3, 403);
      expect(level3First).toBe(7);
      numberingManager.setCounter('list3', 3, 403, level3First);

      const grand404 = numberingManager.calculateCounter('list3', 2, 404);
      expect(grand404).toBe(2);
      numberingManager.setCounter('list3', 2, 404, grand404);

      const level3Second = numberingManager.calculateCounter('list3', 3, 405);
      expect(level3Second).toBe(8);
      numberingManager.setCounter('list3', 3, 405, level3Second);

      const child406 = numberingManager.calculateCounter('list3', 1, 406);
      expect(child406).toBe(2);
      numberingManager.setCounter('list3', 1, 406, child406);

      const grand407 = numberingManager.calculateCounter('list3', 2, 407);
      expect(grand407).toBe(1);
      numberingManager.setCounter('list3', 2, 407, grand407);

      const level3Third = numberingManager.calculateCounter('list3', 3, 408);
      expect(level3Third).toBe(7);
      numberingManager.setCounter('list3', 3, 408, level3Third);
      expect(numberingManager.calculatePath('list3', 3, 408)).toEqual([1, 2, 1, 7]);
    });
  });
});
