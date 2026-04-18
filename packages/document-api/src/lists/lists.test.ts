import { describe, expect, it, mock } from 'bun:test';
import {
  executeListsList,
  executeListsGet,
  executeListsCreate,
  executeListsIndent,
  executeListsInsert,
  executeListsAttach,
  executeListsSeparate,
  executeListsJoin,
  executeListsSetLevel,
  executeListsSetValue,
  executeListsConvertToText,
  executeListsApplyTemplate,
  executeListsApplyPreset,
  executeListsSetType,
  executeListsRestartAt,
  executeListsGetStyle,
  executeListsApplyStyle,
  executeListsSetLevelIndents,
  executeListsSetLevelNumbering,
  executeListsSetLevelTrailingCharacter,
  executeListsSetLevelLayout,
  executeListsSetLevelAlignment,
  executeListsSetLevelRestart,
} from './lists.js';

const validTarget = { kind: 'block' as const, nodeType: 'listItem' as const, nodeId: 'li-1' };

const stubAdapter = () =>
  ({
    list: mock(() => ({ items: [], total: 0 })),
    get: mock(() => ({ address: validTarget, listId: 'l1' })),
    insert: mock(() => ({ success: true })),
    indent: mock(() => ({ success: true })),
    outdent: mock(() => ({ success: true })),
    create: mock(() => ({ success: true })),
    attach: mock(() => ({ success: true })),
    detach: mock(() => ({ success: true })),
    join: mock(() => ({ success: true })),
    canJoin: mock(() => ({ canJoin: true })),
    separate: mock(() => ({ success: true })),
    setLevel: mock(() => ({ success: true })),
    setValue: mock(() => ({ success: true })),
    continuePrevious: mock(() => ({ success: true })),
    canContinuePrevious: mock(() => ({ canContinue: true })),
    setLevelRestart: mock(() => ({ success: true })),
    convertToText: mock(() => ({ success: true })),
    applyTemplate: mock(() => ({ success: true })),
    applyPreset: mock(() => ({ success: true })),
    captureTemplate: mock(() => ({ success: true })),
    setLevelNumbering: mock(() => ({ success: true })),
    setLevelBullet: mock(() => ({ success: true })),
    setLevelPictureBullet: mock(() => ({ success: true })),
    setLevelAlignment: mock(() => ({ success: true })),
    setLevelIndents: mock(() => ({ success: true })),
    setLevelTrailingCharacter: mock(() => ({ success: true })),
    setLevelMarkerFont: mock(() => ({ success: true })),
    clearLevelOverrides: mock(() => ({ success: true })),
    setType: mock(() => ({ success: true })),
    getStyle: mock(() => ({})),
    applyStyle: mock(() => ({ success: true })),
    restartAt: mock(() => ({ success: true })),
    setLevelNumberStyle: mock(() => ({ success: true })),
    setLevelText: mock(() => ({ success: true })),
    setLevelStart: mock(() => ({ success: true })),
    setLevelLayout: mock(() => ({ success: true })),
  }) as any;

// ---------------------------------------------------------------------------
// Finding 3: validateListItemTarget is now strict — listItem only
// ---------------------------------------------------------------------------

