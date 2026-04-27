import { describe, it, expect } from 'vitest';
import { buildFieldInstanceFromImport, readFieldFlags } from './build-field-instance.js';

describe('buildFieldInstanceFromImport', () => {
  const baseArgs = {
    representation: 'complex' as const,
    instructionText: 'PAGE',
    resultFragments: [],
    originalXml: { name: 'w:r', elements: [] },
    dirty: false,
    locked: false,
    part: 'body' as const,
    importIndex: 0,
  };

  it('produces a FieldInstance with import-time defaults', () => {
    const fi = buildFieldInstanceFromImport(baseArgs);
    expect(fi.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(fi.representation).toBe('complex');
    expect(fi.rawInstruction).toBe('PAGE');
    expect(fi.dirty).toBe(false);
    expect(fi.locked).toBe(false);
    expect(fi.mutation).toEqual({
      imported: true,
      inserted: false,
      instructionEdited: false,
      resultEdited: false,
      flagsEdited: false,
      relocated: false,
      structureEdited: false,
    });
    expect(fi.source.part).toBe('body');
    expect(fi.source.importIndex).toBe(0);
    expect(fi.source.originalXml).toBe(baseArgs.originalXml);
  });

  it('derives family from the first identifier in the instruction', () => {
    const fi = buildFieldInstanceFromImport({ ...baseArgs, instructionText: 'PAGE' });
    expect(fi.family).toBe('PAGE');
  });

  it('uppercases the derived family even when source is lowercase', () => {
    const fi = buildFieldInstanceFromImport({ ...baseArgs, instructionText: 'page' });
    expect(fi.family).toBe('PAGE');
  });

  it('falls back to "unknown" when the instruction is empty', () => {
    const fi = buildFieldInstanceFromImport({ ...baseArgs, instructionText: '' });
    expect(fi.family).toBe('unknown');
  });

  it('falls back to "unknown" when the instruction starts with a quoted string', () => {
    const fi = buildFieldInstanceFromImport({ ...baseArgs, instructionText: '"opaque"' });
    expect(fi.family).toBe('unknown');
  });

  it('honors an explicit family override over the derived one', () => {
    const fi = buildFieldInstanceFromImport({ ...baseArgs, instructionText: 'SEQ Figure', family: 'PAGE' });
    expect(fi.family).toBe('PAGE');
  });

  it('preserves the raw instruction text on rawInstruction', () => {
    const fi = buildFieldInstanceFromImport({
      ...baseArgs,
      instructionText: 'SEQ  Figure  \\* ARABIC',
    });
    expect(fi.rawInstruction).toBe('SEQ  Figure  \\* ARABIC');
  });

  it('parses tokens and parsedArgs from the instruction', () => {
    const fi = buildFieldInstanceFromImport({
      ...baseArgs,
      instructionText: 'SEQ Figure \\* ARABIC',
    });
    expect(fi.parsedArgs.family).toBe('SEQ');
    expect(fi.parsedArgs.positional).toEqual([{ kind: 'identifier', text: 'Figure' }]);
    expect(fi.parsedArgs.switches).toEqual([{ flag: '*', arg: { kind: 'identifier', text: 'ARABIC' } }]);
    expect(fi.instructionTokens.length).toBeGreaterThan(0);
  });

  it('falls back to opaque tokens for malformed input without throwing', () => {
    const fi = buildFieldInstanceFromImport({ ...baseArgs, instructionText: 'REF "unterminated' });
    expect(fi.parsedArgs.family).toBe('REF');
    expect(fi.instructionTokens.some((t) => t.kind === 'opaque')).toBe(true);
  });

  it('carries dirty and locked through unchanged', () => {
    const fi = buildFieldInstanceFromImport({ ...baseArgs, dirty: true, locked: true });
    expect(fi.dirty).toBe(true);
    expect(fi.locked).toBe(true);
  });

  it('records the source part and importIndex faithfully', () => {
    const fi = buildFieldInstanceFromImport({ ...baseArgs, part: 'header', importIndex: 7 });
    expect(fi.source.part).toBe('header');
    expect(fi.source.importIndex).toBe(7);
  });

  it('preserves the original XML reference identity for passthrough', () => {
    const xml = { name: 'w:fldSimple', attributes: {}, elements: [] };
    const fi = buildFieldInstanceFromImport({ ...baseArgs, originalXml: xml });
    expect(fi.source.originalXml).toBe(xml);
  });

  it('attaches resultFragments by reference', () => {
    const fragments: unknown[] = [{ name: 'w:r', elements: [] }];
    const fi = buildFieldInstanceFromImport({ ...baseArgs, resultFragments: fragments });
    expect(fi.resultFragments).toBe(fragments);
  });

  it('forwards an explicit cachedResultText when provided', () => {
    const fi = buildFieldInstanceFromImport({ ...baseArgs, cachedResultText: 'hello' });
    expect(fi.cachedResultText).toBe('hello');
  });

  it('leaves cachedResultText undefined when not provided', () => {
    const fi = buildFieldInstanceFromImport(baseArgs);
    expect(fi.cachedResultText).toBeUndefined();
  });

  it('produces a unique id on each call', () => {
    const a = buildFieldInstanceFromImport(baseArgs);
    const b = buildFieldInstanceFromImport(baseArgs);
    expect(a.id).not.toBe(b.id);
  });
});

describe('readFieldFlags', () => {
  it('returns false/false when the element is null or has no attributes', () => {
    expect(readFieldFlags(null)).toEqual({ dirty: false, locked: false });
    expect(readFieldFlags(undefined)).toEqual({ dirty: false, locked: false });
    expect(readFieldFlags({})).toEqual({ dirty: false, locked: false });
    expect(readFieldFlags({ attributes: {} })).toEqual({ dirty: false, locked: false });
  });

  it('reads "1" as true', () => {
    expect(readFieldFlags({ attributes: { 'w:dirty': '1' } })).toEqual({ dirty: true, locked: false });
    expect(readFieldFlags({ attributes: { 'w:fldLock': '1' } })).toEqual({ dirty: false, locked: true });
  });

  it('reads "true" as true (alternate OOXML truthy form)', () => {
    expect(readFieldFlags({ attributes: { 'w:dirty': 'true', 'w:fldLock': 'true' } })).toEqual({
      dirty: true,
      locked: true,
    });
  });

  it('reads "0" / "false" / arbitrary strings as false', () => {
    expect(readFieldFlags({ attributes: { 'w:dirty': '0', 'w:fldLock': 'false' } })).toEqual({
      dirty: false,
      locked: false,
    });
    expect(readFieldFlags({ attributes: { 'w:dirty': 'yes' } })).toEqual({ dirty: false, locked: false });
  });

  it('reads dirty and locked independently', () => {
    expect(readFieldFlags({ attributes: { 'w:dirty': '1', 'w:fldLock': '0' } })).toEqual({
      dirty: true,
      locked: false,
    });
    expect(readFieldFlags({ attributes: { 'w:dirty': '0', 'w:fldLock': '1' } })).toEqual({
      dirty: false,
      locked: true,
    });
  });
});
