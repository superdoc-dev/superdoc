import { describe, expect, it } from 'bun:test';

import { createNumberingManager } from '../src/numbering-manager.js';

const seedTopLevel = (manager: ReturnType<typeof createNumberingManager>, pos: number) => {
  const value = manager.calculateCounter('num', 0, pos, 'abs');
  manager.setCounter('num', 0, pos, value, 'abs');
  return value;
};

describe('NumberingManager', () => {
  it('increments sequential counters for the same level', () => {
    const manager = createNumberingManager();
    manager.setStartSettings('num', 0, 1);

    const first = seedTopLevel(manager, 5);
    const second = seedTopLevel(manager, 10);
    const third = seedTopLevel(manager, 15);

    expect([first, second, third]).toEqual([1, 2, 3]);
  });

  it('restarts intermediate levels when lower levels were used between siblings', () => {
    const manager = createNumberingManager();
    manager.setStartSettings('num', 0, 1);
    manager.setStartSettings('num', 1, 3);

    const firstLevelOne = manager.calculateCounter('num', 1, 6, 'abs');
    manager.setCounter('num', 1, 6, firstLevelOne, 'abs');

    const topSibling = seedTopLevel(manager, 10);
    expect(topSibling).toBe(1);

    const secondLevelOne = manager.calculateCounter('num', 1, 20, 'abs');

    expect(firstLevelOne).toBe(3);
    expect(secondLevelOne).toBe(3); // restart because level 0 was used between siblings
  });

  it('honors restart thresholds when defined', () => {
    const manager = createNumberingManager();
    manager.setStartSettings('num', 0, 1, 0);
    manager.setStartSettings('num', 1, 1);

    const first = seedTopLevel(manager, 2);
    const child = manager.calculateCounter('num', 1, 3, 'abs');
    manager.setCounter('num', 1, 3, child, 'abs');
    const second = seedTopLevel(manager, 4);

    expect(first).toBe(1);
    expect(child).toBe(1);
    expect(second).toBe(2); // restart=0 forces simple increment
  });

  it('returns ancestor paths including previously recorded counts', () => {
    const manager = createNumberingManager();
    manager.setStartSettings('num', 0, 1);
    manager.setStartSettings('num', 1, 1);
    manager.setStartSettings('num', 2, 1);

    const top = seedTopLevel(manager, 5);
    const midValue = manager.calculateCounter('num', 1, 6, 'abs');
    manager.setCounter('num', 1, 6, midValue, 'abs');

    const leafValue = manager.calculateCounter('num', 2, 7, 'abs');
    manager.setCounter('num', 2, 7, leafValue, 'abs');

    const path = manager.calculatePath('num', 2, 7);

    expect(top).toBe(1);
    expect(midValue).toBe(1);
    expect(leafValue).toBe(1);
    expect(path).toEqual([1, 1, 1]);
  });
});

