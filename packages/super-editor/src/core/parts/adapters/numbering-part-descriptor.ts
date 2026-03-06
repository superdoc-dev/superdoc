/**
 * Part descriptor for `word/numbering.xml`.
 *
 * Phase 3 migration: routes numbering mutations through the centralized parts system.
 *
 * `converter.numbering` and `converter.translatedNumbering` are derived caches.
 * The canonical data is the OOXML JSON in the parts store. After each commit,
 * `afterCommit` rebuilds the translated cache from `converter.numbering` (which
 * shares element references with the canonical XML tree).
 */

import type { Editor } from '../../Editor.js';
import type { PartDescriptor } from '../types.js';
import { translator as wAbstractNumTranslator } from '../../super-converter/v3/handlers/w/abstractNum/index.js';
import { translator as wNumTranslator } from '../../super-converter/v3/handlers/w/num/index.js';

const NUMBERING_PART_ID = 'word/numbering.xml' as const;

const NUMBERING_XMLNS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

// ---------------------------------------------------------------------------
// Converter shape (minimal interface to avoid importing SuperConverter)
// ---------------------------------------------------------------------------

interface NumberingIndex {
  abstracts: Record<number, unknown>;
  definitions: Record<number, unknown>;
}

interface TranslatedNumbering {
  abstracts?: Record<number, unknown>;
  definitions?: Record<number, unknown>;
}

interface ConverterForNumbering {
  numbering: NumberingIndex;
  translatedNumbering: TranslatedNumbering;
}

function getConverter(editor: Editor): ConverterForNumbering | undefined {
  return (editor as unknown as { converter?: ConverterForNumbering }).converter;
}

// ---------------------------------------------------------------------------
// XML tree sync
// ---------------------------------------------------------------------------

/**
 * Rebuild the `<w:numbering>` element's children from `converter.numbering`.
 *
 * This ensures the canonical XML tree reflects all runtime changes made via
 * `converter.numbering` (including new abstracts/definitions created by PM commands).
 *
 * Call this inside `mutatePart` callbacks after helper functions modify `converter.numbering`.
 */
export function syncNumberingToXmlTree(part: unknown, numbering: NumberingIndex): void {
  const root = part as { elements?: Array<{ elements?: unknown[] }> };
  const numberingEl = root?.elements?.[0];
  if (!numberingEl) return;

  const abstracts = Object.values(numbering.abstracts);
  const definitions = Object.values(numbering.definitions);

  numberingEl.elements = [...abstracts, ...definitions];
}

// ---------------------------------------------------------------------------
// Translated cache rebuild
// ---------------------------------------------------------------------------

function rebuildTranslatedNumbering(numbering: NumberingIndex): TranslatedNumbering {
  const translated: TranslatedNumbering = { abstracts: {}, definitions: {} };

  for (const [id, abstract] of Object.entries(numbering.abstracts)) {
    // @ts-expect-error — translator.encode expects full context, only nodes needed here
    translated.abstracts![Number(id)] = wAbstractNumTranslator.encode({ nodes: [abstract] });
  }

  for (const [id, definition] of Object.entries(numbering.definitions)) {
    // @ts-expect-error — translator.encode expects full context, only nodes needed here
    translated.definitions![Number(id)] = wNumTranslator.encode({ nodes: [definition] });
  }

  return translated;
}

// ---------------------------------------------------------------------------
// Descriptor
// ---------------------------------------------------------------------------

export const numberingPartDescriptor: PartDescriptor = {
  id: NUMBERING_PART_ID,

  ensurePart() {
    return {
      declaration: {
        attributes: { version: '1.0', encoding: 'UTF-8', standalone: 'yes' },
      },
      elements: [
        {
          type: 'element',
          name: 'w:numbering',
          attributes: { 'xmlns:w': NUMBERING_XMLNS },
          elements: [],
        },
      ],
    };
  },

  normalizePart(part: unknown) {
    const root = part as {
      elements?: Array<{ elements?: Array<{ name: string; attributes?: Record<string, string> }> }>;
    };
    const numberingEl = root?.elements?.[0];
    if (!numberingEl?.elements) return;

    const abstracts: Array<{ name: string; attributes?: Record<string, string> }> = [];
    const definitions: Array<{ name: string; attributes?: Record<string, string> }> = [];
    const other: Array<{ name: string; attributes?: Record<string, string> }> = [];

    for (const el of numberingEl.elements) {
      if (el.name === 'w:abstractNum') abstracts.push(el);
      else if (el.name === 'w:num') definitions.push(el);
      else other.push(el);
    }

    abstracts.sort((a, b) => {
      const aId = Number(a.attributes?.['w:abstractNumId'] ?? 0);
      const bId = Number(b.attributes?.['w:abstractNumId'] ?? 0);
      return aId - bId;
    });

    definitions.sort((a, b) => {
      const aId = Number(a.attributes?.['w:numId'] ?? 0);
      const bId = Number(b.attributes?.['w:numId'] ?? 0);
      return aId - bId;
    });

    numberingEl.elements = [...other, ...abstracts, ...definitions];
  },

  afterCommit({ editor }) {
    const converter = getConverter(editor);
    if (!converter) return;

    // Rebuild translatedNumbering from converter.numbering.
    // converter.numbering shares element references with the canonical XML tree,
    // so it already reflects the committed changes.
    converter.translatedNumbering = rebuildTranslatedNumbering(converter.numbering);
  },
};
