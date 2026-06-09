import type { ImageRun, ParagraphAttrs, ParagraphBlock, TextRun, TrackedChangeMeta } from '@superdoc/contracts';
import { getParagraphInlineDirection } from '@superdoc/contracts';
import { getFontConfigVersion } from '@superdoc/font-system';
import { hashParagraphBorders } from '../paragraph-hash-utils.js';
import {
  getRunBooleanProp,
  getRunNumberProp,
  getRunStringProp,
  getRunUnderlineColor,
  getRunUnderlineStyle,
} from '../runs/hash.js';

type ParagraphHashFns = {
  hashString: (seed: number, value: string) => number;
  hashNumber: (seed: number, value: number | undefined | null) => number;
};

const hasListMarkerProperties = (
  attrs: unknown,
): attrs is {
  numberingProperties: { numId?: number | string; ilvl?: number };
  wordLayout?: { marker?: { markerText?: string } };
} => {
  if (!attrs || typeof attrs !== 'object') return false;
  const obj = attrs as Record<string, unknown>;

  if (!obj.numberingProperties || typeof obj.numberingProperties !== 'object') return false;
  const numProps = obj.numberingProperties as Record<string, unknown>;

  if ('numId' in numProps) {
    const numId = numProps.numId;
    if (typeof numId !== 'number' && typeof numId !== 'string') return false;
  }

  if ('ilvl' in numProps) {
    const ilvl = numProps.ilvl;
    if (typeof ilvl !== 'number') return false;
  }

  if ('wordLayout' in obj && obj.wordLayout !== undefined) {
    if (typeof obj.wordLayout !== 'object' || obj.wordLayout === null) return false;
    const wordLayout = obj.wordLayout as Record<string, unknown>;

    if ('marker' in wordLayout && wordLayout.marker !== undefined) {
      if (typeof wordLayout.marker !== 'object' || wordLayout.marker === null) return false;
      const marker = wordLayout.marker as Record<string, unknown>;

      if ('markerText' in marker && marker.markerText !== undefined) {
        if (typeof marker.markerText !== 'string') return false;
      }
    }
  }

  return true;
};

const getTrackedChangeLayers = (run: TextRun): TrackedChangeMeta[] => {
  if (Array.isArray(run.trackedChanges) && run.trackedChanges.length > 0) {
    return run.trackedChanges;
  }
  return run.trackedChange ? [run.trackedChange] : [];
};

const trackedChangeVersion = (run: TextRun): string =>
  getTrackedChangeLayers(run)
    .map((trackedChange) =>
      [
        trackedChange.kind ?? '',
        trackedChange.id ?? '',
        trackedChange.storyKey ?? '',
        trackedChange.overlapParentId ?? '',
        trackedChange.relationship ?? '',
        trackedChange.author ?? '',
        trackedChange.authorEmail ?? '',
        trackedChange.authorImage ?? '',
        trackedChange.date ?? '',
        trackedChange.before ? JSON.stringify(trackedChange.before) : '',
        trackedChange.after ? JSON.stringify(trackedChange.after) : '',
      ].join(':'),
    )
    .join('|');