describe('validateListItemTarget (strict listItem)', () => {
  it('rejects null target', () => {
    expect(() => executeListsIndent(stubAdapter(), { target: null } as any)).toThrow(/requires a target/);
  });

  it('rejects non-object target', () => {
    expect(() => executeListsIndent(stubAdapter(), { target: 'bad' } as any)).toThrow(/must be an object/);
  });

  it('rejects target with wrong kind', () => {
    expect(() =>
      executeListsIndent(stubAdapter(), { target: { kind: 'inline', nodeType: 'listItem', nodeId: 'x' } } as any),
    ).toThrow(/kind must be 'block'/);
  });

  it('rejects target with nodeType paragraph (strict listItem)', () => {
    expect(() =>
      executeListsIndent(stubAdapter(), { target: { kind: 'block', nodeType: 'paragraph', nodeId: 'x' } }),
    ).toThrow(/nodeType must be 'listItem'/);
  });

  it('rejects target with invalid nodeType', () => {
    expect(() =>
      executeListsIndent(stubAdapter(), { target: { kind: 'block', nodeType: 'table', nodeId: 'x' } } as any),
    ).toThrow(/nodeType must be 'listItem'/);
  });

  it('rejects target with empty nodeId', () => {
    expect(() =>
      executeListsIndent(stubAdapter(), { target: { kind: 'block', nodeType: 'listItem', nodeId: '' } }),
    ).toThrow(/nodeId must be a non-empty string/);
  });

  it('accepts valid listItem target', () => {
    const adapter = stubAdapter();
    executeListsIndent(adapter, { target: validTarget });
    expect(adapter.indent).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// lists.get — validates address as ListItemAddress
// ---------------------------------------------------------------------------

describe('executeListsGet validation', () => {
  it('rejects null input', () => {
    expect(() => executeListsGet(stubAdapter(), null as any)).toThrow(/non-null object/);
  });

  it('rejects missing address', () => {
    expect(() => executeListsGet(stubAdapter(), {} as any)).toThrow(/requires a address/);
  });

  it('rejects address with wrong kind', () => {
    expect(() =>
      executeListsGet(stubAdapter(), { address: { kind: 'inline', nodeType: 'listItem', nodeId: 'x' } } as any),
    ).toThrow(/kind must be 'block'/);
  });

  it('rejects address with wrong nodeType', () => {
    expect(() =>
      executeListsGet(stubAdapter(), { address: { kind: 'block', nodeType: 'paragraph', nodeId: 'x' } }),
    ).toThrow(/nodeType must be 'listItem'/);
  });

  it('accepts valid input', () => {
    const adapter = stubAdapter();
    executeListsGet(adapter, { address: validTarget });
    expect(adapter.get).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// lists.insert — validates position enum
// ---------------------------------------------------------------------------

describe('executeListsInsert validation', () => {
  it('rejects missing target', () => {
    expect(() => executeListsInsert(stubAdapter(), { position: 'after' } as any)).toThrow(/requires a target/);
  });

  it('rejects invalid position', () => {
    expect(() => executeListsInsert(stubAdapter(), { target: validTarget, position: 'middle' } as any)).toThrow(
      /position must be one of/,
    );
  });

  it('accepts valid input', () => {
    const adapter = stubAdapter();
    executeListsInsert(adapter, { target: validTarget, position: 'after' });
    expect(adapter.insert).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Finding 1: lists.attach — validates target as BlockAddress|BlockRange, attachTo as ListItemAddress
// ---------------------------------------------------------------------------

describe('executeListsAttach validation', () => {
  it('accepts BlockAddress target', () => {
    const adapter = stubAdapter();
    executeListsAttach(adapter, {
      target: { kind: 'block', nodeType: 'paragraph', nodeId: 'p1' },
      attachTo: validTarget,
    });
    expect(adapter.attach).toHaveBeenCalled();
  });

  it('accepts BlockRange target', () => {
    const adapter = stubAdapter();
    executeListsAttach(adapter, {
      target: {
        from: { kind: 'block', nodeType: 'paragraph', nodeId: 'p1' },
        to: { kind: 'block', nodeType: 'paragraph', nodeId: 'p3' },
      },
      attachTo: validTarget,
    } as any);
    expect(adapter.attach).toHaveBeenCalled();
  });

  it('rejects malformed target', () => {
    expect(() =>
      executeListsAttach(stubAdapter(), {
        target: { foo: 'bar' },
        attachTo: validTarget,
      } as any),
    ).toThrow(/kind must be 'block'/);
  });

  it('rejects invalid attachTo (wrong nodeType)', () => {
    expect(() =>
      executeListsAttach(stubAdapter(), {
        target: { kind: 'block', nodeType: 'paragraph', nodeId: 'p1' },
        attachTo: { kind: 'block', nodeType: 'paragraph', nodeId: 'p2' },
      } as any),
    ).toThrow(/attachTo\.nodeType must be 'listItem'/);
  });

  it('rejects null attachTo', () => {
    expect(() =>
      executeListsAttach(stubAdapter(), {
        target: { kind: 'block', nodeType: 'paragraph', nodeId: 'p1' },
        attachTo: null,
      } as any),
    ).toThrow(/requires a attachTo/);
  });
});

// ---------------------------------------------------------------------------
// Finding 2: operation-specific field validation
// ---------------------------------------------------------------------------

describe('executeListsJoin validates direction', () => {
  it('rejects invalid direction', () => {
    expect(() => executeListsJoin(stubAdapter(), { target: validTarget, direction: 'sideways' } as any)).toThrow(
      /direction must be one of/,
    );
  });

  it('accepts valid direction', () => {
    const adapter = stubAdapter();
    executeListsJoin(adapter, { target: validTarget, direction: 'withPrevious' });
    expect(adapter.join).toHaveBeenCalled();
  });
});

describe('executeListsSetLevel validates level', () => {
  it('rejects string level', () => {
    expect(() => executeListsSetLevel(stubAdapter(), { target: validTarget, level: '2' } as any)).toThrow(
      /level must be a non-negative integer/,
    );
  });

  it('accepts valid level', () => {
    const adapter = stubAdapter();
    executeListsSetLevel(adapter, { target: validTarget, level: 0 });
    expect(adapter.setLevel).toHaveBeenCalled();
  });
});

describe('executeListsSetValue validates value', () => {
  it('rejects string value', () => {
    expect(() => executeListsSetValue(stubAdapter(), { target: validTarget, value: '3' } as any)).toThrow(
      /value must be an integer or null/,
    );
  });

  it('accepts null value', () => {
    const adapter = stubAdapter();
    executeListsSetValue(adapter, { target: validTarget, value: null });
    expect(adapter.setValue).toHaveBeenCalled();
  });
});

describe('executeListsApplyPreset validates preset', () => {
  it('rejects invalid preset', () => {
    expect(() => executeListsApplyPreset(stubAdapter(), { target: validTarget, preset: 'bogus' } as any)).toThrow(
      /preset must be one of/,
    );
  });

  it('accepts valid preset', () => {
    const adapter = stubAdapter();
    executeListsApplyPreset(adapter, { target: validTarget, preset: 'decimal' });
    expect(adapter.applyPreset).toHaveBeenCalled();
  });
});

describe('executeListsSetType validates kind and continuity', () => {
  it('rejects invalid kind', () => {
    expect(() => executeListsSetType(stubAdapter(), { target: validTarget, kind: 'bogus' } as any)).toThrow(
      /kind must be one of/,
    );
  });

  it('rejects invalid continuity', () => {
    expect(() =>
      executeListsSetType(stubAdapter(), { target: validTarget, kind: 'ordered', continuity: 'merge' } as any),
    ).toThrow(/continuity must be one of/);
  });

  it('accepts valid input', () => {
    const adapter = stubAdapter();
    executeListsSetType(adapter, { target: validTarget, kind: 'bullet' });
    expect(adapter.setType).toHaveBeenCalled();
  });
});

describe('executeListsRestartAt validates startAt', () => {
  it('rejects string startAt', () => {
    expect(() => executeListsRestartAt(stubAdapter(), { target: validTarget, startAt: '3' } as any)).toThrow(
      /startAt must be an integer/,
    );
  });

  it('accepts valid startAt', () => {
    const adapter = stubAdapter();
    executeListsRestartAt(adapter, { target: validTarget, startAt: 5 });
    expect(adapter.restartAt).toHaveBeenCalled();
  });
});

describe('executeListsSetLevelTrailingCharacter validates enum', () => {
  it('rejects invalid trailingCharacter', () => {
    expect(() =>
      executeListsSetLevelTrailingCharacter(stubAdapter(), {
        target: validTarget,
        level: 0,
        trailingCharacter: 'dots',
      } as any),
    ).toThrow(/trailingCharacter must be one of/);
  });

  it('accepts valid trailingCharacter', () => {
    const adapter = stubAdapter();
    executeListsSetLevelTrailingCharacter(adapter, {
      target: validTarget,
      level: 0,
      trailingCharacter: 'tab',
    });
    expect(adapter.setLevelTrailingCharacter).toHaveBeenCalled();
  });
});

describe('executeListsSetLevelAlignment validates enum', () => {
  it('rejects invalid alignment', () => {
    expect(() =>
      executeListsSetLevelAlignment(stubAdapter(), {
        target: validTarget,
        level: 0,
        alignment: 'justify',
      } as any),
    ).toThrow(/alignment must be one of/);
  });
});

describe('executeListsSetLevelLayout validates layout shape', () => {
  it('rejects non-object layout', () => {
    expect(() =>
      executeListsSetLevelLayout(stubAdapter(), { target: validTarget, level: 0, layout: 42 } as any),
    ).toThrow(/layout must be an object/);
  });

  it('rejects invalid layout.alignment', () => {
    expect(() =>
      executeListsSetLevelLayout(stubAdapter(), {
        target: validTarget,
        level: 0,
        layout: { alignment: 'justify' },
      } as any),
    ).toThrow(/layout\.alignment must be one of/);
  });

  it('rejects invalid layout.followCharacter', () => {
    expect(() =>
      executeListsSetLevelLayout(stubAdapter(), {
        target: validTarget,
        level: 0,
        layout: { followCharacter: 'dots' },
      } as any),
    ).toThrow(/layout\.followCharacter must be one of/);
  });

  it('accepts valid layout', () => {
    const adapter = stubAdapter();
    executeListsSetLevelLayout(adapter, {
      target: validTarget,
      level: 0,
      layout: { alignment: 'left', followCharacter: 'tab' },
    });
    expect(adapter.setLevelLayout).toHaveBeenCalled();
  });
});

describe('executeListsSetLevelRestart validates scope enum', () => {
  it('rejects invalid scope', () => {
    expect(() =>
      executeListsSetLevelRestart(stubAdapter(), {
        target: validTarget,
        level: 0,
        restartAfterLevel: null,
        scope: 'bogus',
      } as any),
    ).toThrow(/scope must be one of/);
  });

  it('accepts valid scope', () => {
    const adapter = stubAdapter();
    executeListsSetLevelRestart(adapter, {
      target: validTarget,
      level: 0,
      restartAfterLevel: null,
      scope: 'definition',
    });
    expect(adapter.setLevelRestart).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// lists.create validation
// ---------------------------------------------------------------------------

describe('executeListsCreate validation', () => {
  it('rejects null input', () => {
    expect(() => executeListsCreate(stubAdapter(), null as any)).toThrow(/non-null object/);
  });

  it('rejects invalid mode', () => {
    expect(() => executeListsCreate(stubAdapter(), { mode: 'bogus' } as any)).toThrow(
      /must be "empty" or "fromParagraphs"/,
    );
  });

  it('rejects empty mode with malformed at', () => {
    expect(() => executeListsCreate(stubAdapter(), { mode: 'empty', at: { foo: 'bar' } } as any)).toThrow(
      /kind must be 'block'/,
    );
  });

  it('rejects fromParagraphs mode missing target', () => {
    expect(() => executeListsCreate(stubAdapter(), { mode: 'fromParagraphs' } as any)).toThrow(/requires a target/);
  });

  it('rejects fromParagraphs mode with malformed target', () => {
    expect(() => executeListsCreate(stubAdapter(), { mode: 'fromParagraphs', target: { foo: 'bar' } } as any)).toThrow(
      /kind must be 'block'/,
    );
  });

  it('accepts valid empty mode', () => {
    const adapter = stubAdapter();
    executeListsCreate(adapter, {
      mode: 'empty',
      at: { kind: 'block', nodeType: 'paragraph', nodeId: 'p1' },
    } as any);
    expect(adapter.create).toHaveBeenCalled();
  });

  it('accepts valid fromParagraphs mode with BlockRange', () => {
    const adapter = stubAdapter();
    executeListsCreate(adapter, {
      mode: 'fromParagraphs',
      target: {
        from: { kind: 'block', nodeType: 'paragraph', nodeId: 'p1' },
        to: { kind: 'block', nodeType: 'paragraph', nodeId: 'p3' },
      },
    } as any);
    expect(adapter.create).toHaveBeenCalled();
  });

  it('rejects empty mode with non-paragraph at nodeType', () => {
    expect(() =>
      executeListsCreate(stubAdapter(), {
        mode: 'empty',
        at: { kind: 'block', nodeType: 'table', nodeId: 't1' },
      } as any),
    ).toThrow(/nodeType must be 'paragraph'/);
  });

  it('rejects fromParagraphs mode with non-paragraph target nodeType', () => {
    expect(() =>
      executeListsCreate(stubAdapter(), {
        mode: 'fromParagraphs',
        target: { kind: 'block', nodeType: 'table', nodeId: 't1' },
      } as any),
    ).toThrow(/nodeType must be 'paragraph'/);
  });
});

// ---------------------------------------------------------------------------
// BlockAddress nodeType enforcement for attach
// ---------------------------------------------------------------------------

describe('lists.attach enforces BlockAddress nodeType paragraph', () => {
  it('rejects non-paragraph target nodeType', () => {
    expect(() =>
      executeListsAttach(stubAdapter(), {
        target: { kind: 'block', nodeType: 'table', nodeId: 't1' },
        attachTo: validTarget,
      } as any),
    ).toThrow(/nodeType must be 'paragraph'/);
  });
});

// ---------------------------------------------------------------------------
// Remaining non-target field validation
// ---------------------------------------------------------------------------

describe('lists.insert validates text type', () => {
  it('rejects non-string text', () => {
    expect(() =>
      executeListsInsert(stubAdapter(), { target: validTarget, position: 'after', text: 123 } as any),
    ).toThrow(/text must be a string/);
  });
});

describe('lists.separate validates copyOverrides', () => {
  it('rejects non-boolean copyOverrides', () => {
    expect(() => executeListsSeparate(stubAdapter(), { target: validTarget, copyOverrides: 'yes' } as any)).toThrow(
      /copyOverrides must be a boolean/,
    );
  });
});

describe('lists.convertToText validates includeMarker', () => {
  it('rejects non-boolean includeMarker', () => {
    expect(() =>
      executeListsConvertToText(stubAdapter(), { target: validTarget, includeMarker: 'yes' } as any),
    ).toThrow(/includeMarker must be a boolean/);
  });
});

describe('lists.getStyle validates levels array', () => {
  it('rejects non-integer items in levels', () => {
    expect(() => executeListsGetStyle(stubAdapter(), { target: validTarget, levels: ['0', 1] } as any)).toThrow(
      /levels\[0\] must be a non-negative integer/,
    );
  });
});

describe('lists.applyTemplate validates template shape deeply', () => {
  it('rejects empty object (missing version)', () => {
    expect(() => executeListsApplyTemplate(stubAdapter(), { target: validTarget, template: {} } as any)).toThrow(
      /version must be 1/,
    );
  });

  it('rejects template with missing levels', () => {
    expect(() =>
      executeListsApplyTemplate(stubAdapter(), { target: validTarget, template: { version: 1 } } as any),
    ).toThrow(/levels must be an array/);
  });

  it('rejects non-object level entry', () => {
    expect(() =>
      executeListsApplyTemplate(stubAdapter(), {
        target: validTarget,
        template: { version: 1, levels: [42] },
      } as any),
    ).toThrow(/levels\[0\] must be an object/);
  });

  it('rejects level entry with non-integer level', () => {
    expect(() =>
      executeListsApplyTemplate(stubAdapter(), {
        target: validTarget,
        template: { version: 1, levels: [{ level: '0' }] },
      } as any),
    ).toThrow(/levels\[0\]\.level must be a non-negative integer/);
  });

  it('rejects level entry with non-number tabStopAt', () => {
    expect(() =>
      executeListsApplyTemplate(stubAdapter(), {
        target: validTarget,
        template: { version: 1, levels: [{ level: 0, tabStopAt: '10' }] },
      } as any),
    ).toThrow(/tabStopAt must be a number/);
  });

  it('accepts level entry with null tabStopAt', () => {
    const adapter = stubAdapter();
    executeListsApplyTemplate(adapter, {
      target: validTarget,
      template: { version: 1, levels: [{ level: 0, tabStopAt: null }] },
    } as any);
    expect(adapter.applyTemplate).toHaveBeenCalled();
  });

  it('accepts valid template with level entries', () => {
    const adapter = stubAdapter();
    executeListsApplyTemplate(adapter, {
      target: validTarget,
      template: { version: 1, levels: [{ level: 0, numFmt: 'decimal', lvlText: '%1.' }] },
    });
    expect(adapter.applyTemplate).toHaveBeenCalled();
  });
});

describe('lists.applyStyle validates style shape deeply', () => {
  it('rejects empty object (missing version)', () => {
    expect(() => executeListsApplyStyle(stubAdapter(), { target: validTarget, style: {} } as any)).toThrow(
      /version must be 1/,
    );
  });

  it('rejects style with non-object level entry', () => {
    expect(() =>
      executeListsApplyStyle(stubAdapter(), {
        target: validTarget,
        style: { version: 1, levels: [42] },
      } as any),
    ).toThrow(/levels\[0\] must be an object/);
  });
});

describe('lists.setLevelIndents validates numeric fields', () => {
  it('rejects non-number left', () => {
    expect(() =>
      executeListsSetLevelIndents(stubAdapter(), { target: validTarget, level: 0, left: '3' } as any),
    ).toThrow(/left must be a number/);
  });
});

describe('lists.setLevelNumbering validates optional start', () => {
  it('rejects non-integer start', () => {
    expect(() =>
      executeListsSetLevelNumbering(stubAdapter(), {
        target: validTarget,
        level: 0,
        numFmt: 'decimal',
        lvlText: '%1.',
        start: '1',
      } as any),
    ).toThrow(/start must be an integer/);
  });
});

describe('lists.setLevelLayout validates numeric fields', () => {
  it('rejects non-number alignedAt', () => {
    expect(() =>
      executeListsSetLevelLayout(stubAdapter(), {
        target: validTarget,
        level: 0,
        layout: { alignedAt: '3' },
      } as any),
    ).toThrow(/layout\.alignedAt must be a number/);
  });
});

// ---------------------------------------------------------------------------
// lists.create — full union field validation
// ---------------------------------------------------------------------------

describe('lists.create validates union fields', () => {
  const validAt = { kind: 'block' as const, nodeType: 'paragraph' as const, nodeId: 'p1' };

  it('rejects invalid kind', () => {
    expect(() => executeListsCreate(stubAdapter(), { mode: 'empty', at: validAt, kind: 'bogus' } as any)).toThrow(
      /kind must be one of/,
    );
  });

  it('rejects invalid level', () => {
    expect(() => executeListsCreate(stubAdapter(), { mode: 'empty', at: validAt, level: '2' } as any)).toThrow(
      /level must be a non-negative integer/,
    );
  });

  it('rejects invalid preset', () => {
    expect(() => executeListsCreate(stubAdapter(), { mode: 'empty', at: validAt, preset: 'bogus' } as any)).toThrow(
      /preset must be one of/,
    );
  });

  it('rejects invalid style (not a template)', () => {
    expect(() => executeListsCreate(stubAdapter(), { mode: 'empty', at: validAt, style: 'bad' } as any)).toThrow(
      /style must be an object/,
    );
  });

  it('rejects invalid sequence.mode', () => {
    expect(() =>
      executeListsCreate(stubAdapter(), {
        mode: 'empty',
        at: validAt,
        sequence: { mode: 'bogus' },
      } as any),
    ).toThrow(/sequence\.mode must be one of/);
  });

  it('rejects non-integer sequence.startAt', () => {
    expect(() =>
      executeListsCreate(stubAdapter(), {
        mode: 'empty',
        at: validAt,
        sequence: { mode: 'new', startAt: '1' },
      } as any),
    ).toThrow(/sequence\.startAt must be an integer/);
  });

  it('rejects continuePrevious with preset', () => {
    expect(() =>
      executeListsCreate(stubAdapter(), {
        mode: 'empty',
        at: validAt,
        preset: 'decimal',
        sequence: { mode: 'continuePrevious' },
      } as any),
    ).toThrow(/preset must not be provided/);
  });

  it('rejects continuePrevious with style', () => {
    expect(() =>
      executeListsCreate(stubAdapter(), {
        mode: 'empty',
        at: validAt,
        style: { version: 1, levels: [] },
        sequence: { mode: 'continuePrevious' },
      } as any),
    ).toThrow(/style must not be provided/);
  });

  it('rejects continuePrevious with startAt', () => {
    expect(() =>
      executeListsCreate(stubAdapter(), {
        mode: 'empty',
        at: validAt,
        sequence: { mode: 'continuePrevious', startAt: 1 },
      } as any),
    ).toThrow(/startAt must not be provided/);
  });

  it('accepts valid continuePrevious without preset/style', () => {
    const adapter = stubAdapter();
    executeListsCreate(adapter, {
      mode: 'empty',
      at: validAt,
      sequence: { mode: 'continuePrevious' },
    } as any);
    expect(adapter.create).toHaveBeenCalled();
  });

  it('accepts valid create with all optional fields', () => {
    const adapter = stubAdapter();
    executeListsCreate(adapter, {
      mode: 'empty',
      at: validAt,
      kind: 'ordered',
      level: 0,
      preset: 'decimal',
      sequence: { mode: 'new', startAt: 1 },
    } as any);
    expect(adapter.create).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// lists.list — query validation
// ---------------------------------------------------------------------------

describe('lists.list validates query', () => {
  it('accepts undefined query', () => {
    const adapter = stubAdapter();
    executeListsList(adapter);
    expect(adapter.list).toHaveBeenCalled();
  });

  it('rejects non-object query', () => {
    expect(() => executeListsList(stubAdapter(), 'bad' as any)).toThrow(/must be an object/);
  });

  it('rejects invalid kind', () => {
    expect(() => executeListsList(stubAdapter(), { kind: 'bogus' } as any)).toThrow(/kind must be one of/);
  });

  it('rejects non-integer level', () => {
    expect(() => executeListsList(stubAdapter(), { level: '1' } as any)).toThrow(/level must be an integer/);
  });

  it('rejects within missing nodeType', () => {
    expect(() => executeListsList(stubAdapter(), { within: { kind: 'block', nodeId: 'x' } } as any)).toThrow(
      /within\.nodeType must be a valid BlockNodeType/,
    );
  });

  it('rejects within with non-string nodeType', () => {
    expect(() =>
      executeListsList(stubAdapter(), { within: { kind: 'block', nodeType: 123, nodeId: 'x' } } as any),
    ).toThrow(/within\.nodeType must be a valid BlockNodeType/);
  });

  it('rejects within with invalid nodeType string', () => {
    expect(() =>
      executeListsList(stubAdapter(), { within: { kind: 'block', nodeType: 'bogus', nodeId: 'x' } } as any),
    ).toThrow(/within\.nodeType must be a valid BlockNodeType/);
  });

  it('accepts valid query with within', () => {
    const adapter = stubAdapter();
    executeListsList(adapter, { within: { kind: 'block', nodeType: 'table', nodeId: 't1' } } as any);
    expect(adapter.list).toHaveBeenCalled();
  });

  it('accepts valid query', () => {
    const adapter = stubAdapter();
    executeListsList(adapter, { kind: 'ordered', level: 0 });
    expect(adapter.list).toHaveBeenCalled();
  });
});