describe('NumberingManager edge cases', () => {
  it('throws error for negative level in setStartSettings', () => {
    const manager = createNumberingManager();
    expect(() => manager.setStartSettings('num', -1, 1)).toThrow(
      'Invalid level: -1. Level must be a non-negative finite number.',
    );
  });

  it('throws error for negative level in setCounter', () => {
    const manager = createNumberingManager();
    expect(() => manager.setCounter('num', -1, 0, 1)).toThrow(
      'Invalid level: -1. Level must be a non-negative finite number.',
    );
  });

  it('throws error for negative position in setCounter', () => {
    const manager = createNumberingManager();
    expect(() => manager.setCounter('num', 0, -5, 1)).toThrow(
      'Invalid position: -5. Position must be a non-negative finite number.',
    );
  });

  it('throws error for non-finite value in setCounter', () => {
    const manager = createNumberingManager();
    expect(() => manager.setCounter('num', 0, 5, Infinity)).toThrow(
      'Invalid value: Infinity. Value must be a finite number.',
    );
  });

  it('throws error for negative level in getCounter', () => {
    const manager = createNumberingManager();
    expect(() => manager.getCounter('num', -1, 0)).toThrow(
      'Invalid level: -1. Level must be a non-negative finite number.',
    );
  });

  it('throws error for negative position in getCounter', () => {
    const manager = createNumberingManager();
    expect(() => manager.getCounter('num', 0, -1)).toThrow(
      'Invalid position: -1. Position must be a non-negative finite number.',
    );
  });

  it('throws error for negative level in calculateCounter', () => {
    const manager = createNumberingManager();
    expect(() => manager.calculateCounter('num', -1, 0)).toThrow(
      'Invalid level: -1. Level must be a non-negative finite number.',
    );
  });

  it('throws error for negative position in calculateCounter', () => {
    const manager = createNumberingManager();
    expect(() => manager.calculateCounter('num', 0, -1)).toThrow(
      'Invalid position: -1. Position must be a non-negative finite number.',
    );
  });

  it('throws error for NaN level in setCounter', () => {
    const manager = createNumberingManager();
    expect(() => manager.setCounter('num', NaN, 0, 1)).toThrow('Invalid level');
  });

  it('throws error for Infinity position in setCounter', () => {
    const manager = createNumberingManager();
    expect(() => manager.setCounter('num', 0, Infinity, 1)).toThrow('Invalid position');
  });

  it('handles string numId correctly', () => {
    const manager = createNumberingManager();
    manager.setStartSettings('string-id', 0, 1);

    const value = manager.calculateCounter('string-id', 0, 5, 'abs');
    manager.setCounter('string-id', 0, 5, value, 'abs');

    expect(value).toBe(1);
  });

  it('handles numeric numId correctly', () => {
    const manager = createNumberingManager();
    manager.setStartSettings(123, 0, 1);

    const value = manager.calculateCounter(123, 0, 5, 'abs');
    manager.setCounter(123, 0, 5, value, 'abs');

    expect(value).toBe(1);
  });

  it('handles very large position values', () => {
    const manager = createNumberingManager();
    manager.setStartSettings('num', 0, 1);

    const value1 = manager.calculateCounter('num', 0, 1000000, 'abs');
    manager.setCounter('num', 0, 1000000, value1, 'abs');

    const value2 = manager.calculateCounter('num', 0, 2000000, 'abs');
    manager.setCounter('num', 0, 2000000, value2, 'abs');

    expect(value1).toBe(1);
    expect(value2).toBe(2);
  });

  it('returns null when counter not found', () => {
    const manager = createNumberingManager();
    expect(manager.getCounter('nonexistent', 0, 5)).toBeNull();
  });

  it('handles abstract ID mapping with different types', () => {
    const manager = createNumberingManager();
    manager.setStartSettings('num1', 0, 1);

    const value1 = manager.calculateCounter('num1', 0, 5, 'abstract-1');
    manager.setCounter('num1', 0, 5, value1, 'abstract-1');

    const value2 = manager.calculateCounter('num1', 0, 10, 'abstract-1');
    manager.setCounter('num1', 0, 10, value2, 'abstract-1');

    expect(value1).toBe(1);
    expect(value2).toBe(2);
  });

  it('handles concurrent setCounter calls at same position', () => {
    const manager = createNumberingManager();
    manager.setStartSettings('num', 0, 1);

    manager.setCounter('num', 0, 5, 10, 'abs');
    manager.setCounter('num', 0, 5, 20, 'abs'); // overwrite

    const value = manager.getCounter('num', 0, 5);
    expect(value).toBe(20);
  });

  it('handles cache enable/disable correctly', () => {
    const manager = createNumberingManager();
    manager.setStartSettings('num', 0, 1);

    const value0 = manager.calculateCounter('num', 0, 3, 'abs');
    manager.setCounter('num', 0, 3, value0, 'abs');

    manager.enableCache(); // This clears the cache
    const value1 = manager.calculateCounter('num', 0, 5, 'abs');
    manager.setCounter('num', 0, 5, value1, 'abs');

    manager.disableCache(); // This also clears the cache

    // After disabling cache and clearing, we need to set up counters again
    const value2 = manager.calculateCounter('num', 0, 10, 'abs');
    manager.setCounter('num', 0, 10, value2, 'abs');

    expect(value0).toBe(1);
    expect(value1).toBe(1); // Cache was cleared by enableCache
    expect(value2).toBe(1); // Cache was cleared by disableCache
  });

  it('clears cache when enableCache is called', () => {
    const manager = createNumberingManager();
    manager.setStartSettings('num', 0, 1);

    manager.setCounter('num', 0, 5, 10, 'abs');
    manager.enableCache();

    // After enabling cache, counters should be cleared
    const map = manager.getCountersMap();
    expect(Object.keys(map).length).toBe(0);
  });

  it('handles getAncestorsPath with no prior data', () => {
    const manager = createNumberingManager();
    manager.setStartSettings('num', 0, 5);
    manager.setStartSettings('num', 1, 3);

    const path = manager.getAncestorsPath('num', 2, 10);
    expect(path).toEqual([5, 3]);
  });

  it('handles calculatePath with zero levels', () => {
    const manager = createNumberingManager();
    manager.setStartSettings('num', 0, 1);

    const value = manager.calculateCounter('num', 0, 5, 'abs');
    manager.setCounter('num', 0, 5, value, 'abs');

    const path = manager.calculatePath('num', 0, 5);
    expect(path).toEqual([1]);
  });

  it('handles calculatePath when counter not set', () => {
    const manager = createNumberingManager();
    manager.setStartSettings('num', 0, 1);
    manager.setStartSettings('num', 1, 1);

    const path = manager.calculatePath('num', 1, 10);
    expect(path).toEqual([1]); // Only ancestor, no current level counter
  });

  it('throws error for non-finite startValue in setStartSettings', () => {
    const manager = createNumberingManager();
    expect(() => manager.setStartSettings('num', 0, NaN)).toThrow(
      'Invalid startValue: NaN. Start value must be a finite number.',
    );
  });

  it('throws error for non-finite restartValue in setStartSettings', () => {
    const manager = createNumberingManager();
    expect(() => manager.setStartSettings('num', 0, 1, Infinity)).toThrow(
      'Invalid restartValue: Infinity. Restart value must be a finite number.',
    );
  });
});

