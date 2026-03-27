// @ts-check
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { decreaseListIndent } from './decreaseListIndent.js';
import * as changeListLevelModule from './changeListLevel.js';

describe('decreaseListIndent', () => {
  /** @type {{ state: any }} */
  let editor;
  /** @type {{ docChanged?: boolean }} */
  let tr;
  /** @type<ReturnType<typeof vi.spyOn>> */
  let changeListLevelSpy;

  beforeEach(() => {
    editor = { state: { selection: {} } };
    tr = {};
    changeListLevelSpy = vi.spyOn(changeListLevelModule, 'changeListLevel');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns false when changeListLevel does not handle the command', () => {
    changeListLevelSpy.mockReturnValue(false);

    const result = decreaseListIndent()({ editor, tr });

    expect(result).toBe(false);
    expect(changeListLevelSpy).toHaveBeenCalledWith(-1, editor, tr);
  });

  it('dispatches when changeListLevel handles the interaction', () => {
    changeListLevelSpy.mockReturnValue(true);
    const dispatch = vi.fn();

    const result = decreaseListIndent()({ editor, tr, dispatch });

    expect(result).toBe(true);
    expect(changeListLevelSpy).toHaveBeenCalledWith(-1, editor, tr);
    expect(dispatch).toHaveBeenCalledWith(tr);
  });

  it('does not dispatch when changeListLevel succeeds but no dispatch is provided', () => {
    changeListLevelSpy.mockReturnValue(true);

    const result = decreaseListIndent()({ editor, tr });

    expect(result).toBe(true);
    expect(changeListLevelSpy).toHaveBeenCalledWith(-1, editor, tr);
  });
});
