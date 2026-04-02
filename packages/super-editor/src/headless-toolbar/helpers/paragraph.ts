import { isList } from '../../editors/v1/core/commands/list-helpers/is-list.js';
import { twipsToLines } from '../../editors/v1/core/super-converter/helpers.js';
import { getQuickFormatList } from '../../editors/v1/extensions/linked-styles/index.js';
import { getCurrentParagraphParent, getCurrentResolvedParagraphProperties, resolveStateEditor } from './context.js';
import { createDirectCommandExecute, isCommandDisabled } from './general.js';
import type { ToolbarCommandState, ToolbarContext } from '../types.js';

const getCurrentParagraphJustification = (context: ToolbarContext | null) => {
  const justification = getCurrentResolvedParagraphProperties(context)?.justification ?? null;

  if (justification === 'both') {
    return 'justify';
  }

  return justification;
};

export const createTextAlignStateDeriver =
  () =>
  ({ context }: { context: ToolbarContext | null }): ToolbarCommandState => {
    const isDisabled = isCommandDisabled(context);

    if (isDisabled) {
      return {
        active: false,
        disabled: true,
        value: null,
      };
    }

    const value = getCurrentParagraphJustification(context) ?? null;

    return {
      active: value != null,
      disabled: false,
      value,
    };
  };

export const createLineHeightStateDeriver =
  () =>
  ({ context }: { context: ToolbarContext | null }): ToolbarCommandState => {
    const isDisabled = isCommandDisabled(context);

    if (isDisabled) {
      return {
        active: false,
        disabled: true,
        value: null,
      };
    }

    const paragraphProperties = getCurrentResolvedParagraphProperties(context);
    const line = paragraphProperties?.spacing?.line;
    const value = line != null ? twipsToLines(line) : null;

    return {
      active: value != null,
      disabled: false,
      value,
    };
  };

export const createLinkedStyleStateDeriver =
  () =>
  ({ context }: { context: ToolbarContext | null }): ToolbarCommandState => {
    const isDisabled = isCommandDisabled(context);
    const stateEditor = resolveStateEditor(context);

    if (isDisabled || !stateEditor) {
      return {
        active: false,
        disabled: true,
        value: null,
      };
    }

    const quickFormats = getQuickFormatList(stateEditor);
    if (!quickFormats.length) {
      return {
        active: false,
        disabled: true,
        value: null,
      };
    }

    const paragraphProperties = getCurrentResolvedParagraphProperties(context);
    const value = paragraphProperties?.styleId ?? null;

    return {
      active: value != null,
      disabled: false,
      value,
    };
  };

export const createListStateDeriver =
  (numberingType: 'bullet' | 'ordered') =>
  ({ context }: { context: ToolbarContext | null }): ToolbarCommandState => {
    const isDisabled = isCommandDisabled(context);

    if (isDisabled) {
      return {
        active: false,
        disabled: true,
      };
    }

    const paragraphParent = getCurrentParagraphParent(context);
    const paragraphNode = paragraphParent?.node ?? null;
    const paragraphProperties = getCurrentResolvedParagraphProperties(context);
    const isCurrentList =
      isList(paragraphNode) || Boolean(paragraphProperties?.numberingProperties && paragraphNode?.attrs?.listRendering);
    const activeNumberingType = isCurrentList ? paragraphNode?.attrs?.listRendering?.numberingType : null;
    const isActive =
      numberingType === 'bullet'
        ? activeNumberingType === 'bullet'
        : activeNumberingType != null && activeNumberingType !== 'bullet';

    return {
      active: isActive,
      disabled: false,
    };
  };

export const createIndentIncreaseExecute =
  () =>
  ({ context }: { context: ToolbarContext | null; payload?: unknown }) => {
    const editor = resolveStateEditor(context);

    if (editor?.commands?.increaseListIndent?.()) {
      return true;
    }

    return createDirectCommandExecute('increaseTextIndent')({ context });
  };

export const createIndentDecreaseExecute =
  () =>
  ({ context }: { context: ToolbarContext | null; payload?: unknown }) => {
    const editor = resolveStateEditor(context);

    if (editor?.commands?.decreaseListIndent?.()) {
      return true;
    }

    return createDirectCommandExecute('decreaseTextIndent')({ context });
  };
