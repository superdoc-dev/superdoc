import { parseSizeUnit } from '../../editors/v1/core/utilities/parseSizeUnit.js';
import { isNegatedMark } from '../../editors/v1/components/toolbar/format-negation.js';
import { getActiveFormatting } from '../../editors/v1/core/helpers/getActiveFormatting.js';
import { getFileOpener, processAndInsertImageFile } from '../../editors/v1/extensions/image/imageHelpers/index.js';
import { TextSelection, Selection } from 'prosemirror-state';
import { getCurrentResolvedParagraphProperties, isFieldAnnotationSelection, resolveStateEditor } from './context.js';
import { createDirectCommandExecute, isCommandDisabled } from './general.js';
import type { ToolbarContext } from '../types.js';

export const normalizeFontSizeValue = (value: unknown) => {
  if (typeof value === 'number') {
    return `${value}pt`;
  }

  if (typeof value === 'string') {
    const [numericValue, unit] = parseSizeUnit(value);
    if (!Number.isNaN(numericValue)) {
      return `${numericValue}${unit || 'pt'}`;
    }
  }

  return value;
};

export const normalizeFontFamilyValue = (value: unknown) => {
  if (typeof value !== 'string') {
    return value;
  }

  return value;
};

export const normalizeLinkHrefValue = (value: unknown) => {
  return typeof value === 'string' && value.length > 0 ? value : null;
};

export const normalizeColorValue = (value: unknown) => {
  if (typeof value === 'string' && value.length > 0) {
    return value.toLowerCase();
  }
  return null;
};

export const isFormattingActivatedFromLinkedStyle = (
  context: ToolbarContext | null,
  styleKey: 'font-size' | 'font-family' | 'bold',
) => {
  const stateEditor = resolveStateEditor(context);
  const selection = stateEditor?.state?.selection;

  if (!selection?.$from) {
    return false;
  }

  const styleId = getCurrentResolvedParagraphProperties(context)?.styleId;
  const linkedStyle = stateEditor?.converter?.linkedStyles?.find((style: any) => style.id === styleId);
  const result = Boolean(linkedStyle?.definition?.styles && styleKey in linkedStyle.definition.styles);

  return result;
};

export const hasNegatedFormattingMark = (
  formatting: Array<{ name: string; attrs?: Record<string, unknown> }>,
  markName: string,
) => {
  const rawActiveMark = formatting.find((mark) => mark.name === markName);
  return rawActiveMark ? isNegatedMark(rawActiveMark.name, rawActiveMark.attrs) : false;
};

export const createBoldStateDeriver =
  () =>
  ({ context }: { context: ToolbarContext | null }) => {
    const stateEditor = resolveStateEditor(context);
    const formatting = stateEditor ? getActiveFormatting(stateEditor) : [];
    const isDisabled = isCommandDisabled(context);

    if (isDisabled) {
      return {
        active: false,
        disabled: true,
      };
    }

    const isActiveFromMark = formatting.some((mark) => mark.name === 'bold');
    const markNegated = hasNegatedFormattingMark(formatting, 'bold');
    const activeFromLinkedStyle =
      !isActiveFromMark && !markNegated ? isFormattingActivatedFromLinkedStyle(context, 'bold') : false;

    return {
      active: isActiveFromMark || activeFromLinkedStyle,
      disabled: false,
    };
  };

export const createItalicStateDeriver =
  () =>
  ({ context }: { context: ToolbarContext | null }) => {
    const stateEditor = resolveStateEditor(context);
    const formatting = stateEditor ? getActiveFormatting(stateEditor) : [];
    const isDisabled = isCommandDisabled(context);

    if (isDisabled) {
      return {
        active: false,
        disabled: true,
      };
    }

    const markNegated = hasNegatedFormattingMark(formatting, 'italic');

    return {
      active: !markNegated && formatting.some((mark) => mark.name === 'italic'),
      disabled: false,
    };
  };

export const createUnderlineStateDeriver =
  () =>
  ({ context }: { context: ToolbarContext | null }) => {
    const stateEditor = resolveStateEditor(context);
    const formatting = stateEditor ? getActiveFormatting(stateEditor) : [];
    const isDisabled = isCommandDisabled(context);

    if (isDisabled) {
      return {
        active: false,
        disabled: true,
      };
    }

    const markNegated = hasNegatedFormattingMark(formatting, 'underline');

    return {
      active: !markNegated && formatting.some((mark) => mark.name === 'underline'),
      disabled: false,
    };
  };