describe('NumberingManager - numId validation', () => {
  it('throws error for empty string numId in setStartSettings', () => {
    const manager = createNumberingManager();
    expect(() => manager.setStartSettings('', 0, 1)).toThrow(
      'Invalid numId: empty string. NumId must be a non-empty string or number.',
    );
  });

  it('throws error for whitespace-only string numId in setStartSettings', () => {
    const manager = createNumberingManager();
    expect(() => manager.setStartSettings('   ', 0, 1)).toThrow(
      'Invalid numId: empty string. NumId must be a non-empty string or number.',
    );
  });

  it('throws error for NaN numId in setStartSettings', () => {
    const manager = createNumberingManager();
    expect(() => manager.setStartSettings(NaN, 0, 1)).toThrow('Invalid numId: NaN. NumId must be a finite number.');
  });

  it('throws error for Infinity numId in setStartSettings', () => {
    const manager = createNumberingManager();
    expect(() => manager.setStartSettings(Infinity, 0, 1)).toThrow(
      'Invalid numId: Infinity. NumId must be a finite number.',
    );
  });

  it('throws error for empty string numId in setCounter', () => {
    const manager = createNumberingManager();
    expect(() => manager.setCounter('', 0, 5, 1)).toThrow(
      'Invalid numId: empty string. NumId must be a non-empty string or number.',
    );
  });

  it('throws error for NaN numId in setCounter', () => {
    const manager = createNumberingManager();
    expect(() => manager.setCounter(NaN, 0, 5, 1)).toThrow('Invalid numId: NaN. NumId must be a finite number.');
  });

  it('throws error for empty string numId in getCounter', () => {
    const manager = createNumberingManager();
    expect(() => manager.getCounter('', 0, 5)).toThrow(
      'Invalid numId: empty string. NumId must be a non-empty string or number.',
    );
  });

  it('throws error for NaN numId in getCounter', () => {
    const manager = createNumberingManager();
    expect(() => manager.getCounter(NaN, 0, 5)).toThrow('Invalid numId: NaN. NumId must be a finite number.');
  });

  it('throws error for empty string numId in calculateCounter', () => {
    const manager = createNumberingManager();
    expect(() => manager.calculateCounter('', 0, 5)).toThrow(
      'Invalid numId: empty string. NumId must be a non-empty string or number.',
    );
  });

  it('throws error for NaN numId in calculateCounter', () => {
    const manager = createNumberingManager();
    expect(() => manager.calculateCounter(NaN, 0, 5)).toThrow('Invalid numId: NaN. NumId must be a finite number.');
  });

  it('throws error for empty string numId in getAncestorsPath', () => {
    const manager = createNumberingManager();
    expect(() => manager.getAncestorsPath('', 1, 5)).toThrow(
      'Invalid numId: empty string. NumId must be a non-empty string or number.',
    );
  });

  it('throws error for empty string numId in calculatePath', () => {
    const manager = createNumberingManager();
    expect(() => manager.calculatePath('', 1, 5)).toThrow(
      'Invalid numId: empty string. NumId must be a non-empty string or number.',
    );
  });
});

