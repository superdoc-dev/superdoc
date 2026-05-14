import { describe, it, expect, mock } from 'bun:test';
import { DocumentApiValidationError } from '../errors.js';
import {
  executeCustomXmlPartsList,
  executeCustomXmlPartsGet,
  executeCustomXmlPartsCreate,
  executeCustomXmlPartsPatch,
  executeCustomXmlPartsRemove,
  type CustomXmlPartsAdapter,
} from './customXml.js';

function makeAdapter(): CustomXmlPartsAdapter {
  return {
    list: mock().mockReturnValue({ items: [], total: 0 }),
    get: mock().mockReturnValue(null),
    create: mock().mockReturnValue({ success: true, id: '{X}', partName: 'customXml/item1.xml', propsPartName: 'customXml/itemProps1.xml' }),
    patch: mock().mockReturnValue({ success: true, target: { id: '{X}' } }),
    remove: mock().mockReturnValue({ success: true, target: { id: '{X}' } }),
  };
}

const VALID_XML = '<refs xmlns="urn:test:1"><ref id="a"/></refs>';

// ---------------------------------------------------------------------------
// list
// ---------------------------------------------------------------------------

describe('customXml.parts.list validation', () => {
  it('accepts no input', () => {
    const adapter = makeAdapter();
    expect(() => executeCustomXmlPartsList(adapter)).not.toThrow();
    expect(adapter.list).toHaveBeenCalled();
  });

  it('accepts rootNamespace filter', () => {
    const adapter = makeAdapter();
    expect(() => executeCustomXmlPartsList(adapter, { rootNamespace: 'urn:foo' })).not.toThrow();
  });

  it('accepts schemaRef filter', () => {
    const adapter = makeAdapter();
    expect(() => executeCustomXmlPartsList(adapter, { schemaRef: 'urn:foo' })).not.toThrow();
  });

  it('rejects non-string rootNamespace', () => {
    const adapter = makeAdapter();
    expect(() => executeCustomXmlPartsList(adapter, { rootNamespace: 42 as unknown as string })).toThrow(
      DocumentApiValidationError,
    );
  });

  it('rejects non-string schemaRef', () => {
    const adapter = makeAdapter();
    expect(() => executeCustomXmlPartsList(adapter, { schemaRef: {} as unknown as string })).toThrow(
      DocumentApiValidationError,
    );
  });
});

// ---------------------------------------------------------------------------
// Target validation (shared across get/patch/remove)
// ---------------------------------------------------------------------------

describe('customXml.parts target validation', () => {
  it('accepts { id }', () => {
    const adapter = makeAdapter();
    expect(() => executeCustomXmlPartsGet(adapter, { target: { id: '{X}' } })).not.toThrow();
  });

  it('accepts { partName }', () => {
    const adapter = makeAdapter();
    expect(() => executeCustomXmlPartsGet(adapter, { target: { partName: 'customXml/item1.xml' } })).not.toThrow();
  });

  it('rejects null target', () => {
    const adapter = makeAdapter();
    expect(() => executeCustomXmlPartsGet(adapter, { target: null as unknown as { id: string } })).toThrow(
      DocumentApiValidationError,
    );
  });

  it('rejects target with neither id nor partName', () => {
    const adapter = makeAdapter();
    expect(() => executeCustomXmlPartsGet(adapter, { target: {} as { id: string } })).toThrow(
      DocumentApiValidationError,
    );
  });

  it('rejects target with empty id', () => {
    const adapter = makeAdapter();
    expect(() => executeCustomXmlPartsGet(adapter, { target: { id: '' } })).toThrow(DocumentApiValidationError);
  });

  it('rejects target with empty partName', () => {
    const adapter = makeAdapter();
    expect(() => executeCustomXmlPartsGet(adapter, { target: { partName: '' } })).toThrow(
      DocumentApiValidationError,
    );
  });

  it('rejects target with BOTH id and partName', () => {
    const adapter = makeAdapter();
    expect(() =>
      executeCustomXmlPartsGet(adapter, {
        target: { id: '{X}', partName: 'customXml/item1.xml' } as { id: string },
      }),
    ).toThrow(DocumentApiValidationError);
  });
});

// ---------------------------------------------------------------------------
// create
// ---------------------------------------------------------------------------