export const createStrikethroughStateDeriver =
  () =>
  ({ context }: { context: ToolbarContext | null }) => {
    const stateEditor = resolveStateEditor(context);
    const formatting = stateEditor ? getActiveFormatting(stateEditor) : [];
    const isDisabled = isCommandDisabled(context);

    if (isDisabled) {
      return {
        active: false,
        disabled: true,
      };
    }

    const markNegated = hasNegatedFormattingMark(formatting, 'strike');

    return {
      active: !markNegated && formatting.some((mark) => mark.name === 'strike'),
      disabled: false,
    };
  };

export const createFontSizeStateDeriver =
  () =>
  ({ context }: { context: ToolbarContext | null }) => {
    const stateEditor = resolveStateEditor(context);
    const formatting = stateEditor ? getActiveFormatting(stateEditor) : [];
    const isDisabled = isCommandDisabled(context);

    if (isDisabled) {
      return {
        active: false,
        disabled: true,
        value: null,
      };
    }

    const values = formatting
      .filter((mark) => mark.name === 'fontSize')
      .map((mark) => mark.attrs?.fontSize)
      .filter((value) => value != null);

    const normalizedValues = values.map((value) => normalizeFontSizeValue(value));
    const uniqueValues = [...new Set(normalizedValues)];
    const hasDirectValue = uniqueValues.length > 0;

    const canUseLinkedStyle = !hasDirectValue && isFormattingActivatedFromLinkedStyle(context, 'font-size');
    const paragraphProps = canUseLinkedStyle ? getCurrentResolvedParagraphProperties(context) : null;
    const documentEditor = context?.presentationEditor?.editor ?? context?.editor ?? null;

    const linkedStyle = canUseLinkedStyle
      ? documentEditor?.converter?.linkedStyles?.find((style: any) => style.id === paragraphProps?.styleId)
      : null;
    const linkedStyleValue = normalizeFontSizeValue(linkedStyle?.definition?.styles?.['font-size']) ?? null;
    const value = uniqueValues.length === 1 ? uniqueValues[0] : linkedStyleValue;

    return {
      active: hasDirectValue || linkedStyleValue != null,
      disabled: false,
      value,
    };
  };

export const createFontFamilyStateDeriver =
  () =>
  ({ context }: { context: ToolbarContext | null }) => {
    const stateEditor = resolveStateEditor(context);
    const formatting = stateEditor ? getActiveFormatting(stateEditor) : [];
    const isDisabled = isCommandDisabled(context);

    if (isDisabled) {
      return {
        active: false,
        disabled: true,
        value: null,
      };
    }

    const values = formatting
      .filter((mark) => mark.name === 'fontFamily')
      .map((mark) => mark.attrs?.fontFamily)
      .filter((value) => value != null);

    const normalizedValues = values.map((value) => normalizeFontFamilyValue(value));
    const uniqueValues = [...new Set(normalizedValues)];
    const hasDirectValue = uniqueValues.length > 0;

    // Note (parity gap): legacy also has an empty-paragraph special-case:
    // const paragraphFontFamily = getParagraphFontFamilyFromProperties
    // item.activate({ fontFamily: paragraphFontFamily });

    const canUseLinkedStyle = !hasDirectValue && isFormattingActivatedFromLinkedStyle(context, 'font-family');
    const paragraphProps = canUseLinkedStyle ? getCurrentResolvedParagraphProperties(context) : null;
    const documentEditor = context?.presentationEditor?.editor ?? context?.editor ?? null;

    const linkedStyle = canUseLinkedStyle
      ? documentEditor?.converter?.linkedStyles?.find((style: any) => style.id === paragraphProps?.styleId)
      : null;
    const linkedStyleValue = normalizeFontFamilyValue(linkedStyle?.definition?.styles?.['font-family']) ?? null;
    const value = uniqueValues.length === 1 ? uniqueValues[0] : linkedStyleValue;

    return {
      active: uniqueValues.length > 0 || linkedStyleValue != null,
      disabled: false,
      value,
    };
  };