describe('NumberingManager - calculateCounter error handling', () => {
  it('validates startValue is finite during setStartSettings', () => {
    const manager = createNumberingManager();
    // setStartSettings should validate and throw for NaN
    expect(() => manager.setStartSettings('num', 0, NaN)).toThrow(
      'Invalid startValue: NaN. Start value must be a finite number.',
    );
  });

  it('throws error when counter would overflow', () => {
    const manager = createNumberingManager();
    manager.setStartSettings('num', 0, 1);

    // Set a counter value near MAX_SAFE_INTEGER
    manager.setCounter('num', 0, 5, Number.MAX_SAFE_INTEGER, 'abs');

    // Next calculation should overflow
    expect(() => manager.calculateCounter('num', 0, 10, 'abs')).toThrow('Counter overflow');
  });

  it('handles very large but valid counter values', () => {
    const manager = createNumberingManager();
    const largeValue = Number.MAX_SAFE_INTEGER - 10;
    manager.setStartSettings('num', 0, largeValue);

    const value = manager.calculateCounter('num', 0, 5, 'abs');
    expect(value).toBe(largeValue);
  });
});

describe('NumberingManager - super-editor parity scenarios (no abstractId)', () => {
  it('restarts level 1 when a new level 0 item appears with default restart rules', () => {
    const manager = createNumberingManager();
    manager.setStartSettings('list1', 0, 1);
    manager.setStartSettings('list1', 1, 1);

    const top10 = manager.calculateCounter('list1', 0, 10);
    manager.setCounter('list1', 0, 10, top10);

    const top11 = manager.calculateCounter('list1', 0, 11);
    manager.setCounter('list1', 0, 11, top11);

    const child13 = manager.calculateCounter('list1', 1, 13);
    expect(child13).toBe(1);
    manager.setCounter('list1', 1, 13, child13);

    const child14 = manager.calculateCounter('list1', 1, 14);
    expect(child14).toBe(2);
    manager.setCounter('list1', 1, 14, child14);

    const top15 = manager.calculateCounter('list1', 0, 15);
    expect(top15).toBe(3);
    manager.setCounter('list1', 0, 15, top15);

    const restartedChild = manager.calculateCounter('list1', 1, 16);
    expect(restartedChild).toBe(1);
    manager.setCounter('list1', 1, 16, restartedChild);
    expect(manager.getAncestorsPath('list1', 1, 16)).toEqual([3]);
    expect(manager.calculatePath('list1', 1, 16)).toEqual([3, 1]);
  });

  it('continues level 2 when restart setting is zero despite lower-level usage', () => {
    const manager = createNumberingManager();
    manager.setStartSettings('list1', 0, 1);
    manager.setStartSettings('list1', 2, 1, 0);

    const top10 = manager.calculateCounter('list1', 0, 10);
    manager.setCounter('list1', 0, 10, top10);

    const top11 = manager.calculateCounter('list1', 0, 11);
    manager.setCounter('list1', 0, 11, top11);

    const child13 = manager.calculateCounter('list1', 1, 13);
    manager.setCounter('list1', 1, 13, child13);

    const child14 = manager.calculateCounter('list1', 1, 14);
    manager.setCounter('list1', 1, 14, child14);

    const top15 = manager.calculateCounter('list1', 0, 15);
    manager.setCounter('list1', 0, 15, top15);

    const child16 = manager.calculateCounter('list1', 1, 16);
    expect(child16).toBe(1);
    manager.setCounter('list1', 1, 16, child16);

    const grandchild17 = manager.calculateCounter('list1', 2, 17);
    expect(grandchild17).toBe(1);
    manager.setCounter('list1', 2, 17, grandchild17);

    const top18 = manager.calculateCounter('list1', 0, 18);
    manager.setCounter('list1', 0, 18, top18);

    const child19 = manager.calculateCounter('list1', 1, 19);
    manager.setCounter('list1', 1, 19, child19);

    const child20 = manager.calculateCounter('list1', 1, 20);
    manager.setCounter('list1', 1, 20, child20);

    const grandchild21 = manager.calculateCounter('list1', 2, 21);
    expect(grandchild21).toBe(2);
    manager.setCounter('list1', 2, 21, grandchild21);
    expect(manager.calculatePath('list1', 2, 21)).toEqual([4, 2, 2]);
  });

  it('restarts level 2 numbering when restart threshold is met', () => {
    const manager = createNumberingManager();
    manager.setStartSettings('list2', 0, 1);
    manager.setStartSettings('list2', 2, 4, 1);

    const top100 = manager.calculateCounter('list2', 0, 100);
    manager.setCounter('list2', 0, 100, top100);

    const child101 = manager.calculateCounter('list2', 1, 101);
    manager.setCounter('list2', 1, 101, child101);

    const grandchild102 = manager.calculateCounter('list2', 2, 102);
    expect(grandchild102).toBe(4);
    manager.setCounter('list2', 2, 102, grandchild102);

    const child103 = manager.calculateCounter('list2', 1, 103);
    expect(child103).toBe(2);
    manager.setCounter('list2', 1, 103, child103);

    const grandchild104 = manager.calculateCounter('list2', 2, 104);
    expect(grandchild104).toBe(4);
    manager.setCounter('list2', 2, 104, grandchild104);
    expect(manager.calculatePath('list2', 2, 104)).toEqual([1, 2, 4]);
  });

  it('restarts when the restart threshold is two levels below the current level after intermediate siblings', () => {
    const manager = createNumberingManager();
    manager.setStartSettings('list3', 0, 1);
    manager.setStartSettings('list3', 3, 7, 1);

    const top400 = manager.calculateCounter('list3', 0, 400);
    expect(top400).toBe(1);
    manager.setCounter('list3', 0, 400, top400);

    const child401 = manager.calculateCounter('list3', 1, 401);
    expect(child401).toBe(1);
    manager.setCounter('list3', 1, 401, child401);

    const grand402 = manager.calculateCounter('list3', 2, 402);
    expect(grand402).toBe(1);
    manager.setCounter('list3', 2, 402, grand402);

    const level3First = manager.calculateCounter('list3', 3, 403);
    expect(level3First).toBe(7);
    manager.setCounter('list3', 3, 403, level3First);

    const grand404 = manager.calculateCounter('list3', 2, 404);
    expect(grand404).toBe(2);
    manager.setCounter('list3', 2, 404, grand404);

    const level3Second = manager.calculateCounter('list3', 3, 405);
    expect(level3Second).toBe(8);
    manager.setCounter('list3', 3, 405, level3Second);

    const child406 = manager.calculateCounter('list3', 1, 406);
    expect(child406).toBe(2);
    manager.setCounter('list3', 1, 406, child406);

    const grand407 = manager.calculateCounter('list3', 2, 407);
    expect(grand407).toBe(1);
    manager.setCounter('list3', 2, 407, grand407);

    const level3Third = manager.calculateCounter('list3', 3, 408);
    expect(level3Third).toBe(7);
    manager.setCounter('list3', 3, 408, level3Third);
    expect(manager.calculatePath('list3', 3, 408)).toEqual([1, 2, 1, 7]);
  });
});

