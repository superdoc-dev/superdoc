import { describe, it, expect, vi } from 'vitest';
import type { StylesApplyInput, NormalizedStylesApplyOptions } from '@superdoc/document-api';
import { stylesApplyAdapter } from './styles-adapter.js';
import { DocumentApiAdapterError } from './errors.js';

// ---------------------------------------------------------------------------
// Mock editor factory
// ---------------------------------------------------------------------------

interface XmlElement {
  name: string;
  type?: string;
  elements?: XmlElement[];
  attributes?: Record<string, string>;
}

interface MockEditorOptions {
  stylesXml?: XmlElement;
  noConverter?: boolean;
  collaborationProvider?: { synced?: boolean; isSynced?: boolean } | null;
  translatedLinkedStyles?: Record<string, unknown>;
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
        translatedLinkedStyles: opts.translatedLinkedStyles ?? {},
      };

  return {
    converter,
    options: {
      collaborationProvider: opts.collaborationProvider ?? null,
    },
    on: vi.fn(),
    emit: vi.fn(),
  } as unknown as Parameters<typeof stylesApplyAdapter>[0];
}

/** Creates a minimal styles XML with w:styles root (enough to pass capability gates). */
function makeStylesXml(): XmlElement {
  return {
    name: 'root',
    elements: [{ name: 'w:styles', elements: [] }],
  };
}

function runInput(patch: Record<string, unknown>): StylesApplyInput {
  return { target: { scope: 'docDefaults', channel: 'run' }, patch } as StylesApplyInput;
}

function paragraphInput(patch: Record<string, unknown>): StylesApplyInput {
  return { target: { scope: 'docDefaults', channel: 'paragraph' }, patch } as StylesApplyInput;
}

const DEFAULT_OPTIONS: NormalizedStylesApplyOptions = {
  dryRun: false,
  expectedRevision: undefined,
};