export const createTextColorStateDeriver =
  () =>
  ({ context }: { context: ToolbarContext | null }) => {
    const stateEditor = resolveStateEditor(context);
    const formatting = stateEditor ? getActiveFormatting(stateEditor) : [];
    const isDisabled = isCommandDisabled(context);

    if (isDisabled) {
      return {
        active: false,
        disabled: true,
        value: null,
      };
    }

    const values = formatting
      .filter((mark) => mark.name === 'color')
      .map((mark) => mark.attrs?.color)
      .filter((value) => value != null);

    const markNegated = hasNegatedFormattingMark(formatting, 'color');
    const normalizedValues = values.map((value) => normalizeColorValue(value));
    const uniqueValues = [...new Set(normalizedValues)];
    const value = uniqueValues.length === 1 ? uniqueValues[0] : null;

    return {
      active: !markNegated && uniqueValues.length > 0,
      disabled: false,
      value,
    };
  };

export const createHighlightColorStateDeriver =
  () =>
  ({ context }: { context: ToolbarContext | null }) => {
    const stateEditor = resolveStateEditor(context);
    const formatting = stateEditor ? getActiveFormatting(stateEditor) : [];
    const isDisabled = isCommandDisabled(context);

    if (isDisabled) {
      return {
        active: false,
        disabled: true,
        value: null,
      };
    }

    const values = formatting
      .filter((mark) => mark.name === 'highlight')
      .map((mark) => mark.attrs?.color)
      .filter((value) => value != null);

    const markNegated = hasNegatedFormattingMark(formatting, 'highlight');
    const normalizedValues = values.map((value) => normalizeColorValue(value));
    const uniqueValues = [...new Set(normalizedValues)];
    const value = uniqueValues.length === 1 ? uniqueValues[0] : null;

    return {
      active: !markNegated && uniqueValues.length > 0,
      disabled: false,
      value,
    };
  };

export const createLinkStateDeriver =
  () =>
  ({ context }: { context: ToolbarContext | null }) => {
    const stateEditor = resolveStateEditor(context);
    const formatting = stateEditor ? getActiveFormatting(stateEditor) : [];
    const isDisabled = isCommandDisabled(context);

    if (isDisabled) {
      return {
        active: false,
        disabled: true,
        value: null,
      };
    }

    const values = formatting
      .filter((mark) => mark.name === 'link')
      .map((mark) => mark.attrs?.href)
      .filter((value) => value != null);

    const normalizedValues = values.map((value) => normalizeLinkHrefValue(value));
    const uniqueValues = [...new Set(normalizedValues)];
    const value = uniqueValues.length === 1 ? uniqueValues[0] : null;

    return {
      active: uniqueValues.length > 0,
      disabled: false,
      value,
    };
  };

export const createBoldExecute =
  () =>
  ({ context, payload }: { context: ToolbarContext | null; payload?: unknown }) => {
    const editor = resolveStateEditor(context);

    if (isFieldAnnotationSelection(context)) {
      editor?.commands?.toggleFieldAnnotationsFormat?.('bold', true);
      return true;
    }

    const result = createDirectCommandExecute('toggleBold')({ context, payload });
    if (!result) return false;

    editor?.commands?.toggleFieldAnnotationsFormat?.('bold', true);
    return true;
  };

export const createItalicExecute =
  () =>
  ({ context, payload }: { context: ToolbarContext | null; payload?: unknown }) => {
    const editor = resolveStateEditor(context);

    if (isFieldAnnotationSelection(context)) {
      editor?.commands?.toggleFieldAnnotationsFormat?.('italic', true);
      return true;
    }

    const result = createDirectCommandExecute('toggleItalic')({ context, payload });
    if (!result) return false;

    editor?.commands?.toggleFieldAnnotationsFormat?.('italic', true);
    return true;
  };

export const createUnderlineExecute =
  () =>
  ({ context, payload }: { context: ToolbarContext | null; payload?: unknown }) => {
    const editor = resolveStateEditor(context);

    if (isFieldAnnotationSelection(context)) {
      editor?.commands?.toggleFieldAnnotationsFormat?.('underline', true);
      return true;
    }

    const result = createDirectCommandExecute('toggleUnderline')({ context, payload });
    if (!result) return false;

    editor?.commands?.toggleFieldAnnotationsFormat?.('underline', true);
    return true;
  };