describe('NumberingManager - abstract ID mapping edge cases', () => {
  it('handles changing abstractId for same numId', () => {
    const manager = createNumberingManager();
    manager.setStartSettings('num', 0, 1);
    manager.setStartSettings('num', 1, 1);

    // First use abstract1
    const value1 = manager.calculateCounter('num', 0, 5, 'abstract1');
    manager.setCounter('num', 0, 5, value1, 'abstract1');

    const child1 = manager.calculateCounter('num', 1, 10, 'abstract1');
    manager.setCounter('num', 1, 10, child1, 'abstract1');

    // Now switch to abstract2 for the same numId
    // The counter continues because it's the same numId, just different abstract mapping
    const value2 = manager.calculateCounter('num', 0, 15, 'abstract2');
    manager.setCounter('num', 0, 15, value2, 'abstract2');

    // Child should restart because parent level (0) was used between positions 10 and 20
    const child2 = manager.calculateCounter('num', 1, 20, 'abstract2');

    expect(value1).toBe(1);
    expect(child1).toBe(1);
    expect(value2).toBe(2); // Continues from value1 because same numId
    expect(child2).toBe(1); // Should restart due to parent level usage
  });

  it('handles mixed abstractId usage (some with, some without)', () => {
    const manager = createNumberingManager();
    manager.setStartSettings('num', 0, 1);

    // First counter without abstractId
    const value1 = manager.calculateCounter('num', 0, 5);
    manager.setCounter('num', 0, 5, value1);

    // Second counter with abstractId
    const value2 = manager.calculateCounter('num', 0, 10, 'abstract1');
    manager.setCounter('num', 0, 10, value2, 'abstract1');

    // Third counter without abstractId again (but numId now has abstractId mapping)
    const value3 = manager.calculateCounter('num', 0, 15);
    manager.setCounter('num', 0, 15, value3);

    expect(value1).toBe(1);
    expect(value2).toBe(2);
    expect(value3).toBe(3); // Should continue incrementing
  });

  it('maintains separate abstract counter maps per abstractId', () => {
    const manager = createNumberingManager();
    manager.setStartSettings('num1', 0, 1);
    manager.setStartSettings('num1', 1, 1);
    manager.setStartSettings('num2', 0, 1);
    manager.setStartSettings('num2', 1, 1);

    // num1 with abstract1
    const num1_val1 = manager.calculateCounter('num1', 0, 5, 'abstract1');
    manager.setCounter('num1', 0, 5, num1_val1, 'abstract1');

    const num1_child1 = manager.calculateCounter('num1', 1, 10, 'abstract1');
    manager.setCounter('num1', 1, 10, num1_child1, 'abstract1');

    // num2 with abstract2 (different abstract ID)
    const num2_val1 = manager.calculateCounter('num2', 0, 15, 'abstract2');
    manager.setCounter('num2', 0, 15, num2_val1, 'abstract2');

    const num2_child1 = manager.calculateCounter('num2', 1, 20, 'abstract2');
    manager.setCounter('num2', 1, 20, num2_child1, 'abstract2');

    // More num1 counters - should continue from where it left off
    const num1_val2 = manager.calculateCounter('num1', 0, 25, 'abstract1');
    manager.setCounter('num1', 0, 25, num1_val2, 'abstract1');

    expect(num1_val1).toBe(1);
    expect(num1_child1).toBe(1);
    expect(num2_val1).toBe(1);
    expect(num2_child1).toBe(1);
    expect(num1_val2).toBe(2);
  });
});

