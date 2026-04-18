// @ts-check
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { increaseListIndent } from './increaseListIndent.js';
import { changeListLevel } from './changeListLevel.js';

vi.mock('./changeListLevel.js', () => ({
  changeListLevel: vi.fn(),
}));

describe('increaseListIndent', () => {
  /** @type {{ state?: any }} */
  let editor;
  /** @type {{ setNodeMarkup?: ReturnType<typeof vi.fn> }} */
  let tr;

  beforeEach(() => {
    vi.clearAllMocks();
    editor = { state: { selection: {} } };
    tr = { setNodeMarkup: vi.fn() };
  });

  it('delegates to changeListLevel with a delta of 1', () => {
    changeListLevel.mockReturnValue(true);

    const result = increaseListIndent()({ editor, tr });

    expect(result).toBe(true);
    expect(changeListLevel).toHaveBeenCalledTimes(1);
    expect(changeListLevel).toHaveBeenCalledWith(1, editor, tr);
  });

  it('returns false when changeListLevel signals failure', () => {
    changeListLevel.mockReturnValue(false);

    const result = increaseListIndent()({ editor, tr });

    expect(result).toBe(false);
  });

  it('dispatches the transaction when changeListLevel succeeds', () => {
    changeListLevel.mockReturnValue(true);
    const dispatch = vi.fn();

    const result = increaseListIndent()({ editor, tr, dispatch });

    expect(result).toBe(true);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith(tr);
  });

  it('does not dispatch when changeListLevel fails', () => {
    changeListLevel.mockReturnValue(false);
    const dispatch = vi.fn();

    const result = increaseListIndent()({ editor, tr, dispatch });

    expect(result).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
  });
});