const DRY_RUN_OPTIONS: NormalizedStylesApplyOptions = {
  dryRun: true,
  expectedRevision: undefined,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getTranslatedLinkedStyles(editor: ReturnType<typeof createMockEditor>) {
  return (editor as unknown as { converter: { translatedLinkedStyles: Record<string, unknown> } }).converter
    .translatedLinkedStyles;
}

// ---------------------------------------------------------------------------
// Capability gate tests
// ---------------------------------------------------------------------------

describe('styles adapter: capability gates', () => {
  it('throws CAPABILITY_UNAVAILABLE when converter is missing', () => {
    const editor = createMockEditor({ noConverter: true });
    expect(() => stylesApplyAdapter(editor, runInput({ bold: true }), DEFAULT_OPTIONS)).toThrow(
      DocumentApiAdapterError,
    );
    try {
      stylesApplyAdapter(editor, runInput({ bold: true }), DEFAULT_OPTIONS);
    } catch (e) {
      expect((e as DocumentApiAdapterError).code).toBe('CAPABILITY_UNAVAILABLE');
    }
  });

  it('throws CAPABILITY_UNAVAILABLE when word/styles.xml is missing', () => {
    const editor = createMockEditor();
    expect(() => stylesApplyAdapter(editor, runInput({ bold: true }), DEFAULT_OPTIONS)).toThrow(
      DocumentApiAdapterError,
    );
  });

  it('throws CAPABILITY_UNAVAILABLE when collaboration is active', () => {
    const editor = createMockEditor({
      stylesXml: makeStylesXml(),
      collaborationProvider: { synced: true },
    });
    expect(() => stylesApplyAdapter(editor, runInput({ bold: true }), DEFAULT_OPTIONS)).toThrow(
      DocumentApiAdapterError,
    );
  });

  it('allows mutation when collaboration provider is not synced', () => {
    const editor = createMockEditor({
      stylesXml: makeStylesXml(),
      collaborationProvider: { synced: false },
    });
    const result = stylesApplyAdapter(editor, runInput({ bold: true }), DEFAULT_OPTIONS);
    expect(result.success).toBe(true);
  });

  it('throws CAPABILITY_UNAVAILABLE when w:styles root is missing', () => {
    const editor = createMockEditor({
      stylesXml: { name: 'root', elements: [{ name: 'not-styles' }] },
    });
    expect(() => stylesApplyAdapter(editor, runInput({ bold: true }), DEFAULT_OPTIONS)).toThrow(
      DocumentApiAdapterError,
    );
  });
});

// ---------------------------------------------------------------------------
// Run channel: boolean properties (bold, italic)
// ---------------------------------------------------------------------------

describe('styles adapter: run boolean properties', () => {
  it('sets bold: true on empty docDefaults', () => {
    const editor = createMockEditor({ stylesXml: makeStylesXml() });
    const result = stylesApplyAdapter(editor, runInput({ bold: true }), DEFAULT_OPTIONS);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.changed).toBe(true);
      expect(result.before.bold).toBe('inherit');
      expect(result.after.bold).toBe('on');
    }

    // Verify translatedLinkedStyles was mutated
    const tls = getTranslatedLinkedStyles(editor) as { docDefaults: { runProperties: Record<string, unknown> } };
    expect(tls.docDefaults.runProperties.bold).toBe(true);
  });

  it('sets bold: false on empty docDefaults', () => {
    const editor = createMockEditor({ stylesXml: makeStylesXml() });
    const result = stylesApplyAdapter(editor, runInput({ bold: false }), DEFAULT_OPTIONS);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.changed).toBe(true);
      expect(result.before.bold).toBe('inherit');
      expect(result.after.bold).toBe('off');
    }
  });

  it('sets italic: true on empty docDefaults', () => {
    const editor = createMockEditor({ stylesXml: makeStylesXml() });
    const result = stylesApplyAdapter(editor, runInput({ italic: true }), DEFAULT_OPTIONS);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.changed).toBe(true);
      expect(result.before.italic).toBe('inherit');
      expect(result.after.italic).toBe('on');
    }
  });

  it('sets both bold and italic in single call', () => {
    const editor = createMockEditor({ stylesXml: makeStylesXml() });
    const result = stylesApplyAdapter(editor, runInput({ bold: true, italic: false }), DEFAULT_OPTIONS);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.changed).toBe(true);
      expect(result.after.bold).toBe('on');
      expect(result.after.italic).toBe('off');
    }
  });

  it('reads existing bold value from translatedLinkedStyles', () => {
    const editor = createMockEditor({
      stylesXml: makeStylesXml(),
      translatedLinkedStyles: { docDefaults: { runProperties: { bold: true } } },
    });
    const result = stylesApplyAdapter(editor, runInput({ bold: true }), DEFAULT_OPTIONS);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.changed).toBe(false);
      expect(result.before.bold).toBe('on');
      expect(result.after.bold).toBe('on');
    }
  });
});

// ---------------------------------------------------------------------------
// No-op semantics
// ---------------------------------------------------------------------------

describe('styles adapter: no-op semantics', () => {
  it('returns changed: false when value already matches', () => {
    const editor = createMockEditor({
      stylesXml: makeStylesXml(),
      translatedLinkedStyles: { docDefaults: { runProperties: { bold: true } } },
    });
    const result = stylesApplyAdapter(editor, runInput({ bold: true }), DEFAULT_OPTIONS);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.changed).toBe(false);
    }
  });

  it('does not mark converter as modified on no-op', () => {
    const editor = createMockEditor({
      stylesXml: makeStylesXml(),
      translatedLinkedStyles: { docDefaults: { runProperties: { bold: true } } },
    });
    const converter = (editor as unknown as { converter: { documentModified: boolean } }).converter;
    stylesApplyAdapter(editor, runInput({ bold: true }), DEFAULT_OPTIONS);
    expect(converter.documentModified).toBe(false);
  });

  it('does not emit stylesDefaultsChanged on no-op', () => {
    const editor = createMockEditor({
      stylesXml: makeStylesXml(),
      translatedLinkedStyles: { docDefaults: { runProperties: { bold: true } } },
    });
    stylesApplyAdapter(editor, runInput({ bold: true }), DEFAULT_OPTIONS);
    expect((editor as unknown as { emit: ReturnType<typeof vi.fn> }).emit).not.toHaveBeenCalledWith(
      'stylesDefaultsChanged',
    );
  });
});

// ---------------------------------------------------------------------------
// dryRun semantics
// ---------------------------------------------------------------------------

