import { describe, it, expect, mock, spyOn, beforeEach, afterEach } from 'bun:test';
// @ts-check
import { decreaseListIndent } from './decreaseListIndent.js';
import * as changeListLevelModule from './changeListLevel.js';

describe('decreaseListIndent', () => {
  /** @type {{ state: any }} */
  let editor;
  /** @type {{ docChanged?: boolean }} */
  let tr;
  /** @type<ReturnType<typeof spyOn>> */
  let changeListLevelSpy;

  beforeEach(() => {
    editor = { state: { selection: {} } };
    tr = {};
    changeListLevelSpy = spyOn(changeListLevelModule, 'changeListLevel');
  });

  afterEach(() => {});

  it('returns false when changeListLevel does not handle the command', () => {
    changeListLevelSpy.mockReturnValue(false);

    const result = decreaseListIndent()({ editor, tr });

    expect(result).toBe(false);
    expect(changeListLevelSpy).toHaveBeenCalledWith(-1, editor, tr);
  });

  it('dispatches when changeListLevel handles the interaction', () => {
    changeListLevelSpy.mockReturnValue(true);
    const dispatch = mock();

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
