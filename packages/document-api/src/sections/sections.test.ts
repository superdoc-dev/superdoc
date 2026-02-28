import {
  executeSectionsList,
  executeSectionsGet,
  executeSectionsSetPageMargins,
  executeSectionsSetPageNumbering,
  executeSectionsSetPageBorders,
  executeSectionsSetHeaderFooterRef,
  executeSectionsSetOddEvenHeadersFooters,
  type SectionsAdapter,
} from './sections.js';

function makeAdapter(overrides: Partial<SectionsAdapter> = {}): SectionsAdapter {
  const base: SectionsAdapter = {
    list: () => ({
      evaluatedRevision: '0',
      total: 0,
      items: [],
      page: { limit: 250, offset: 0, returned: 0 },
    }),
    get: () => ({
      address: { kind: 'section', sectionId: 'section-0' },
      index: 0,
      range: { startParagraphIndex: 0, endParagraphIndex: 0 },
    }),
    setBreakType: () => ({ success: true, section: { kind: 'section', sectionId: 'section-0' } }),
    setPageMargins: () => ({ success: true, section: { kind: 'section', sectionId: 'section-0' } }),
    setHeaderFooterMargins: () => ({ success: true, section: { kind: 'section', sectionId: 'section-0' } }),
    setPageSetup: () => ({ success: true, section: { kind: 'section', sectionId: 'section-0' } }),
    setColumns: () => ({ success: true, section: { kind: 'section', sectionId: 'section-0' } }),
    setLineNumbering: () => ({ success: true, section: { kind: 'section', sectionId: 'section-0' } }),
    setPageNumbering: () => ({ success: true, section: { kind: 'section', sectionId: 'section-0' } }),
    setTitlePage: () => ({ success: true, section: { kind: 'section', sectionId: 'section-0' } }),
    setOddEvenHeadersFooters: () => ({ success: true }),
    setVerticalAlign: () => ({ success: true, section: { kind: 'section', sectionId: 'section-0' } }),
    setSectionDirection: () => ({ success: true, section: { kind: 'section', sectionId: 'section-0' } }),
    setHeaderFooterRef: () => ({ success: true, section: { kind: 'section', sectionId: 'section-0' } }),
    clearHeaderFooterRef: () => ({ success: true, section: { kind: 'section', sectionId: 'section-0' } }),
    setLinkToPrevious: () => ({ success: true, section: { kind: 'section', sectionId: 'section-0' } }),
    setPageBorders: () => ({ success: true, section: { kind: 'section', sectionId: 'section-0' } }),
    clearPageBorders: () => ({ success: true, section: { kind: 'section', sectionId: 'section-0' } }),
  };

  return {
    ...base,
    ...overrides,
  };
}

describe('sections API validation', () => {
  it('normalizes list defaults to limit=250 and offset=0', () => {
    const list = vi.fn(makeAdapter().list);
    const adapter = makeAdapter({ list });

    executeSectionsList(adapter);

    expect(list).toHaveBeenCalledWith({ limit: 250, offset: 0 });
  });

  it('rejects invalid list limit', () => {
    const adapter = makeAdapter();
    expect(() => executeSectionsList(adapter, { limit: 0 })).toThrow(/limit must be a positive integer/i);
  });

  it('validates section address for sections.get', () => {
    const adapter = makeAdapter();
    expect(() => executeSectionsGet(adapter, { address: { kind: 'node', sectionId: 'x' } as any })).toThrow(
      /must be a section address/i,
    );
  });

  it('requires at least one field for setPageMargins', () => {
    const adapter = makeAdapter();
    expect(() =>
      executeSectionsSetPageMargins(adapter, {
        target: { kind: 'section', sectionId: 'section-0' },
      }),
    ).toThrow(/requires at least one margin field/i);
  });

  it('rejects empty refId for setHeaderFooterRef', () => {
    const adapter = makeAdapter();
    expect(() =>
      executeSectionsSetHeaderFooterRef(adapter, {
        target: { kind: 'section', sectionId: 'section-0' },
        kind: 'header',
        variant: 'default',
        refId: '   ',
      }),
    ).toThrow(/must be a non-empty string/i);
  });

  it('accepts targetless odd/even settings mutation input', () => {
    const setOddEvenHeadersFooters = vi.fn(makeAdapter().setOddEvenHeadersFooters);
    const adapter = makeAdapter({ setOddEvenHeadersFooters });

    executeSectionsSetOddEvenHeadersFooters(adapter, { enabled: true }, { dryRun: true });

    expect(setOddEvenHeadersFooters).toHaveBeenCalledWith({ enabled: true }, { changeMode: 'direct', dryRun: true });
  });

  it('requires at least one field for setPageNumbering', () => {
    const adapter = makeAdapter();
    expect(() =>
      executeSectionsSetPageNumbering(adapter, {
        target: { kind: 'section', sectionId: 'section-0' },
      }),
    ).toThrow(/requires at least one of start or format/i);
  });

  it('requires at least one field for setPageBorders', () => {
    const adapter = makeAdapter();
    expect(() =>
      executeSectionsSetPageBorders(adapter, {
        target: { kind: 'section', sectionId: 'section-0' },
        borders: {},
      }),
    ).toThrow(/requires at least one border field/i);
  });
});