describe('styles adapter: dryRun', () => {
  it('returns predicted after-state without mutating translatedLinkedStyles', () => {
    const editor = createMockEditor({ stylesXml: makeStylesXml() });
    const result = stylesApplyAdapter(editor, runInput({ bold: true }), DRY_RUN_OPTIONS);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.dryRun).toBe(true);
      expect(result.before.bold).toBe('inherit');
      expect(result.after.bold).toBe('on');
      expect(result.changed).toBe(true);
    }

    // Verify translatedLinkedStyles was NOT mutated
    const tls = getTranslatedLinkedStyles(editor) as { docDefaults?: { runProperties?: Record<string, unknown> } };
    expect(tls.docDefaults?.runProperties?.bold).toBeUndefined();
  });

  it('does not emit stylesDefaultsChanged on dryRun', () => {
    const editor = createMockEditor({ stylesXml: makeStylesXml() });
    stylesApplyAdapter(editor, runInput({ bold: true }), DRY_RUN_OPTIONS);
    expect((editor as unknown as { emit: ReturnType<typeof vi.fn> }).emit).not.toHaveBeenCalledWith(
      'stylesDefaultsChanged',
    );
  });

  it('does not mark converter as modified on dryRun', () => {
    const editor = createMockEditor({ stylesXml: makeStylesXml() });
    const converter = (editor as unknown as { converter: { documentModified: boolean } }).converter;
    stylesApplyAdapter(editor, runInput({ bold: true }), DRY_RUN_OPTIONS);
    expect(converter.documentModified).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Re-render trigger
// ---------------------------------------------------------------------------

describe('styles adapter: re-render trigger', () => {
  it('emits stylesDefaultsChanged after successful non-dry mutation', () => {
    const editor = createMockEditor({ stylesXml: makeStylesXml() });
    stylesApplyAdapter(editor, runInput({ bold: true }), DEFAULT_OPTIONS);
    expect((editor as unknown as { emit: ReturnType<typeof vi.fn> }).emit).toHaveBeenCalledWith(
      'stylesDefaultsChanged',
    );
  });
});

// ---------------------------------------------------------------------------
// Run channel: number properties
// ---------------------------------------------------------------------------

describe('styles adapter: run number properties', () => {
  it('sets fontSize on empty docDefaults', () => {
    const editor = createMockEditor({ stylesXml: makeStylesXml() });
    const result = stylesApplyAdapter(editor, runInput({ fontSize: 24 }), DEFAULT_OPTIONS);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.changed).toBe(true);
      expect(result.before.fontSize).toBe('inherit');
      expect(result.after.fontSize).toBe(24);
    }
  });

  it('reads existing fontSize from translatedLinkedStyles', () => {
    const editor = createMockEditor({
      stylesXml: makeStylesXml(),
      translatedLinkedStyles: { docDefaults: { runProperties: { fontSize: 24 } } },
    });
    const result = stylesApplyAdapter(editor, runInput({ fontSize: 24 }), DEFAULT_OPTIONS);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.changed).toBe(false);
      expect(result.before.fontSize).toBe(24);
    }
  });

  it('sets fontSizeCs', () => {
    const editor = createMockEditor({ stylesXml: makeStylesXml() });
    const result = stylesApplyAdapter(editor, runInput({ fontSizeCs: 32 }), DEFAULT_OPTIONS);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.after.fontSizeCs).toBe(32);
    }
  });

  it('sets letterSpacing (including negative)', () => {
    const editor = createMockEditor({ stylesXml: makeStylesXml() });
    const result = stylesApplyAdapter(editor, runInput({ letterSpacing: -20 }), DEFAULT_OPTIONS);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.after.letterSpacing).toBe(-20);
    }
  });
});

// ---------------------------------------------------------------------------
// Run channel: object properties (fontFamily, color)
// ---------------------------------------------------------------------------

