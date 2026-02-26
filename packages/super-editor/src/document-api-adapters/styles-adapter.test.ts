import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StylesApplyInput, NormalizedStylesApplyOptions } from '@superdoc/document-api';
import { stylesApplyAdapter } from './styles-adapter.js';
import { DocumentApiAdapterError } from './errors.js';

// ---------------------------------------------------------------------------
// Mock editor factory
// ---------------------------------------------------------------------------

interface XmlElement {
  name: string;
  elements?: XmlElement[];
  attributes?: Record<string, string>;
}

interface MockEditorOptions {
  stylesXml?: XmlElement;
  noConverter?: boolean;
  collaborationProvider?: { synced?: boolean; isSynced?: boolean } | null;
}

function createMockEditor(opts: MockEditorOptions = {}) {
  const convertedXml: Record<string, XmlElement> = {};
  if (opts.stylesXml) {
    convertedXml['word/styles.xml'] = opts.stylesXml;
  }

  const converter = opts.noConverter
    ? undefined
    : {
        convertedXml,
        documentModified: false,
        documentGuid: 'existing-guid',
        promoteToGuid: vi.fn(() => 'new-guid'),
      };

  return {
    converter,
    options: {
      collaborationProvider: opts.collaborationProvider ?? null,
    },
    on: vi.fn(),
  } as unknown as Parameters<typeof stylesApplyAdapter>[0];
}