describe('customXml.parts.create validation', () => {
  it('accepts well-formed content with no schemaRefs', () => {
    const adapter = makeAdapter();
    expect(() => executeCustomXmlPartsCreate(adapter, { content: VALID_XML })).not.toThrow();
  });

  it('accepts well-formed content with schemaRefs', () => {
    const adapter = makeAdapter();
    expect(() =>
      executeCustomXmlPartsCreate(adapter, { content: VALID_XML, schemaRefs: ['urn:test:1'] }),
    ).not.toThrow();
  });

  it('accepts empty schemaRefs array', () => {
    const adapter = makeAdapter();
    expect(() => executeCustomXmlPartsCreate(adapter, { content: VALID_XML, schemaRefs: [] })).not.toThrow();
  });

  it('rejects empty content', () => {
    const adapter = makeAdapter();
    expect(() => executeCustomXmlPartsCreate(adapter, { content: '' })).toThrow(DocumentApiValidationError);
  });

  it('rejects non-string content', () => {
    const adapter = makeAdapter();
    expect(() => executeCustomXmlPartsCreate(adapter, { content: 42 as unknown as string })).toThrow(
      DocumentApiValidationError,
    );
  });

  it('rejects content with no XML root element', () => {
    const adapter = makeAdapter();
    expect(() => executeCustomXmlPartsCreate(adapter, { content: 'not xml at all' })).toThrow(
      DocumentApiValidationError,
    );
  });

  it('rejects non-array schemaRefs', () => {
    const adapter = makeAdapter();
    expect(() =>
      executeCustomXmlPartsCreate(adapter, { content: VALID_XML, schemaRefs: 'urn:foo' as unknown as string[] }),
    ).toThrow(DocumentApiValidationError);
  });

  it('rejects schemaRefs with empty string entries', () => {
    const adapter = makeAdapter();
    expect(() => executeCustomXmlPartsCreate(adapter, { content: VALID_XML, schemaRefs: [''] })).toThrow(
      DocumentApiValidationError,
    );
  });

  it('rejects schemaRefs with non-string entries', () => {
    const adapter = makeAdapter();
    expect(() =>
      executeCustomXmlPartsCreate(adapter, {
        content: VALID_XML,
        schemaRefs: [42 as unknown as string],
      }),
    ).toThrow(DocumentApiValidationError);
  });
});

// ---------------------------------------------------------------------------
// patch
// ---------------------------------------------------------------------------

describe('customXml.parts.patch validation', () => {
  const target = { id: '{X}' };

  it('accepts content-only patch', () => {
    const adapter = makeAdapter();
    expect(() => executeCustomXmlPartsPatch(adapter, { target, content: VALID_XML })).not.toThrow();
  });

  it('accepts schemaRefs-only patch', () => {
    const adapter = makeAdapter();
    expect(() => executeCustomXmlPartsPatch(adapter, { target, schemaRefs: ['urn:foo'] })).not.toThrow();
  });

  it('accepts patch with both content and schemaRefs', () => {
    const adapter = makeAdapter();
    expect(() =>
      executeCustomXmlPartsPatch(adapter, { target, content: VALID_XML, schemaRefs: ['urn:foo'] }),
    ).not.toThrow();
  });

  it('rejects patch with neither content nor schemaRefs', () => {
    const adapter = makeAdapter();
    expect(() => executeCustomXmlPartsPatch(adapter, { target })).toThrow(DocumentApiValidationError);
  });

  it('accepts patch with empty schemaRefs alongside valid content', () => {
    // Empty schemaRefs is allowed (means "clear them"); content also valid.
    const adapter = makeAdapter();
    expect(() => executeCustomXmlPartsPatch(adapter, { target, content: VALID_XML, schemaRefs: [] })).not.toThrow();
  });

  it('rejects malformed content', () => {
    const adapter = makeAdapter();
    expect(() => executeCustomXmlPartsPatch(adapter, { target, content: 'not xml' })).toThrow(
      DocumentApiValidationError,
    );
  });
});

// ---------------------------------------------------------------------------
// remove
// ---------------------------------------------------------------------------

describe('customXml.parts.remove validation', () => {
  it('accepts { id } target', () => {
    const adapter = makeAdapter();
    expect(() => executeCustomXmlPartsRemove(adapter, { target: { id: '{X}' } })).not.toThrow();
  });

  it('accepts { partName } target', () => {
    const adapter = makeAdapter();
    expect(() => executeCustomXmlPartsRemove(adapter, { target: { partName: 'customXml/item1.xml' } })).not.toThrow();
  });

  it('rejects missing target', () => {
    const adapter = makeAdapter();
    expect(() => executeCustomXmlPartsRemove(adapter, { target: {} as { id: string } })).toThrow(
      DocumentApiValidationError,
    );
  });
});