describe('styles adapter: run object properties', () => {
  it('sets fontFamily with merge semantics', () => {
    const editor = createMockEditor({
      stylesXml: makeStylesXml(),
      translatedLinkedStyles: {
        docDefaults: { runProperties: { fontFamily: { ascii: 'Times', hAnsi: 'Times' } } },
      },
    });
    const result = stylesApplyAdapter(editor, runInput({ fontFamily: { ascii: 'Arial' } }), DEFAULT_OPTIONS);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.changed).toBe(true);
      // Before shows the original
      expect(result.before.fontFamily).toEqual({ ascii: 'Times', hAnsi: 'Times' });
      // After shows merge: ascii updated, hAnsi preserved
      expect(result.after.fontFamily).toEqual({ ascii: 'Arial', hAnsi: 'Times' });
    }

    // Verify the actual stored value
    const tls = getTranslatedLinkedStyles(editor) as {
      docDefaults: { runProperties: { fontFamily: Record<string, string> } };
    };
    expect(tls.docDefaults.runProperties.fontFamily).toEqual({ ascii: 'Arial', hAnsi: 'Times' });
  });

  it('sets fontFamily on empty docDefaults', () => {
    const editor = createMockEditor({ stylesXml: makeStylesXml() });
    const result = stylesApplyAdapter(editor, runInput({ fontFamily: { ascii: 'Arial' } }), DEFAULT_OPTIONS);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.before.fontFamily).toBe('inherit');
      expect(result.after.fontFamily).toEqual({ ascii: 'Arial' });
    }
  });

  it('sets color with merge semantics', () => {
    const editor = createMockEditor({
      stylesXml: makeStylesXml(),
      translatedLinkedStyles: {
        docDefaults: { runProperties: { color: { val: '000000', themeColor: 'text1' } } },
      },
    });
    const result = stylesApplyAdapter(editor, runInput({ color: { val: 'FF0000' } }), DEFAULT_OPTIONS);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.after.color).toEqual({ val: 'FF0000', themeColor: 'text1' });
    }
  });
});

// ---------------------------------------------------------------------------
// Paragraph channel: enum properties (justification)
// ---------------------------------------------------------------------------

describe('styles adapter: paragraph channel', () => {
  it('sets justification on empty docDefaults', () => {
    const editor = createMockEditor({ stylesXml: makeStylesXml() });
    const result = stylesApplyAdapter(editor, paragraphInput({ justification: 'center' }), DEFAULT_OPTIONS);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.changed).toBe(true);
      expect(result.before.justification).toBe('inherit');
      expect(result.after.justification).toBe('center');
    }

    const tls = getTranslatedLinkedStyles(editor) as {
      docDefaults: { paragraphProperties: Record<string, unknown> };
    };
    expect(tls.docDefaults.paragraphProperties.justification).toBe('center');
  });

  it('reads existing justification', () => {
    const editor = createMockEditor({
      stylesXml: makeStylesXml(),
      translatedLinkedStyles: {
        docDefaults: { paragraphProperties: { justification: 'center' } },
      },
    });
    const result = stylesApplyAdapter(editor, paragraphInput({ justification: 'center' }), DEFAULT_OPTIONS);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.changed).toBe(false);
    }
  });

  it('returns correct resolution metadata for paragraph channel', () => {
    const editor = createMockEditor({ stylesXml: makeStylesXml() });
    const result = stylesApplyAdapter(editor, paragraphInput({ justification: 'left' }), DEFAULT_OPTIONS);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.resolution).toEqual({
        scope: 'docDefaults',
        channel: 'paragraph',
        xmlPart: 'word/styles.xml',
        xmlPath: 'w:styles/w:docDefaults/w:pPrDefault/w:pPr',
      });
    }
  });
});

// ---------------------------------------------------------------------------
// Paragraph channel: object properties (spacing, indent)
// ---------------------------------------------------------------------------

describe('styles adapter: paragraph object properties', () => {
  it('sets spacing with merge semantics', () => {
    const editor = createMockEditor({
      stylesXml: makeStylesXml(),
      translatedLinkedStyles: {
        docDefaults: { paragraphProperties: { spacing: { before: 240, after: 120 } } },
      },
    });
    const result = stylesApplyAdapter(
      editor,
      paragraphInput({ spacing: { before: 480, lineRule: 'exact' } }),
      DEFAULT_OPTIONS,
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.after.spacing).toEqual({ before: 480, after: 120, lineRule: 'exact' });
    }
  });

  it('sets indent with merge semantics', () => {
    const editor = createMockEditor({
      stylesXml: makeStylesXml(),
      translatedLinkedStyles: {
        docDefaults: { paragraphProperties: { indent: { left: 720 } } },
      },
    });
    const result = stylesApplyAdapter(editor, paragraphInput({ indent: { firstLine: 720 } }), DEFAULT_OPTIONS);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.after.indent).toEqual({ left: 720, firstLine: 720 });
    }
  });

  it('sets indent on empty docDefaults', () => {
    const editor = createMockEditor({ stylesXml: makeStylesXml() });
    const result = stylesApplyAdapter(editor, paragraphInput({ indent: { firstLine: 720 } }), DEFAULT_OPTIONS);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.before.indent).toBe('inherit');
      expect(result.after.indent).toEqual({ firstLine: 720 });
    }
  });
});

