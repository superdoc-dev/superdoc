/**
 * Shared helpers for adapter parity tests.
 * Centralizes common builder functions so tests stay focused on assertions.
 */
export const buildStyleContextFromEditor = (editor) => {
  const converter = editor.converter;
  if (!converter) {
    throw new Error('Editor does not have converter');
  }

  const stylesXml = converter.convertedXml?.['word/styles.xml'];
  const docDefaults = stylesXml?.elements?.find((el) => el.name === 'w:docDefaults');
  const styles = stylesXml?.elements?.find((el) => el.name === 'w:styles')?.elements || [];

  const stylesMap = {};
  for (const styleEl of styles) {
    if (styleEl.name === 'w:style') {
      const styleId = styleEl.attributes?.['w:styleId'];
      if (styleId) {
        stylesMap[styleId] = styleEl;
      }
    }
  }

  const docDefaultsPPr = docDefaults?.elements
    ?.find((el) => el.name === 'w:pPrDefault')
    ?.elements?.find((el) => el.name === 'w:pPr');
  const tabs = docDefaultsPPr?.elements?.find((el) => el.name === 'w:tabs');
  const defaultTabStop = tabs?.elements?.find((el) => el.name === 'w:defaultTabStop');
  const defaultTabIntervalTwips = defaultTabStop?.attributes?.['w:val']
    ? parseInt(defaultTabStop.attributes['w:val'], 10)
    : 720;

  return {
    styles: stylesMap,
    defaults: {
      defaultTabIntervalTwips,
      decimalSeparator: '.',
    },
  };
};

/**
 * Build ConverterContext from editor instance for paragraph hydration.
 */
export const buildConverterContextFromEditor = (editor) => {
  const converter = editor.converter;
  if (!converter) {
    throw new Error('Editor does not have converter');
  }

  return {
    docx: converter.convertedXml,
    numbering: converter.numbering,
    translatedNumbering: converter.translatedNumbering ?? {},
    translatedLinkedStyles: converter.translatedLinkedStyles ?? {
      docDefaults: { runProperties: {}, paragraphProperties: {} },
      latentStyles: {},
      styles: {
        Normal: {
          styleId: 'Normal',
          type: 'paragraph',
          default: true,
          name: 'Normal',
          runProperties: {},
          paragraphProperties: {},
        },
      },
    },
  };
};

/**
 * Build ListCounterContext for tracking list numbering state.
 */
export const createListCounterContext = () => {
  const counters = new Map();

  return {
    getListCounter: (numId, level) => {
      const key = `${numId}-${level}`;
      return counters.get(key) || 0;
    },
    incrementListCounter: (numId, level) => {
      const key = `${numId}-${level}`;
      const current = counters.get(key) || 0;
      const next = current + 1;
      counters.set(key, next);
      return next;
    },
    resetListCounter: (numId, level) => {
      const key = `${numId}-${level}`;
      counters.set(key, 0);
    },
  };
};
