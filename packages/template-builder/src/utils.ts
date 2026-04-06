import type { SuperDoc } from 'superdoc';
import type { TemplateField, SuperDocTemplateBuilderProps, ToolbarConfig } from './types';

export const areTemplateFieldsEqual = (a: TemplateField[], b: TemplateField[]): boolean => {
  if (a === b) return true;
  if (a.length !== b.length) return false;

  for (let index = 0; index < a.length; index += 1) {
    const left = a[index];
    const right = b[index];

    if (!right) return false;

    if (
      left.id !== right.id ||
      left.alias !== right.alias ||
      left.tag !== right.tag ||
      left.position !== right.position ||
      left.mode !== right.mode ||
      left.group !== right.group ||
      left.fieldType !== right.fieldType ||
      left.lockMode !== right.lockMode
    ) {
      return false;
    }
  }

  return true;
};

export const resolveToolbar = (toolbar: SuperDocTemplateBuilderProps['toolbar']) => {
  if (!toolbar) return null;

  if (toolbar === true) {
    return {
      selector: '#superdoc-toolbar',
      config: {} as Omit<ToolbarConfig, 'selector'>,
      renderDefaultContainer: true,
    };
  }

  if (typeof toolbar === 'string') {
    return {
      selector: toolbar,
      config: {} as Omit<ToolbarConfig, 'selector'>,
      renderDefaultContainer: false,
    };
  }

  const { selector, ...config } = toolbar;
  return {
    selector: selector || '#superdoc-toolbar',
    config,
    renderDefaultContainer: selector === undefined,
  };
};

export const getPresentationEditor = (superdoc: SuperDoc | null) => {
  const docs = (superdoc as any)?.superdocStore?.documents;
  if (!Array.isArray(docs) || docs.length === 0) return null;
  return docs[0].getPresentationEditor?.() ?? null;
};

const FIELD_TYPE_STYLES: Record<string, { background: string; color: string }> = {
  signer: { background: '#fef3c7', color: '#b45309' },
};

const DEFAULT_FIELD_TYPE_STYLE = { background: '#f3f4f6', color: '#6b7280' };

/**
 * Derive a light background + dark text from a single hex/css color.
 * Falls back to the hardcoded map when no fieldColors are provided.
 */
export const getFieldTypeStyle = (fieldType: string, fieldColors?: Record<string, string>) => {
  if (fieldColors?.[fieldType]) {
    return { background: fieldColors[fieldType] + '1a', color: fieldColors[fieldType] };
  }
  return FIELD_TYPE_STYLES[fieldType] ?? DEFAULT_FIELD_TYPE_STYLE;
};

const SDT_INLINE = '.superdoc-structured-content-inline';
const SDT_BLOCK = '.superdoc-structured-content-block';

/** Generate scoped CSS rules for field type colors. */
export function generateFieldColorCSS(fieldColors: Record<string, string>, scopeSelector: string): string {
  const rules: string[] = [];
  const entries = Object.entries(fieldColors);
  if (entries.length === 0) return '';

  // Default color (owner or first entry)
  const defaultColor = fieldColors.owner ?? entries[0][1];
  rules.push(`
${scopeSelector} ${SDT_INLINE},
${scopeSelector} ${SDT_BLOCK} {
  border-color: ${defaultColor};
}
${scopeSelector} ${SDT_INLINE}:hover,
${scopeSelector} ${SDT_BLOCK}:hover {
  border-color: ${defaultColor};
}
${scopeSelector} ${SDT_INLINE} ${SDT_INLINE}__label,
${scopeSelector} ${SDT_BLOCK} ${SDT_BLOCK}__label {
  border-color: ${defaultColor};
  background-color: color-mix(in srgb, ${defaultColor} 87%, transparent);
}`);

  // Per-type overrides
  for (const [type, color] of entries) {
    const tagSel = `[data-sdt-tag*='"fieldType":"${type}"']`;
    rules.push(`
${scopeSelector} ${SDT_INLINE}${tagSel},
${scopeSelector} ${SDT_BLOCK}${tagSel} {
  border-color: ${color};
}
${scopeSelector} ${SDT_INLINE}${tagSel}:hover,
${scopeSelector} ${SDT_BLOCK}${tagSel}:hover {
  border-color: ${color};
}
${scopeSelector} ${SDT_INLINE}${tagSel} ${SDT_INLINE}__label,
${scopeSelector} ${SDT_BLOCK}${tagSel} ${SDT_BLOCK}__label {
  border-color: ${color};
  background-color: color-mix(in srgb, ${color} 87%, transparent);
}`);
  }

  return rules.join('\n');
}

export const MENU_VIEWPORT_PADDING = 10;
export const MENU_APPROX_WIDTH = 250;
export const MENU_APPROX_HEIGHT = 300;

export const clampToViewport = (rect: DOMRect): DOMRect => {
  const maxLeft = window.innerWidth - MENU_APPROX_WIDTH - MENU_VIEWPORT_PADDING;
  const maxTop = window.innerHeight - MENU_APPROX_HEIGHT - MENU_VIEWPORT_PADDING;

  const clampedLeft = Math.min(rect.left, maxLeft);
  const clampedTop = Math.min(rect.top, maxTop);

  return new DOMRect(
    Math.max(clampedLeft, MENU_VIEWPORT_PADDING),
    Math.max(clampedTop, MENU_VIEWPORT_PADDING),
    rect.width,
    rect.height,
  );
};
