import { describe, it, expect } from 'vitest';
import {
  tokenizeInstruction,
  reconstructInstruction,
  deriveParsedArgs,
  parseInstruction,
} from './instruction-tokenizer.js';
import type { InstructionToken } from './field-instance.js';

describe('tokenizeInstruction', () => {
  it('returns an empty stream for an empty input', () => {
    expect(tokenizeInstruction('')).toEqual([]);
  });

  it('emits a single identifier for a bare family code', () => {
    expect(tokenizeInstruction('PAGE')).toEqual([{ kind: 'identifier', text: 'PAGE' }]);
  });

  it('preserves single whitespace runs', () => {
    expect(tokenizeInstruction('PAGE NUMPAGES')).toEqual([
      { kind: 'identifier', text: 'PAGE' },
      { kind: 'whitespace', text: ' ' },
      { kind: 'identifier', text: 'NUMPAGES' },
    ]);
  });

  it('preserves mixed whitespace runs (spaces, tabs, newlines) verbatim', () => {
    const tokens = tokenizeInstruction('A \t\n B');
    expect(tokens).toEqual([
      { kind: 'identifier', text: 'A' },
      { kind: 'whitespace', text: ' \t\n ' },
      { kind: 'identifier', text: 'B' },
    ]);
  });

  it('tokenizes a double-quoted string and strips the surrounding quotes from the text', () => {
    expect(tokenizeInstruction('"hello world"')).toEqual([{ kind: 'quoted', text: 'hello world', quote: '"' }]);
  });

  it('tokenizes a single-quoted string', () => {
    expect(tokenizeInstruction("'My Prop'")).toEqual([{ kind: 'quoted', text: 'My Prop', quote: "'" }]);
  });

  it('tokenizes a switch as a single-letter flag without the leading backslash', () => {
    const tokens = tokenizeInstruction('REF \\h');
    expect(tokens).toEqual([
      { kind: 'identifier', text: 'REF' },
      { kind: 'whitespace', text: ' ' },
      { kind: 'switch', flag: 'h' },
    ]);
  });

  it('tokenizes special-character switches (\\*, \\@, \\#)', () => {
    const tokens = tokenizeInstruction('SEQ \\* \\@ \\#');
    expect(tokens).toEqual([
      { kind: 'identifier', text: 'SEQ' },
      { kind: 'whitespace', text: ' ' },
      { kind: 'switch', flag: '*' },
      { kind: 'whitespace', text: ' ' },
      { kind: 'switch', flag: '@' },
      { kind: 'whitespace', text: ' ' },
      { kind: 'switch', flag: '#' },
    ]);
  });

  it('keeps switches and their arguments as separate tokens in the linear stream', () => {
    const tokens = tokenizeInstruction('DATE \\@ "yyyy-MM-dd"');
    expect(tokens).toEqual([
      { kind: 'identifier', text: 'DATE' },
      { kind: 'whitespace', text: ' ' },
      { kind: 'switch', flag: '@' },
      { kind: 'whitespace', text: ' ' },
      { kind: 'quoted', text: 'yyyy-MM-dd', quote: '"' },
    ]);
  });

  it('handles complex multi-token instructions', () => {
    const tokens = tokenizeInstruction('SEQ Figure \\* ARABIC');
    expect(tokens).toEqual([
      { kind: 'identifier', text: 'SEQ' },
      { kind: 'whitespace', text: ' ' },
      { kind: 'identifier', text: 'Figure' },
      { kind: 'whitespace', text: ' ' },
      { kind: 'switch', flag: '*' },
      { kind: 'whitespace', text: ' ' },
      { kind: 'identifier', text: 'ARABIC' },
    ]);
  });

  it('handles HYPERLINK with a quoted URL and a quoted switch argument', () => {
    const tokens = tokenizeInstruction('HYPERLINK "https://example.com" \\o "tooltip"');
    expect(tokens).toEqual([
      { kind: 'identifier', text: 'HYPERLINK' },
      { kind: 'whitespace', text: ' ' },
      { kind: 'quoted', text: 'https://example.com', quote: '"' },
      { kind: 'whitespace', text: ' ' },
      { kind: 'switch', flag: 'o' },
      { kind: 'whitespace', text: ' ' },
      { kind: 'quoted', text: 'tooltip', quote: '"' },
    ]);
  });

  describe('opaque fallback', () => {
    it('emits opaque for an unterminated double-quoted string', () => {
      expect(tokenizeInstruction('REF "unterminated')).toEqual([
        { kind: 'identifier', text: 'REF' },
        { kind: 'whitespace', text: ' ' },
        { kind: 'opaque', text: '"unterminated' },
      ]);
    });

    it('emits opaque for an unterminated single-quoted string', () => {
      expect(tokenizeInstruction("REF 'unterminated")).toEqual([
        { kind: 'identifier', text: 'REF' },
        { kind: 'whitespace', text: ' ' },
        { kind: 'opaque', text: "'unterminated" },
      ]);
    });

    it('emits opaque for a trailing backslash with nothing after it', () => {
      expect(tokenizeInstruction('REF \\')).toEqual([
        { kind: 'identifier', text: 'REF' },
        { kind: 'whitespace', text: ' ' },
        { kind: 'opaque', text: '\\' },
      ]);
    });

    it('emits opaque for a backslash followed by whitespace (not a valid switch)', () => {
      expect(tokenizeInstruction('REF \\ A')).toEqual([
        { kind: 'identifier', text: 'REF' },
        { kind: 'whitespace', text: ' ' },
        { kind: 'opaque', text: '\\' },
        { kind: 'whitespace', text: ' ' },
        { kind: 'identifier', text: 'A' },
      ]);
    });
  });

  describe('reconstruction round-trip', () => {
    const cases: string[] = [
      '',
      'PAGE',
      'PAGE NUMPAGES',
      'A \t\n B',
      'SEQ Figure \\* ARABIC',
      'HYPERLINK "https://example.com" \\o "tooltip"',
      'DATE \\@ "yyyy-MM-dd"',
      "DOCPROPERTY 'My Prop'",
      'REF _Ref123 \\h \\n',
      'MERGEFIELD FirstName \\* Upper',
      // Whitespace-only input (degenerate but legal):
      '   ',
      // Switch with no argument before another switch:
      'REF \\h \\n',
    ];

    for (const input of cases) {
      it(`reconstructs ${JSON.stringify(input)} byte-for-byte`, () => {
        const tokens = tokenizeInstruction(input);
        expect(reconstructInstruction(tokens)).toBe(input);
      });
    }

    it('skips nestedField anchor tokens during reconstruction', () => {
      const tokens: InstructionToken[] = [
        { kind: 'identifier', text: 'IF' },
        { kind: 'whitespace', text: ' ' },
        { kind: 'nestedField', childFieldId: 'child-1' },
        { kind: 'whitespace', text: ' ' },
        { kind: 'identifier', text: '=' },
      ];
      expect(reconstructInstruction(tokens)).toBe('IF  =');
    });

    it('renders an embedded switch arg adjacent to its switch (manual construction)', () => {
      const tokens: InstructionToken[] = [
        { kind: 'identifier', text: 'PAGE' },
        { kind: 'whitespace', text: ' ' },
        {
          kind: 'switch',
          flag: '*',
          arg: { kind: 'identifier', text: 'ARABIC' },
        },
      ];
      expect(reconstructInstruction(tokens)).toBe('PAGE \\*ARABIC');
    });

    it('renders an embedded quoted switch arg with its quotes', () => {
      const tokens: InstructionToken[] = [
        {
          kind: 'switch',
          flag: '@',
          arg: { kind: 'quoted', text: 'yyyy', quote: '"' },
        },
      ];
      expect(reconstructInstruction(tokens)).toBe('\\@"yyyy"');
    });
  });
});