describe('NumberingManager - cache correctness', () => {
  it('produces same results with and without cache', () => {
    // Test without cache
    const manager1 = createNumberingManager();
    manager1.setStartSettings('num', 0, 1);
    manager1.setStartSettings('num', 1, 1);

    const val1_1 = manager1.calculateCounter('num', 0, 5, 'abs');
    manager1.setCounter('num', 0, 5, val1_1, 'abs');

    const val1_2 = manager1.calculateCounter('num', 1, 10, 'abs');
    manager1.setCounter('num', 1, 10, val1_2, 'abs');

    const val1_3 = manager1.calculateCounter('num', 0, 15, 'abs');
    manager1.setCounter('num', 0, 15, val1_3, 'abs');

    const val1_4 = manager1.calculateCounter('num', 1, 20, 'abs');

    // Test with cache
    const manager2 = createNumberingManager();
    manager2.enableCache();
    manager2.setStartSettings('num', 0, 1);
    manager2.setStartSettings('num', 1, 1);

    const val2_1 = manager2.calculateCounter('num', 0, 5, 'abs');
    manager2.setCounter('num', 0, 5, val2_1, 'abs');

    const val2_2 = manager2.calculateCounter('num', 1, 10, 'abs');
    manager2.setCounter('num', 1, 10, val2_2, 'abs');

    const val2_3 = manager2.calculateCounter('num', 0, 15, 'abs');
    manager2.setCounter('num', 0, 15, val2_3, 'abs');

    const val2_4 = manager2.calculateCounter('num', 1, 20, 'abs');

    expect(val1_1).toBe(val2_1);
    expect(val1_2).toBe(val2_2);
    expect(val1_3).toBe(val2_3);
    expect(val1_4).toBe(val2_4);
  });

  it('handles out-of-order position operations correctly', () => {
    const manager = createNumberingManager();
    manager.enableCache();
    manager.setStartSettings('num', 0, 1);

    // Set counters out of order
    const val3 = manager.calculateCounter('num', 0, 30, 'abs');
    manager.setCounter('num', 0, 30, val3, 'abs');

    const val1 = manager.calculateCounter('num', 0, 10, 'abs');
    manager.setCounter('num', 0, 10, val1, 'abs');

    const val2 = manager.calculateCounter('num', 0, 20, 'abs');
    manager.setCounter('num', 0, 20, val2, 'abs');

    const val4 = manager.calculateCounter('num', 0, 40, 'abs');

    expect(val3).toBe(1); // First one, no previous
    expect(val1).toBe(1); // No previous at position 10
    expect(val2).toBe(2); // Previous is at position 10
    expect(val4).toBe(2); // Previous is at position 30 with value 1, so 1+1=2
  });

  it('cache preserves ancestor path calculations', () => {
    const manager = createNumberingManager();
    manager.enableCache();
    manager.setStartSettings('num', 0, 1);
    manager.setStartSettings('num', 1, 1);
    manager.setStartSettings('num', 2, 1);

    const top = manager.calculateCounter('num', 0, 5, 'abs');
    manager.setCounter('num', 0, 5, top, 'abs');

    const mid = manager.calculateCounter('num', 1, 10, 'abs');
    manager.setCounter('num', 1, 10, mid, 'abs');

    // First call - cache miss
    const path1 = manager.getAncestorsPath('num', 2, 15);

    // Second call - cache hit
    const path2 = manager.getAncestorsPath('num', 2, 15);

    expect(path1).toEqual([1, 1]);
    expect(path2).toEqual([1, 1]);
  });
});