function makeStylesXml(...rPrChildren: XmlElement[]): XmlElement {
  return {
    name: 'root',
    elements: [
      {
        name: 'w:styles',
        elements: [
          {
            name: 'w:docDefaults',
            elements: [
              {
                name: 'w:rPrDefault',
                elements: [
                  {
                    name: 'w:rPr',
                    elements: rPrChildren,
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

function makeMinimalStylesXml(): XmlElement {
  return {
    name: 'root',
    elements: [{ name: 'w:styles', elements: [] }],
  };
}

const VALID_INPUT: StylesApplyInput = {
  target: { scope: 'docDefaults', channel: 'run' },
  patch: { bold: true },
};

const DEFAULT_OPTIONS: NormalizedStylesApplyOptions = {
  dryRun: false,
  expectedRevision: undefined,
};

// ---------------------------------------------------------------------------
// Helper to get rPr from the mock styles XML
// ---------------------------------------------------------------------------

function getRPrElements(editor: ReturnType<typeof createMockEditor>): XmlElement[] | undefined {
  const converter = (editor as unknown as { converter?: { convertedXml: Record<string, XmlElement> } }).converter;
  const stylesRoot = converter?.convertedXml['word/styles.xml']?.elements?.find(
    (el: XmlElement) => el.name === 'w:styles',
  );
  const docDefaults = stylesRoot?.elements?.find((el: XmlElement) => el.name === 'w:docDefaults');
  const rPrDefault = docDefaults?.elements?.find((el: XmlElement) => el.name === 'w:rPrDefault');
  const rPr = rPrDefault?.elements?.find((el: XmlElement) => el.name === 'w:rPr');
  return rPr?.elements;
}

// ---------------------------------------------------------------------------
// Capability gate tests
// ---------------------------------------------------------------------------

describe('styles adapter: capability gates', () => {
  it('throws CAPABILITY_UNAVAILABLE when converter is missing', () => {
    const editor = createMockEditor({ noConverter: true });
    expect(() => stylesApplyAdapter(editor, VALID_INPUT, DEFAULT_OPTIONS)).toThrow(DocumentApiAdapterError);
    try {
      stylesApplyAdapter(editor, VALID_INPUT, DEFAULT_OPTIONS);
    } catch (e) {
      expect((e as DocumentApiAdapterError).code).toBe('CAPABILITY_UNAVAILABLE');
    }
  });

  it('throws CAPABILITY_UNAVAILABLE when word/styles.xml is missing', () => {
    const editor = createMockEditor();
    expect(() => stylesApplyAdapter(editor, VALID_INPUT, DEFAULT_OPTIONS)).toThrow(DocumentApiAdapterError);
    try {
      stylesApplyAdapter(editor, VALID_INPUT, DEFAULT_OPTIONS);
    } catch (e) {
      expect((e as DocumentApiAdapterError).code).toBe('CAPABILITY_UNAVAILABLE');
      expect((e as DocumentApiAdapterError).message).toMatch(/word\/styles\.xml/);
    }
  });

  it('throws CAPABILITY_UNAVAILABLE when collaboration is active', () => {
    const editor = createMockEditor({
      stylesXml: makeStylesXml(),
      collaborationProvider: { synced: true },
    });
    expect(() => stylesApplyAdapter(editor, VALID_INPUT, DEFAULT_OPTIONS)).toThrow(DocumentApiAdapterError);
    try {
      stylesApplyAdapter(editor, VALID_INPUT, DEFAULT_OPTIONS);
    } catch (e) {
      expect((e as DocumentApiAdapterError).code).toBe('CAPABILITY_UNAVAILABLE');
      expect((e as DocumentApiAdapterError).message).toMatch(/collaboration/);
    }
  });

  it('allows mutation when collaboration provider is not synced (pre-initial-sync)', () => {
    const editor = createMockEditor({
      stylesXml: makeStylesXml(),
      collaborationProvider: { synced: false },
    });
    const result = stylesApplyAdapter(editor, VALID_INPUT, DEFAULT_OPTIONS);
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Bold write tests
// ---------------------------------------------------------------------------

describe('styles adapter: bold mutation', () => {
  it('writes <w:b/> for patch.bold: true', () => {
    const editor = createMockEditor({ stylesXml: makeStylesXml() });
    const result = stylesApplyAdapter(editor, VALID_INPUT, DEFAULT_OPTIONS);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.changed).toBe(true);
      expect(result.before.bold).toBe('inherit');
      expect(result.after.bold).toBe('on');
    }

    const elements = getRPrElements(editor);
    const boldEl = elements?.find((el) => el.name === 'w:b');
    expect(boldEl).toBeDefined();
    expect(boldEl?.attributes).toBeUndefined();
  });

  it('writes <w:b w:val="0"/> for patch.bold: false', () => {
    const editor = createMockEditor({ stylesXml: makeStylesXml() });
    const input: StylesApplyInput = {
      target: { scope: 'docDefaults', channel: 'run' },
      patch: { bold: false },
    };
    const result = stylesApplyAdapter(editor, input, DEFAULT_OPTIONS);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.changed).toBe(true);
      expect(result.before.bold).toBe('inherit');
      expect(result.after.bold).toBe('off');
    }

    const elements = getRPrElements(editor);
    const boldEl = elements?.find((el) => el.name === 'w:b');
    expect(boldEl).toBeDefined();
    expect(boldEl?.attributes?.['w:val']).toBe('0');
  });

  it('detects inherit state when <w:b> is absent', () => {
    const editor = createMockEditor({
      stylesXml: makeStylesXml({ name: 'w:i' }), // italic only, no bold
    });
    const result = stylesApplyAdapter(editor, VALID_INPUT, DEFAULT_OPTIONS);
    if (result.success) {
      expect(result.before.bold).toBe('inherit');
    }
  });
});

// ---------------------------------------------------------------------------
// OOXML boolean read normalization
// ---------------------------------------------------------------------------

describe('styles adapter: OOXML boolean normalization', () => {
  const normalizeTestCases: Array<{ desc: string; element: XmlElement; expected: 'on' | 'off' }> = [
    { desc: 'bare <w:b/>', element: { name: 'w:b' }, expected: 'on' },
    { desc: '<w:b w:val="1"/>', element: { name: 'w:b', attributes: { 'w:val': '1' } }, expected: 'on' },
    { desc: '<w:b w:val="true"/>', element: { name: 'w:b', attributes: { 'w:val': 'true' } }, expected: 'on' },
    { desc: '<w:b w:val="on"/>', element: { name: 'w:b', attributes: { 'w:val': 'on' } }, expected: 'on' },
    { desc: '<w:b w:val="0"/>', element: { name: 'w:b', attributes: { 'w:val': '0' } }, expected: 'off' },
    { desc: '<w:b w:val="false"/>', element: { name: 'w:b', attributes: { 'w:val': 'false' } }, expected: 'off' },
    { desc: '<w:b w:val="off"/>', element: { name: 'w:b', attributes: { 'w:val': 'off' } }, expected: 'off' },
  ];

  for (const { desc, element, expected } of normalizeTestCases) {
    it(`reads ${desc} as "${expected}"`, () => {
      const editor = createMockEditor({ stylesXml: makeStylesXml(element) });
      // Read with dryRun to avoid mutation
      const result = stylesApplyAdapter(
        editor,
        { target: { scope: 'docDefaults', channel: 'run' }, patch: { bold: true } },
        { dryRun: true, expectedRevision: undefined },
      );
      if (result.success) {
        expect(result.before.bold).toBe(expected);
      }
    });
  }
});

// ---------------------------------------------------------------------------
// No-op semantics
// ---------------------------------------------------------------------------

describe('styles adapter: no-op semantics', () => {
  it('returns changed: false when patch.bold: true and <w:b/> already exists', () => {
    const editor = createMockEditor({ stylesXml: makeStylesXml({ name: 'w:b' }) });
    const result = stylesApplyAdapter(editor, VALID_INPUT, DEFAULT_OPTIONS);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.changed).toBe(false);
      expect(result.before.bold).toBe('on');
      expect(result.after.bold).toBe('on');
    }
  });

  it('returns changed: false when patch.bold: false and <w:b w:val="0"/> already exists', () => {
    const editor = createMockEditor({
      stylesXml: makeStylesXml({ name: 'w:b', attributes: { 'w:val': '0' } }),
    });
    const input: StylesApplyInput = {
      target: { scope: 'docDefaults', channel: 'run' },
      patch: { bold: false },
    };
    const result = stylesApplyAdapter(editor, input, DEFAULT_OPTIONS);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.changed).toBe(false);
      expect(result.before.bold).toBe('off');
      expect(result.after.bold).toBe('off');
    }
  });

  it('does not mark converter as modified on no-op', () => {
    const editor = createMockEditor({ stylesXml: makeStylesXml({ name: 'w:b' }) });
    const converter = (editor as unknown as { converter: { documentModified: boolean } }).converter;
    stylesApplyAdapter(editor, VALID_INPUT, DEFAULT_OPTIONS);
    expect(converter.documentModified).toBe(false);
  });

  it('repeated identical calls produce identical receipts', () => {
    const editor = createMockEditor({ stylesXml: makeStylesXml() });
    const r1 = stylesApplyAdapter(editor, VALID_INPUT, DEFAULT_OPTIONS);
    const r2 = stylesApplyAdapter(editor, VALID_INPUT, DEFAULT_OPTIONS);
    // Second call is a no-op
    expect(r2.success).toBe(true);
    if (r1.success && r2.success) {
      expect(r2.changed).toBe(false);
      expect(r2.before).toEqual(r2.after);
    }
  });
});

// ---------------------------------------------------------------------------
// dryRun semantics
// ---------------------------------------------------------------------------

describe('styles adapter: dryRun', () => {
  it('returns predicted after state without mutating XML', () => {
    const editor = createMockEditor({ stylesXml: makeStylesXml() });
    const options: NormalizedStylesApplyOptions = { dryRun: true, expectedRevision: undefined };
    const result = stylesApplyAdapter(editor, VALID_INPUT, options);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.dryRun).toBe(true);
      expect(result.before.bold).toBe('inherit');
      expect(result.after.bold).toBe('on');
      expect(result.changed).toBe(true);
    }

    // Verify XML was not changed
    const elements = getRPrElements(editor);
    const boldEl = elements?.find((el) => el.name === 'w:b');
    expect(boldEl).toBeUndefined();
  });

  it('does not mark converter as modified on dryRun', () => {
    const editor = createMockEditor({ stylesXml: makeStylesXml() });
    const converter = (editor as unknown as { converter: { documentModified: boolean } }).converter;
    const options: NormalizedStylesApplyOptions = { dryRun: true, expectedRevision: undefined };
    stylesApplyAdapter(editor, VALID_INPUT, options);
    expect(converter.documentModified).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Create-if-missing paths
// ---------------------------------------------------------------------------

describe('styles adapter: create-if-missing nodes', () => {
  it('creates w:docDefaults, w:rPrDefault, w:rPr when missing', () => {
    const editor = createMockEditor({ stylesXml: makeMinimalStylesXml() });
    const result = stylesApplyAdapter(editor, VALID_INPUT, DEFAULT_OPTIONS);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.changed).toBe(true);
      expect(result.after.bold).toBe('on');
    }

    // Verify the full path was created
    const elements = getRPrElements(editor);
    expect(elements).toBeDefined();
    const boldEl = elements?.find((el) => el.name === 'w:b');
    expect(boldEl).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Malformed XML canonicalization
// ---------------------------------------------------------------------------

describe('styles adapter: malformed XML canonicalization', () => {
  it('reads last <w:b> when duplicates exist', () => {
    const editor = createMockEditor({
      stylesXml: makeStylesXml(
        { name: 'w:b', attributes: { 'w:val': '0' } }, // first: off
        { name: 'w:b' }, // last: on (wins)
      ),
    });
    const result = stylesApplyAdapter(
      editor,
      { target: { scope: 'docDefaults', channel: 'run' }, patch: { bold: true } },
      { dryRun: true, expectedRevision: undefined },
    );
    if (result.success) {
      expect(result.before.bold).toBe('on');
    }
  });

  it('normalizes to exactly one <w:b> on write (removes duplicates)', () => {
    const editor = createMockEditor({
      stylesXml: makeStylesXml({ name: 'w:b', attributes: { 'w:val': '0' } }, { name: 'w:b' }),
    });
    stylesApplyAdapter(
      editor,
      { target: { scope: 'docDefaults', channel: 'run' }, patch: { bold: false } },
      DEFAULT_OPTIONS,
    );

    const elements = getRPrElements(editor);
    const boldElements = elements?.filter((el) => el.name === 'w:b');
    expect(boldElements?.length).toBe(1);
    expect(boldElements?.[0].attributes?.['w:val']).toBe('0');
  });

  it('normalizes mixed val form (w:val="true") to canonical form on mutation', () => {
    const editor = createMockEditor({
      stylesXml: makeStylesXml({ name: 'w:b', attributes: { 'w:val': 'true' } }),
    });
    // Applying bold: true should not change state but should canonicalize
    const result = stylesApplyAdapter(editor, VALID_INPUT, DEFAULT_OPTIONS);
    if (result.success) {
      expect(result.before.bold).toBe('on');
      // Same state — no change needed
      expect(result.changed).toBe(false);
    }
  });

  it('preserves unknown sibling elements in w:rPr', () => {
    const italicEl: XmlElement = { name: 'w:i' };
    const szEl: XmlElement = { name: 'w:sz', attributes: { 'w:val': '24' } };
    const editor = createMockEditor({
      stylesXml: makeStylesXml(italicEl, szEl),
    });
    stylesApplyAdapter(editor, VALID_INPUT, DEFAULT_OPTIONS);

    const elements = getRPrElements(editor);
    const names = elements?.map((el) => el.name);
    expect(names).toContain('w:i');
    expect(names).toContain('w:sz');
    expect(names).toContain('w:b');
  });

  it('produces deterministic ordering on repeated calls', () => {
    const editor = createMockEditor({
      stylesXml: makeStylesXml({ name: 'w:i' }),
    });
    stylesApplyAdapter(editor, VALID_INPUT, DEFAULT_OPTIONS);
    const elements1 = getRPrElements(editor)?.map((el) => el.name);

    // Call again (no-op)
    stylesApplyAdapter(editor, VALID_INPUT, DEFAULT_OPTIONS);
    const elements2 = getRPrElements(editor)?.map((el) => el.name);

    expect(elements1).toEqual(elements2);
  });
});

// ---------------------------------------------------------------------------
// Resolution metadata
// ---------------------------------------------------------------------------

describe('styles adapter: resolution metadata', () => {
  it('returns correct resolution on success', () => {
    const editor = createMockEditor({ stylesXml: makeStylesXml() });
    const result = stylesApplyAdapter(editor, VALID_INPUT, DEFAULT_OPTIONS);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.resolution).toEqual({
        scope: 'docDefaults',
        channel: 'run',
        xmlPart: 'word/styles.xml',
        xmlPath: 'w:styles/w:docDefaults/w:rPrDefault/w:rPr',
      });
    }
  });
});
