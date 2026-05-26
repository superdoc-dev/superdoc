import { createNumberingManager } from '@superdoc/word-layout';
import type { NumberingProperties, ParagraphProperties } from '@superdoc/style-engine/ooxml';
import type { ConverterContext } from './converter-context.js';
import type { ListRenderingContext, PMNode, ResolvedListRendering } from './types.js';
import { generateOrderedListIndex, normalizeLvlTextChar } from './list-helpers.js';

type NumberingDefinitionDetails = {
  start?: number;
  restart?: number;
  lvlText?: string;
  suffix?: string;
  justification?: string;
  listNumberingType?: string;
  customFormat?: string;
  abstractId?: string | number;
};

type LevelWithRestart = NonNullable<NonNullable<NumberingProperties['abstracts']>[string]['levels']>[string] & {
  lvlRestart?: number;
};

function getNumberingPropertiesFromNode(
  node: PMNode,
  resolvedParagraphProperties: ParagraphProperties,
): ParagraphProperties['numberingProperties'] | null {
  const attrs = node.attrs ?? {};
  return (
    resolvedParagraphProperties.numberingProperties ??
    (attrs.paragraphProperties as ParagraphProperties | undefined)?.numberingProperties ??
    (attrs.numberingProperties as ParagraphProperties['numberingProperties'] | undefined) ??
    null
  );
}

function getLevelDefinition(
  numbering: NumberingProperties,
  numId: string | number,
  level: number,
): NumberingDefinitionDetails | null {
  const definition = numbering.definitions?.[String(numId)];
  if (!definition) return null;

  const abstractId = definition.abstractNumId;
  const abstract = abstractId != null ? numbering.abstracts?.[String(abstractId)] : undefined;
  const levelDefinition = abstract?.levels?.[String(level)];
  if (!levelDefinition) return null;

  const override = definition.lvlOverrides?.[String(level)];
  const overrideLevel = override?.lvl as LevelWithRestart | undefined;
  const baseLevel = levelDefinition as LevelWithRestart;
  const start = override?.startOverride ?? override?.lvl?.start ?? levelDefinition.start ?? 1;
  const levelFormat = override?.lvl?.numFmt ?? levelDefinition.numFmt;

  return {
    start,
    restart: overrideLevel?.lvlRestart ?? baseLevel.lvlRestart,
    lvlText: overrideLevel?.lvlText ?? baseLevel.lvlText,
    suffix: overrideLevel?.suff ?? baseLevel.suff,
    justification: overrideLevel?.lvlJc ?? baseLevel.lvlJc,
    listNumberingType: levelFormat?.val,
    customFormat: levelFormat?.val === 'custom' ? levelFormat.format : undefined,
    abstractId,
  };
}

function seedStartSettings(
  numberingManager: ReturnType<typeof createNumberingManager>,
  numbering: NumberingProperties,
) {
  Object.entries(numbering.definitions ?? {}).forEach(([numId, definition]) => {
    const abstractId = definition?.abstractNumId;
    const abstract = abstractId != null ? numbering.abstracts?.[String(abstractId)] : undefined;
    Object.values(abstract?.levels ?? {}).forEach((levelDefinition) => {
      const baseLevel = levelDefinition as LevelWithRestart;
      const level = baseLevel.ilvl ?? 0;
      const override = definition.lvlOverrides?.[String(level)];
      const overrideLevel = override?.lvl as LevelWithRestart | undefined;
      const start = override?.startOverride ?? overrideLevel?.start ?? baseLevel.start ?? 1;
      numberingManager.setStartSettings(numId, level, start, baseLevel.lvlRestart, override?.startOverride != null);
    });
  });
}

export function createListRenderingContext(converterContext: ConverterContext): ListRenderingContext | undefined {
  const numbering = converterContext.translatedNumbering;
  if (!numbering?.definitions || !numbering.abstracts) {
    return undefined;
  }

  const numberingManager = createNumberingManager();
  seedStartSettings(numberingManager, numbering);
  numberingManager.enableCache();

  const cached = new WeakMap<PMNode, ResolvedListRendering | null>();

  return {
    resolveListRendering(node, resolvedParagraphProperties, pos) {
      if (cached.has(node)) {
        return cached.get(node) ?? null;
      }

      if (node.type !== 'paragraph') {
        cached.set(node, null);
        return null;
      }

      const numberingProperties = getNumberingPropertiesFromNode(node, resolvedParagraphProperties);
      if (!numberingProperties || numberingProperties.numId == null) {
        cached.set(node, null);
        return null;
      }

      const numId = numberingProperties.numId;
      const level = numberingProperties.ilvl ?? 0;
      const details = getLevelDefinition(numbering, numId, level);
      if (!details) {
        cached.set(node, null);
        return null;
      }

      const numberingType = details.listNumberingType || 'decimal';
      const count = numberingManager.calculateCounter(numId, level, pos, details.abstractId);
      numberingManager.setCounter(numId, level, pos, count, details.abstractId);
      const path = numberingManager.calculatePath(numId, level, pos);
      const markerText =
        numberingType !== 'bullet'
          ? (generateOrderedListIndex({
              listLevel: path,
              lvlText: details.lvlText,
              listNumberingType: numberingType,
              customFormat: details.customFormat,
            }) ?? '')
          : (normalizeLvlTextChar(details.lvlText) ?? '');

      const listRendering: ResolvedListRendering = {
        markerText,
        suffix: details.suffix,
        justification: details.justification,
        path,
        numberingType,
        ...(details.customFormat ? { customFormat: details.customFormat } : {}),
      };
      cached.set(node, listRendering);
      return listRendering;
    },
  };
}