export const deriveParagraphBlockVersion = (
  block: ParagraphBlock,
  getSdtMetadataVersion: (metadata: ParagraphAttrs['sdt']) => string,
  readClipPathValue: (value: unknown) => string,
): string => {
  const markerVersion = hasListMarkerProperties(block.attrs)
    ? `marker:${block.attrs.numberingProperties.numId ?? ''}:${block.attrs.numberingProperties.ilvl ?? 0}:${block.attrs.wordLayout?.marker?.markerText ?? ''}`
    : '';

  const runsVersion = block.runs
    .map((run) => {
      // Paragraph-level cache keys intentionally exclude run pmStart/pmEnd; position-only edits update datasets in place.
      if (run.kind === 'image') {
        const imgRun = run as ImageRun;
        return [
          'img',
          imgRun.src,
          imgRun.width,
          imgRun.height,
          imgRun.alt ?? '',
          imgRun.title ?? '',
          imgRun.clipPath ?? '',
          imgRun.distTop ?? '',
          imgRun.distBottom ?? '',
          imgRun.distLeft ?? '',
          imgRun.distRight ?? '',
          readClipPathValue((imgRun as { clipPath?: unknown }).clipPath),
        ].join(',');
      }

      if (run.kind === 'lineBreak') {
        return 'linebreak';
      }

      if (run.kind === 'tab') {
        return [run.text ?? '', 'tab'].join(',');
      }

      if (run.kind === 'fieldAnnotation') {
        const size = run.size ? `${run.size.width ?? ''}x${run.size.height ?? ''}` : '';
        const highlighted = run.highlighted !== false ? 1 : 0;
        return [
          'field',
          run.variant ?? '',
          run.displayLabel ?? '',
          run.fieldColor ?? '',
          run.borderColor ?? '',
          highlighted,
          run.hidden ? 1 : 0,
          run.visibility ?? '',
          run.imageSrc ?? '',
          run.linkUrl ?? '',
          run.rawHtml ?? '',
          size,
          run.fontFamily ?? '',
          run.fontSize ?? '',
          run.textColor ?? '',
          run.textHighlight ?? '',
          run.bold ? 1 : 0,
          run.italic ? 1 : 0,
          run.underline ? 1 : 0,
          run.fieldId ?? '',
          run.fieldType ?? '',
        ].join(',');
      }

      const textRun = run as TextRun;
      const trackedVersion = trackedChangeVersion(textRun);
      return [
        textRun.text ?? '',
        textRun.fontFamily,
        // Font epoch: busts block paint reuse when a font loads/changes (logical family
        // alone cannot see a substitute becoming available after first paint).
        getFontConfigVersion(),
        textRun.fontSize,
        textRun.bold ? 1 : 0,
        textRun.italic ? 1 : 0,
        textRun.color ?? '',
        textRun.underline?.style ?? '',
        textRun.underline?.color ?? '',
        textRun.strike ? 1 : 0,
        textRun.highlight ?? '',
        textRun.letterSpacing != null ? textRun.letterSpacing : '',
        textRun.vertAlign ?? '',
        textRun.baselineShift != null ? textRun.baselineShift : '',
        textRun.token ?? '',
        textRun.pageNumberFieldFormat ? JSON.stringify(textRun.pageNumberFieldFormat) : '',
        trackedVersion,
        textRun.comments?.length ?? 0,
      ].join(',');
    })
    .join('|');

  const attrs = block.attrs as ParagraphAttrs | undefined;
  const paragraphAttrsVersion = attrs
    ? [
        attrs.alignment ?? '',
        attrs.spacing?.before ?? '',
        attrs.spacing?.after ?? '',
        attrs.spacing?.line ?? '',
        attrs.spacing?.lineRule ?? '',
        attrs.indent?.left ?? '',
        attrs.indent?.right ?? '',
        attrs.indent?.firstLine ?? '',
        attrs.indent?.hanging ?? '',
        attrs.borders ? hashParagraphBorders(attrs.borders) : '',
        attrs.shading?.fill ?? '',
        attrs.shading?.color ?? '',
        getParagraphInlineDirection(attrs) ?? '',
        attrs.tabs?.length ? JSON.stringify(attrs.tabs) : '',
      ].join(':')
    : '';

  const sdtVersion = getSdtMetadataVersion(attrs?.sdt);
  const parts = [markerVersion, runsVersion, paragraphAttrsVersion, sdtVersion].filter(Boolean);
  return parts.join('|');
};

export const hashParagraphBlockForTableVersion = (
  seed: number,
  paragraphBlock: ParagraphBlock,
  hashFns: ParagraphHashFns,
): number => {
  const { hashNumber, hashString } = hashFns;
  const runs = paragraphBlock.runs ?? [];
  let hash = hashNumber(seed, runs.length);
  const attrs = paragraphBlock.attrs as ParagraphAttrs | undefined;

  if (attrs) {
    hash = hashString(hash, attrs.alignment ?? '');
    hash = hashNumber(hash, attrs.spacing?.before ?? 0);
    hash = hashNumber(hash, attrs.spacing?.after ?? 0);
    hash = hashNumber(hash, attrs.spacing?.line ?? 0);
    hash = hashString(hash, attrs.spacing?.lineRule ?? '');
    hash = hashNumber(hash, attrs.indent?.left ?? 0);
    hash = hashNumber(hash, attrs.indent?.right ?? 0);
    hash = hashNumber(hash, attrs.indent?.firstLine ?? 0);
    hash = hashNumber(hash, attrs.indent?.hanging ?? 0);
    hash = hashString(hash, attrs.shading?.fill ?? '');
    hash = hashString(hash, attrs.shading?.color ?? '');
    hash = hashString(hash, getParagraphInlineDirection(attrs) ?? '');
    if (attrs.borders) {
      hash = hashString(hash, hashParagraphBorders(attrs.borders));
    }
  }

  for (const run of runs) {
    if ('text' in run && typeof run.text === 'string') {
      hash = hashString(hash, run.text);
    }
    hash = hashNumber(hash, run.pmStart ?? -1);
    hash = hashNumber(hash, run.pmEnd ?? -1);
    hash = hashString(hash, getRunStringProp(run, 'color'));
    hash = hashString(hash, getRunStringProp(run, 'highlight'));
    hash = hashString(hash, getRunBooleanProp(run, 'bold') ? '1' : '');
    hash = hashString(hash, getRunBooleanProp(run, 'italic') ? '1' : '');
    hash = hashNumber(hash, getRunNumberProp(run, 'fontSize'));
    hash = hashString(hash, getRunStringProp(run, 'fontFamily'));
    hash = hashString(hash, getRunUnderlineStyle(run));
    hash = hashString(hash, getRunUnderlineColor(run));
    hash = hashString(hash, getRunBooleanProp(run, 'strike') ? '1' : '');
    hash = hashString(hash, getRunStringProp(run, 'vertAlign'));
    hash = hashNumber(hash, getRunNumberProp(run, 'baselineShift'));
    hash = hashString(hash, trackedChangeVersion(run as TextRun));
  }

  return hash;
};