describe('deriveParsedArgs', () => {
  it('returns empty parsed args for an empty token stream', () => {
    expect(deriveParsedArgs([])).toEqual({ positional: [], switches: [] });
  });

  it('returns empty parsed args for whitespace-only input', () => {
    expect(deriveParsedArgs(tokenizeInstruction('   \t  '))).toEqual({ positional: [], switches: [] });
  });

  it('uppercases the family even when the source is lowercase', () => {
    const { parsedArgs } = parseInstruction('page');
    expect(parsedArgs.family).toBe('PAGE');
  });

  it('classifies positional args as identifier/quoted with original quote info', () => {
    const { parsedArgs } = parseInstruction('REF _Ref123 "with spaces"');
    expect(parsedArgs.family).toBe('REF');
    expect(parsedArgs.positional).toEqual([
      { kind: 'identifier', text: '_Ref123' },
      { kind: 'quoted', text: 'with spaces', quote: '"' },
    ]);
    expect(parsedArgs.switches).toEqual([]);
  });

  it('attaches the next non-whitespace identifier as a switch arg', () => {
    const { parsedArgs } = parseInstruction('SEQ Figure \\* ARABIC');
    expect(parsedArgs.family).toBe('SEQ');
    expect(parsedArgs.positional).toEqual([{ kind: 'identifier', text: 'Figure' }]);
    expect(parsedArgs.switches).toEqual([{ flag: '*', arg: { kind: 'identifier', text: 'ARABIC' } }]);
  });

  it('attaches the next non-whitespace quoted token as a switch arg', () => {
    const { parsedArgs } = parseInstruction('DATE \\@ "yyyy-MM-dd"');
    expect(parsedArgs.switches).toEqual([{ flag: '@', arg: { kind: 'quoted', text: 'yyyy-MM-dd', quote: '"' } }]);
  });

  it('emits multiple switches with their arguments in order', () => {
    const { parsedArgs } = parseInstruction('SEQ Figure \\* ARABIC \\s 1');
    expect(parsedArgs.switches).toEqual([
      { flag: '*', arg: { kind: 'identifier', text: 'ARABIC' } },
      { flag: 's', arg: { kind: 'identifier', text: '1' } },
    ]);
  });

  it('leaves a switch arg-less when followed immediately by another switch', () => {
    const { parsedArgs } = parseInstruction('REF \\h \\n');
    expect(parsedArgs.switches).toEqual([{ flag: 'h' }, { flag: 'n' }]);
  });

  it('leaves a trailing switch arg-less when the stream ends', () => {
    const { parsedArgs } = parseInstruction('REF \\h');
    expect(parsedArgs.switches).toEqual([{ flag: 'h' }]);
  });

  it('only counts the first identifier as family; later identifiers are positional', () => {
    const { parsedArgs } = parseInstruction('MERGEFIELD FirstName');
    expect(parsedArgs.family).toBe('MERGEFIELD');
    expect(parsedArgs.positional).toEqual([{ kind: 'identifier', text: 'FirstName' }]);
  });

  it('does not set family when the first non-whitespace token is quoted', () => {
    const { parsedArgs } = parseInstruction('"plain quoted"');
    expect(parsedArgs.family).toBeUndefined();
    expect(parsedArgs.positional).toEqual([{ kind: 'quoted', text: 'plain quoted', quote: '"' }]);
  });

  it('skips opaque tokens when deriving parsed args', () => {
    const { parsedArgs } = parseInstruction('REF "unterminated');
    expect(parsedArgs.family).toBe('REF');
    expect(parsedArgs.positional).toEqual([]);
    expect(parsedArgs.switches).toEqual([]);
  });

  it('skips nestedField tokens when deriving parsed args', () => {
    const tokens: InstructionToken[] = [
      { kind: 'identifier', text: 'IF' },
      { kind: 'whitespace', text: ' ' },
      { kind: 'nestedField', childFieldId: 'child-1' },
      { kind: 'whitespace', text: ' ' },
      { kind: 'switch', flag: '*' },
      { kind: 'whitespace', text: ' ' },
      { kind: 'identifier', text: 'MERGEFORMAT' },
    ];
    const parsedArgs = deriveParsedArgs(tokens);
    expect(parsedArgs.family).toBe('IF');
    expect(parsedArgs.switches).toEqual([{ flag: '*', arg: { kind: 'identifier', text: 'MERGEFORMAT' } }]);
  });

  it('honors a switch embedded arg over a following linear token', () => {
    const tokens: InstructionToken[] = [
      { kind: 'identifier', text: 'PAGE' },
      { kind: 'whitespace', text: ' ' },
      {
        kind: 'switch',
        flag: '*',
        arg: { kind: 'identifier', text: 'ARABIC' },
      },
      { kind: 'whitespace', text: ' ' },
      // This following identifier must NOT attach to the switch above —
      // the embedded arg already closed the slot.
      { kind: 'identifier', text: 'ROMAN' },
    ];
    const parsedArgs = deriveParsedArgs(tokens);
    expect(parsedArgs.switches).toEqual([{ flag: '*', arg: { kind: 'identifier', text: 'ARABIC' } }]);
  });

  it('attaches an embedded quoted switch arg', () => {
    const tokens: InstructionToken[] = [
      { kind: 'identifier', text: 'DATE' },
      { kind: 'whitespace', text: ' ' },
      {
        kind: 'switch',
        flag: '@',
        arg: { kind: 'quoted', text: 'yyyy', quote: '"' },
      },
    ];
    const parsedArgs = deriveParsedArgs(tokens);
    expect(parsedArgs.switches).toEqual([{ flag: '@', arg: { kind: 'quoted', text: 'yyyy', quote: '"' } }]);
  });
});

describe('parseInstruction', () => {
  it('returns both the linear tokens and the derived parsed args', () => {
    const result = parseInstruction('SEQ Figure \\* ARABIC');
    expect(result.tokens).toEqual(tokenizeInstruction('SEQ Figure \\* ARABIC'));
    expect(result.parsedArgs.family).toBe('SEQ');
    expect(result.parsedArgs.switches).toEqual([{ flag: '*', arg: { kind: 'identifier', text: 'ARABIC' } }]);
  });
});