describe('NumberingManager - getAncestorsPath detailed tests', () => {
  it('returns actual counter values, not just start values', () => {
    const manager = createNumberingManager();
    manager.setStartSettings('num', 0, 10);
    manager.setStartSettings('num', 1, 20);
    manager.setStartSettings('num', 2, 30);

    // Set actual counters that differ from start values
    manager.setCounter('num', 0, 5, 100, 'abs');
    manager.setCounter('num', 1, 10, 200, 'abs');

    const path = manager.getAncestorsPath('num', 2, 15);

    // Should return actual counter values [100, 200], not start values [10, 20]
    expect(path).toEqual([100, 200]);
  });

  it('returns start values when no counters are set', () => {
    const manager = createNumberingManager();
    manager.setStartSettings('num', 0, 5);
    manager.setStartSettings('num', 1, 10);

    const path = manager.getAncestorsPath('num', 2, 15);

    expect(path).toEqual([5, 10]);
  });

  it('mixes actual counters and start values appropriately', () => {
    const manager = createNumberingManager();
    manager.setStartSettings('num', 0, 1);
    manager.setStartSettings('num', 1, 1);
    manager.setStartSettings('num', 2, 1);

    // Only set counter for level 0
    manager.setCounter('num', 0, 5, 7, 'abs');

    const path = manager.getAncestorsPath('num', 2, 15);

    // Should return [7, 1] - actual counter for level 0, start value for level 1
    expect(path).toEqual([7, 1]);
  });

  it('finds most recent ancestor counter before position', () => {
    const manager = createNumberingManager();
    manager.setStartSettings('num', 0, 1);
    manager.setStartSettings('num', 1, 1);

    manager.setCounter('num', 0, 5, 1, 'abs');
    manager.setCounter('num', 0, 15, 2, 'abs');
    manager.setCounter('num', 0, 25, 3, 'abs');

    // At position 20, most recent level 0 counter is at position 15
    const path = manager.getAncestorsPath('num', 1, 20);

    expect(path).toEqual([2]);
  });
});