// ---------------------------------------------------------------------------
// Multi-property single call
// ---------------------------------------------------------------------------

describe('styles adapter: multi-property calls', () => {
  it('handles multiple run properties in a single call', () => {
    const editor = createMockEditor({ stylesXml: makeStylesXml() });
    const result = stylesApplyAdapter(editor, runInput({ bold: true, italic: false, fontSize: 24 }), DEFAULT_OPTIONS);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.after.bold).toBe('on');
      expect(result.after.italic).toBe('off');
      expect(result.after.fontSize).toBe(24);
    }
  });

  it('handles multiple paragraph properties in a single call', () => {
    const editor = createMockEditor({ stylesXml: makeStylesXml() });
    const result = stylesApplyAdapter(
      editor,
      paragraphInput({ justification: 'center', spacing: { before: 240 }, indent: { left: 720 } }),
      DEFAULT_OPTIONS,
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.after.justification).toBe('center');
      expect(result.after.spacing).toEqual({ before: 240 });
      expect(result.after.indent).toEqual({ left: 720 });
    }
  });
});

// ---------------------------------------------------------------------------
// Resolution metadata
// ---------------------------------------------------------------------------

describe('styles adapter: resolution metadata', () => {
  it('returns correct resolution for run channel', () => {
    const editor = createMockEditor({ stylesXml: makeStylesXml() });
    const result = stylesApplyAdapter(editor, runInput({ bold: true }), DEFAULT_OPTIONS);
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

// ---------------------------------------------------------------------------
// XML sync (decode roundtrip)
// ---------------------------------------------------------------------------

describe('styles adapter: XML sync via decode', () => {
  it('syncs translatedLinkedStyles back to convertedXml on mutation', () => {
    const editor = createMockEditor({ stylesXml: makeStylesXml() });
    stylesApplyAdapter(editor, runInput({ bold: true }), DEFAULT_OPTIONS);

    // The syncDocDefaultsToConvertedXml call should have updated the XML
    const converter = (editor as unknown as { converter: { convertedXml: Record<string, XmlElement> } }).converter;
    const stylesRoot = converter.convertedXml['word/styles.xml']?.elements?.find(
      (el: XmlElement) => el.name === 'w:styles',
    );
    // After sync, w:docDefaults should exist in the XML
    const docDefaults = stylesRoot?.elements?.find((el: XmlElement) => el.name === 'w:docDefaults');
    expect(docDefaults).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Data loss guard — decode roundtrip behavior
// ---------------------------------------------------------------------------

describe('styles adapter: data loss guard', () => {
  it('documents that decode roundtrip may not preserve unknown extensions', () => {
    // This test documents known behavior: the translator decode() path
    // can only reconstruct nodes it knows about. Unknown vendor extensions
    // inside w:rPr may be dropped.
    //
    // This is NOT a new risk — the same decode() path is used during
    // normal document export. If data loss exists, it existed before styles.apply.
    const editor = createMockEditor({
      stylesXml: makeStylesXml(),
      translatedLinkedStyles: {
        docDefaults: { runProperties: { bold: true } },
      },
    });

    // Apply a change to trigger sync
    const result = stylesApplyAdapter(editor, runInput({ italic: true }), DEFAULT_OPTIONS);
    expect(result.success).toBe(true);

    // The translatedLinkedStyles should have both bold and italic
    const tls = getTranslatedLinkedStyles(editor) as {
      docDefaults: { runProperties: Record<string, unknown> };
    };
    expect(tls.docDefaults.runProperties.bold).toBe(true);
    expect(tls.docDefaults.runProperties.italic).toBe(true);
  });
});
