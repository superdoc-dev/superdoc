import { describe, it, expect } from 'vitest';
import { startCollection, pushDiagnostic, drainDiagnostics, peekDiagnostics } from './import-diagnostics.js';

describe('import-diagnostics collector', () => {
  it('starts with an empty buffer', () => {
    startCollection();
    expect(peekDiagnostics()).toEqual([]);
  });

  it('collects pushed diagnostics', () => {
    startCollection();
    const diag = {
      code: 'INVALID_INLINE_TOKEN',
      property: 'bold',
      attribute: 'val',
      token: 'garbage',
      xpath: 'w:b/@w:val',
    };
    pushDiagnostic(diag);
    expect(peekDiagnostics()).toEqual([diag]);
  });

  it('drainDiagnostics returns collected records and resets the buffer', () => {
    startCollection();
    pushDiagnostic({
      code: 'INVALID_INLINE_TOKEN',
      property: 'italic',
      attribute: 'val',
      token: 'bad',
      xpath: 'w:i/@w:val',
    });
    pushDiagnostic({
      code: 'INVALID_INLINE_TOKEN',
      property: 'underline',
      attribute: 'val',
      token: 'nope',
      xpath: 'w:u/@w:val',
    });

    const drained = drainDiagnostics();
    expect(drained).toHaveLength(2);
    expect(drained[0].property).toBe('italic');
    expect(drained[1].property).toBe('underline');

    // Buffer is now empty
    expect(peekDiagnostics()).toEqual([]);
    expect(drainDiagnostics()).toEqual([]);
  });

  it('startCollection resets any previously collected diagnostics', () => {
    startCollection();
    pushDiagnostic({
      code: 'INVALID_INLINE_TOKEN',
      property: 'strike',
      attribute: 'val',
      token: 'x',
      xpath: 'w:strike/@w:val',
    });
    expect(peekDiagnostics()).toHaveLength(1);

    startCollection();
    expect(peekDiagnostics()).toEqual([]);
  });

  it('supports multiple start/drain cycles', () => {
    // First cycle
    startCollection();
    pushDiagnostic({
      code: 'INVALID_INLINE_TOKEN',
      property: 'bold',
      attribute: 'val',
      token: 'a',
      xpath: 'w:b/@w:val',
    });
    expect(drainDiagnostics()).toHaveLength(1);

    // Second cycle
    startCollection();
    pushDiagnostic({
      code: 'INVALID_INLINE_TOKEN',
      property: 'italic',
      attribute: 'val',
      token: 'b',
      xpath: 'w:i/@w:val',
    });
    pushDiagnostic({
      code: 'INVALID_INLINE_TOKEN',
      property: 'strike',
      attribute: 'val',
      token: 'c',
      xpath: 'w:strike/@w:val',
    });
    const second = drainDiagnostics();
    expect(second).toHaveLength(2);
    expect(second[0].token).toBe('b');
    expect(second[1].token).toBe('c');
  });

  it('isolates diagnostics by collection id for overlapping imports', () => {
    const idA = startCollection();
    const idB = startCollection();

    pushDiagnostic(
      {
        code: 'INVALID_INLINE_TOKEN',
        property: 'bold',
        attribute: 'val',
        token: 'a',
        xpath: 'w:b/@w:val',
      },
      idA,
    );

    pushDiagnostic(
      {
        code: 'INVALID_INLINE_TOKEN',
        property: 'italic',
        attribute: 'val',
        token: 'b',
        xpath: 'w:i/@w:val',
      },
      idB,
    );

    expect(peekDiagnostics(idA).map((d) => d.token)).toEqual(['a']);
    expect(peekDiagnostics(idB).map((d) => d.token)).toEqual(['b']);

    expect(drainDiagnostics(idA).map((d) => d.token)).toEqual(['a']);
    expect(peekDiagnostics(idB).map((d) => d.token)).toEqual(['b']);
    expect(drainDiagnostics(idB).map((d) => d.token)).toEqual(['b']);
  });
});