describe('NumberingManager - comprehensive restart logic', () => {
  it('restarts with multiple intermediate levels used', () => {
    const manager = createNumberingManager();
    manager.setStartSettings('num', 0, 1);
    manager.setStartSettings('num', 1, 1);
    manager.setStartSettings('num', 2, 1);
    manager.setStartSettings('num', 3, 1);

    // Level 3 item
    const leaf1 = manager.calculateCounter('num', 3, 10, 'abs');
    manager.setCounter('num', 3, 10, leaf1, 'abs');

    // Use level 0, 1, and 2 between siblings
    const top = manager.calculateCounter('num', 0, 15, 'abs');
    manager.setCounter('num', 0, 15, top, 'abs');

    const mid1 = manager.calculateCounter('num', 1, 20, 'abs');
    manager.setCounter('num', 1, 20, mid1, 'abs');

    const mid2 = manager.calculateCounter('num', 2, 25, 'abs');
    manager.setCounter('num', 2, 25, mid2, 'abs');

    // Second level 3 item - should restart because parents were used
    const leaf2 = manager.calculateCounter('num', 3, 30, 'abs');

    expect(leaf1).toBe(1);
    expect(leaf2).toBe(1); // Restarts
  });

  it('handles exact restart threshold matches', () => {
    const manager = createNumberingManager();
    manager.setStartSettings('num', 0, 1);
    manager.setStartSettings('num', 1, 1);
    manager.setStartSettings('num', 2, 1, 1); // Restart if level <= 1 is used

    // First level 2 item
    const first = manager.calculateCounter('num', 2, 5, 'abs');
    manager.setCounter('num', 2, 5, first, 'abs');

    // Use level 1 (exactly the threshold) between siblings
    const mid = manager.calculateCounter('num', 1, 10, 'abs');
    manager.setCounter('num', 1, 10, mid, 'abs');

    // Second level 2 item - should restart because level 1 was used (at threshold)
    const second = manager.calculateCounter('num', 2, 15, 'abs');
    manager.setCounter('num', 2, 15, second, 'abs');

    expect(first).toBe(1);
    expect(second).toBe(1); // Should restart because level 1 was used (at threshold)

    // Now test that level 0 also causes restart (below threshold)
    const top = manager.calculateCounter('num', 0, 20, 'abs');
    manager.setCounter('num', 0, 20, top, 'abs');

    const third = manager.calculateCounter('num', 2, 25, 'abs');

    expect(third).toBe(1); // Should restart because level 0 was used (below threshold)
  });

  it('does not restart when used level is above threshold', () => {
    const manager = createNumberingManager();
    manager.setStartSettings('num', 0, 1);
    manager.setStartSettings('num', 1, 1);
    manager.setStartSettings('num', 2, 1);
    manager.setStartSettings('num', 3, 1, 0); // Restart only if level <= 0 is used

    const first = manager.calculateCounter('num', 3, 5, 'abs');
    manager.setCounter('num', 3, 5, first, 'abs');

    // Use levels 1 and 2 (both above threshold of 0)
    const mid1 = manager.calculateCounter('num', 1, 10, 'abs');
    manager.setCounter('num', 1, 10, mid1, 'abs');

    const mid2 = manager.calculateCounter('num', 2, 15, 'abs');
    manager.setCounter('num', 2, 15, mid2, 'abs');

    const second = manager.calculateCounter('num', 3, 20, 'abs');

    expect(first).toBe(1);
    expect(second).toBe(2); // Should NOT restart
  });

  it('handles deeply nested hierarchies (5+ levels)', () => {
    const manager = createNumberingManager();
    for (let i = 0; i < 7; i++) {
      manager.setStartSettings('num', i, 1);
    }

    // Build a deep hierarchy at positions 10-16
    for (let level = 0; level < 7; level++) {
      const value = manager.calculateCounter('num', level, 10 + level, 'abs');
      manager.setCounter('num', level, 10 + level, value, 'abs');
    }
    // At position 16, level 6 has value 1

    // First deep level item at position 20 (after position 16 from the loop)
    const deep1 = manager.calculateCounter('num', 6, 20, 'abs');
    manager.setCounter('num', 6, 20, deep1, 'abs');

    // Second deep level item at position 25 (no parent levels used in between)
    const deep2 = manager.calculateCounter('num', 6, 25, 'abs');
    manager.setCounter('num', 6, 25, deep2, 'abs');

    // Now use top level between siblings
    const top = manager.calculateCounter('num', 0, 30, 'abs');
    manager.setCounter('num', 0, 30, top, 'abs');

    // Third deep level item - should restart
    const deep3 = manager.calculateCounter('num', 6, 35, 'abs');

    expect(deep1).toBe(2); // Continues from position 16 (which was 1)
    expect(deep2).toBe(3); // Increments, no restart
    expect(deep3).toBe(1); // Should restart because level 0 was used
  });

  it('handles restart logic with no abstractId by using a fallback bucket', () => {
    const manager = createNumberingManager();
    manager.setStartSettings('num', 0, 1);
    manager.setStartSettings('num', 1, 1);

    const first = manager.calculateCounter('num', 1, 5); // No abstractId
    manager.setCounter('num', 1, 5, first);

    const top = manager.calculateCounter('num', 0, 10); // No abstractId
    manager.setCounter('num', 0, 10, top);

    const second = manager.calculateCounter('num', 1, 15); // No abstractId

    expect(first).toBe(1);
    expect(second).toBe(1); // Uses fallback bucket, so restart occurs because parent level was used
  });
});

describe('NumberingManager - clearAllState', () => {
  it('clears all counters and state', () => {
    const manager = createNumberingManager();
    manager.setStartSettings('num', 0, 1);

    const value1 = manager.calculateCounter('num', 0, 5, 'abs');
    manager.setCounter('num', 0, 5, value1, 'abs');

    manager.clearAllState();

    const map = manager.getCountersMap();
    expect(Object.keys(map).length).toBe(0);

    // After clearing, calculations should start fresh
    const value2 = manager.calculateCounter('num', 0, 10, 'abs');
    expect(value2).toBe(1); // Starts fresh (uses default start value of 1)
  });

  it('clears abstract ID mappings', () => {
    const manager = createNumberingManager();
    manager.setStartSettings('num', 0, 1);
    manager.setStartSettings('num', 1, 1);

    const val1 = manager.calculateCounter('num', 0, 5, 'abs1');
    manager.setCounter('num', 0, 5, val1, 'abs1');

    const child1 = manager.calculateCounter('num', 1, 10, 'abs1');
    manager.setCounter('num', 1, 10, child1, 'abs1');

    manager.clearAllState();

    // After clearing, should be able to use different abstractId without conflict
    const val2 = manager.calculateCounter('num', 0, 15, 'abs2');
    manager.setCounter('num', 0, 15, val2, 'abs2');

    expect(val2).toBe(1);
  });
});