export const createFontSizeExecute =
  () =>
  ({ context, payload }: { context: ToolbarContext | null; payload?: unknown }) => {
    if (payload === undefined) return false;

    const editor = resolveStateEditor(context);

    // Note (parity gap): legacy toolbar ensures textStyle storedMarks for off-focus /
    // collapsed-selection font-size changes before invoking setFontSize.
    // ensureStoredMarksForMarkToggle

    if (isFieldAnnotationSelection(context)) {
      editor?.commands?.setFieldAnnotationsFontSize?.(payload, true);
      return true;
    }

    const result = createDirectCommandExecute('setFontSize')({ context, payload });
    if (!result) return false;

    editor?.commands?.setFieldAnnotationsFontSize?.(payload, true);
    return true;
  };

export const createFontFamilyExecute =
  () =>
  ({ context, payload }: { context: ToolbarContext | null; payload?: unknown }) => {
    if (payload === undefined) return false;

    const editor = resolveStateEditor(context);

    if (isFieldAnnotationSelection(context)) {
      editor?.commands?.setFieldAnnotationsFontFamily?.(payload, true);
      return true;
    }

    const result = createDirectCommandExecute('setFontFamily')({ context, payload });
    if (!result) return false;

    editor?.commands?.setFieldAnnotationsFontFamily?.(payload, true);
    return true;
  };

export const createTextColorExecute =
  () =>
  ({ context, payload }: { context: ToolbarContext | null; payload?: unknown }) => {
    const editor = resolveStateEditor(context);

    if (typeof payload !== 'string' || payload.length === 0) {
      return false;
    }

    const isNone = payload === 'none';
    const inlineValue = isNone ? 'inherit' : payload;

    const result = createDirectCommandExecute('setColor')({ context, payload: inlineValue });
    editor?.commands?.setFieldAnnotationsTextColor?.(isNone ? null : payload, true);
    return result;
  };

export const createHighlightColorExecute =
  () =>
  ({ context, payload }: { context: ToolbarContext | null; payload?: unknown }) => {
    const editor = resolveStateEditor(context);

    if (typeof payload !== 'string' || payload.length === 0) {
      return false;
    }

    const isNone = payload === 'none';
    const inlineValue = isNone ? 'transparent' : payload;

    const result = createDirectCommandExecute('setHighlight')({ context, payload: inlineValue });
    const argValue = isNone ? null : payload;
    editor?.commands?.setFieldAnnotationsTextHighlight?.(argValue, true);
    editor?.commands?.setCellBackground?.(argValue);
    return result;
  };

const applyLinkPostExecute = (editor: NonNullable<ReturnType<typeof resolveStateEditor>>) => {
  const { view } = editor;
  let selection = view.state.selection;

  if (editor.options?.isHeaderOrFooter && editor.options?.lastSelection) {
    selection = editor.options.lastSelection as Selection;
  }

  const endPos = selection?.$to?.pos;
  if (typeof endPos !== 'number') {
    return;
  }

  try {
    const newSelection = new TextSelection(view.state.doc.resolve(endPos));
    const tr = view.state.tr.setSelection(newSelection);
    const state = view.state.apply(tr);
    view.updateState(state);

    if (!editor.options?.isHeaderOrFooter) {
      setTimeout(() => {
        view.focus();
      }, 100);
    }
  } catch {
    return;
  }
};

export const createLinkExecute =
  () =>
  ({ context, payload }: { context: ToolbarContext | null; payload?: unknown }) => {
    const editor = resolveStateEditor(context);
    const result = createDirectCommandExecute('toggleLink')({ context, payload });
    if (!result || !editor?.view) return result;
    applyLinkPostExecute(editor);
    return true;
  };

export const createImageExecute =
  () =>
  ({ context }: { context: ToolbarContext | null; payload?: unknown }) => {
    const editor = resolveStateEditor(context);
    if (!editor?.view) return false;

    const open = getFileOpener();
    open()
      .then(async (result: any) => {
        if (!result?.file) return;
        await processAndInsertImageFile({
          file: result.file,
          editor,
          view: editor.view,
          editorOptions: editor.options,
          getMaxContentSize: () => editor.getMaxContentSize(),
        });
      })
      .catch((err: unknown) => {
        console.error('[headless-toolbar] Image insertion failed:', err);
      });

    return true;
  };
