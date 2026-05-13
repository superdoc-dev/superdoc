import { isList } from '../../editors/v1/core/commands/list-helpers/is-list.js';
import { numberingInfoToOrderedStyle } from '../../editors/v1/core/helpers/list-numbering-helpers.js';
import type { OrderedListStyle } from '../../editors/v1/extensions/types/paragraph-commands.js';
import { twipsToLines } from '../../editors/v1/core/super-converter/helpers.js';
import { getQuickFormatList } from '../../editors/v1/extensions/linked-styles/index.js';
import { mapStoredJustificationToDisplayAlignment } from '../../editors/v1/core/helpers/paragraph-alignment.js';
import { getCurrentParagraphParent, getCurrentResolvedParagraphProperties, resolveStateEditor } from './context.js';
import { createDirectCommandExecute, isCommandDisabled } from './general.js';
import type { ToolbarCommandState, ToolbarContext } from '../types.js';

const getCurrentParagraphJustification = (context: ToolbarContext | null) => {
  const paragraphProperties = getCurrentResolvedParagraphProperties(context);
  const justification = paragraphProperties?.justification ?? null;
  const isRtl = paragraphProperties?.rightToLeft === true;
  return mapStoredJustificationToDisplayAlignment(justification, isRtl);
};

export const createParagraphDirectionStateDeriver =
  (direction: 'ltr' | 'rtl') =>
  ({ context }: { context: ToolbarContext | null }): ToolbarCommandState => {
    const isDisabled = isCommandDisabled(context);
    if (isDisabled) return { active: false, disabled: true, value: null };

    const rightToLeft = getCurrentResolvedParagraphProperties(context)?.rightToLeft;
    const current: 'ltr' | 'rtl' = rightToLeft ? 'rtl' : 'ltr';

    return {
      active: current === direction,
      disabled: false,
      value: current,
    };
  };

// AIDEV-NOTE: The direction-ltr / direction-rtl registry entries must encode the
// direction here rather than delegating to createDirectCommandExecute. Without it,
// a no-payload invocation (`controller.execute('direction-rtl')`) bottoms out at
// `editor.commands.setParagraphDirection()` — which silently falls through to LTR.
export const createParagraphDirectionExecute =
  (direction: 'ltr' | 'rtl') =>
  ({ context }: { context: ToolbarContext | null }) => {
    const editor = resolveStateEditor(context);
    const command = editor?.commands.setParagraphDirection;
    if (typeof command !== 'function') return false;
    return Boolean(command({ direction, alignmentPolicy: 'matchDirection' }));
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

    if (numberingType === 'bullet') {
      const markerText = isActive ? (paragraphNode?.attrs?.listRendering?.markerText ?? null) : null;
      return { active: isActive, disabled: false, value: markerText };
    }

    const activeNumberingFmt = isActive ? (paragraphNode?.attrs?.listRendering?.numberingType ?? null) : null;
    const activeMarkerText = isActive ? (paragraphNode?.attrs?.listRendering?.markerText ?? null) : null;
    const orderedStyleValue = (
      activeNumberingFmt && activeMarkerText ? numberingInfoToOrderedStyle(activeNumberingFmt, activeMarkerText) : null
    ) as OrderedListStyle | null;
    return { active: isActive, disabled: false, value: orderedStyleValue };
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

const createListToggleExecute =
  (styleCommand: string, legacyCommand: string) =>
  ({ context, payload }: { context: ToolbarContext | null; payload?: unknown }) => {
    const editor = resolveStateEditor(context);
    const commands = editor?.commands;
    if (typeof commands?.[styleCommand] === 'function') {
      const result = payload === undefined ? commands[styleCommand]() : commands[styleCommand](payload);
      return Boolean(result);
    }
    if (typeof commands?.[legacyCommand] === 'function') {
      return Boolean(commands[legacyCommand]());
    }
    return false;
  };

export const createBulletListExecute = () => createListToggleExecute('toggleBulletListStyle', 'toggleBulletList');

export const createOrderedListExecute = () => createListToggleExecute('toggleOrderedListStyle', 'toggleOrderedList');

export const createIndentDecreaseExecute =
  () =>
  ({ context }: { context: ToolbarContext | null; payload?: unknown }) => {
    const editor = resolveStateEditor(context);

    if (editor?.commands?.decreaseListIndent?.()) {
      return true;
    }

    return createDirectCommandExecute('decreaseTextIndent')({ context });
  };
