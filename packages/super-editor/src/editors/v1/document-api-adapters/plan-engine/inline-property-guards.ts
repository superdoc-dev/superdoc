import type { InlineRunPatchKey } from '@superdoc/document-api';
import { INLINE_PROPERTY_BY_KEY } from '@superdoc/document-api';
import type { Editor } from '../../core/Editor.js';

export interface InlinePropertyGuardIssue {
  code: 'CAPABILITY_UNAVAILABLE';
  message: string;
  details?: Record<string, unknown>;
}

function getSchemaMarks(editor: Editor): Record<string, unknown> {
  return (editor.schema?.marks ?? editor.state.schema?.marks ?? {}) as Record<string, unknown>;
}

function getSchemaNodes(editor: Editor): Record<string, unknown> {
  return (editor.state.schema?.nodes ?? editor.schema?.nodes ?? {}) as Record<string, unknown>;
}

function getMarkAttrs(markType: unknown): Record<string, unknown> | undefined {
  if (!markType || typeof markType !== 'object') return undefined;

  const specAttrs = (markType as { spec?: { attrs?: Record<string, unknown> } }).spec?.attrs;
  if (specAttrs && typeof specAttrs === 'object') return specAttrs;

  const attrs = (markType as { attrs?: Record<string, unknown> }).attrs;
  if (attrs && typeof attrs === 'object') return attrs;

  return undefined;
}

export function getInlinePropertyCapabilityIssue(
  editor: Editor,
  keys: readonly InlineRunPatchKey[],
  operationName = 'format.apply',
): InlinePropertyGuardIssue | undefined {
  const schemaMarks = getSchemaMarks(editor);
  const requiredTextStyleAttrs = new Set<string>();
  let requiresRunNode = false;

  for (const key of keys) {
    const entry = INLINE_PROPERTY_BY_KEY[key];
    if (!entry) continue;

    if (entry.storage === 'mark') {
      const carrier = entry.carrier;
      if (carrier.storage !== 'mark') continue;

      if (!schemaMarks[carrier.markName]) {
        return {
          code: 'CAPABILITY_UNAVAILABLE',
          message: `${operationName} requires the "${carrier.markName}" mark.`,
          details: { reason: 'missing_mark', markName: carrier.markName },
        };
      }

      if (carrier.markName === 'textStyle' && carrier.textStyleAttr) {
        requiredTextStyleAttrs.add(carrier.textStyleAttr);
      }

      continue;
    }

    requiresRunNode = true;
  }

  if (requiredTextStyleAttrs.size > 0) {
    const markAttrs = getMarkAttrs(schemaMarks.textStyle);
    for (const attr of requiredTextStyleAttrs) {
      if (!markAttrs || !Object.prototype.hasOwnProperty.call(markAttrs, attr)) {
        return {
          code: 'CAPABILITY_UNAVAILABLE',
          message: `${operationName} requires the "${attr}" attribute on the textStyle mark.`,
          details: { reason: 'missing_mark_attribute', markName: 'textStyle', attribute: attr },
        };
      }
    }
  }

  if (requiresRunNode && !getSchemaNodes(editor).run) {
    return {
      code: 'CAPABILITY_UNAVAILABLE',
      message: `${operationName} requires a run node in the schema.`,
    };
  }

  return undefined;
}

export function getTrackedInlinePropertySupportIssue(
  keys: readonly InlineRunPatchKey[],
  operationName = 'format.apply',
): InlinePropertyGuardIssue | undefined {
  const unsupportedTrackedKeys = keys.filter((key) => INLINE_PROPERTY_BY_KEY[key]?.tracked === false);
  if (unsupportedTrackedKeys.length === 0) return undefined;

  return {
    code: 'CAPABILITY_UNAVAILABLE',
    message: `${operationName} tracked mode is not available for: ${unsupportedTrackedKeys.join(', ')}`,
    details: { keys: unsupportedTrackedKeys, changeMode: 'tracked' },
  };
}
