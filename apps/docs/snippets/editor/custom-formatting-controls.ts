import { SuperDoc } from 'superdoc';
import type { CommandExecutionResult } from 'superdoc/ui';
import 'superdoc/style.css';

const fontFamilySelect = document.querySelector<HTMLSelectElement>('#font-family');
const fontSizeSelect = document.querySelector<HTMLSelectElement>('#font-size');
const paragraphStyleSelect = document.querySelector<HTMLSelectElement>('#paragraph-style');
const documentModeSelect = document.querySelector<HTMLSelectElement>('#document-mode');
const formattingStatus = document.querySelector<HTMLParagraphElement>('#formatting-status');

if (!fontFamilySelect || !fontSizeSelect || !paragraphStyleSelect || !documentModeSelect || !formattingStatus) {
  throw new Error('The formatting controls are incomplete.');
}

let stopObservers: Array<() => void> = [];
let removeHandlers: (() => void) | null = null;

const replaceOptions = (
  select: HTMLSelectElement,
  options: readonly { value: string; label: string }[],
  selected: string | null,
) => {
  select.replaceChildren(
    ...options.map(({ value, label }) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      return option;
    }),
  );
  if (selected && options.some((option) => option.value === selected)) select.value = selected;
};

const superdoc = new SuperDoc({
  selector: '#editor',
  document: '/contract.docx',
  onReady: ({ superdoc: readySuperDoc }) => {
    const ui = readySuperDoc.ui;
    const fontFamily = ui.commands.get('font-family');
    const fontSize = ui.commands.get('font-size');
    const paragraphStyle = ui.commands.get('linked-style');
    const documentMode = ui.commands.get('document-mode');

    const render = () => {
      const fonts = ui.fonts.getSnapshot();
      const styles = ui.styles.getSnapshot();
      const document = ui.document.getSnapshot();
      const familyState = fontFamily.getState();
      const sizeState = fontSize.getState();
      const styleState = paragraphStyle.getState();

      replaceOptions(fontFamilySelect, fonts.options, typeof familyState.value === 'string' ? familyState.value : null);
      replaceOptions(fontSizeSelect, fonts.sizeOptions, typeof sizeState.value === 'string' ? sizeState.value : null);
      replaceOptions(
        paragraphStyleSelect,
        styles.quickGallery.map((style) => ({ value: style.id, label: style.name })),
        styles.activeParagraphStyleId,
      );

      fontFamilySelect.disabled = !familyState.enabled;
      fontSizeSelect.disabled = !sizeState.enabled;
      paragraphStyleSelect.disabled = !styleState.enabled || styles.quickGallery.length === 0;
      documentModeSelect.value = document.mode ?? 'editing';
    };

    const report = (result: CommandExecutionResult) => {
      if (result === false) {
        formattingStatus.textContent = 'The formatting action is unavailable.';
        return;
      }
      if (typeof result === 'object' && !result.success) {
        formattingStatus.textContent = result.failure.message;
        return;
      }
      formattingStatus.textContent = 'Formatting updated.';
    };

    const setFontFamily = async () => report(await fontFamily.executeAsync(fontFamilySelect.value));
    const setFontSize = async () => report(await fontSize.executeAsync(fontSizeSelect.value));
    const setParagraphStyle = async () => report(await paragraphStyle.executeAsync(paragraphStyleSelect.value));
    const setDocumentMode = async () => report(await documentMode.executeAsync(documentModeSelect.value));

    stopObservers = [
      ui.fonts.observe(render),
      ui.styles.observe(render),
      ui.document.observe(render),
      fontFamily.observe(render),
      fontSize.observe(render),
      paragraphStyle.observe(render),
    ];

    fontFamilySelect.addEventListener('change', setFontFamily);
    fontSizeSelect.addEventListener('change', setFontSize);
    paragraphStyleSelect.addEventListener('change', setParagraphStyle);
    documentModeSelect.addEventListener('change', setDocumentMode);

    removeHandlers = () => {
      fontFamilySelect.removeEventListener('change', setFontFamily);
      fontSizeSelect.removeEventListener('change', setFontSize);
      paragraphStyleSelect.removeEventListener('change', setParagraphStyle);
      documentModeSelect.removeEventListener('change', setDocumentMode);
    };
  },
});

window.addEventListener('beforeunload', () => {
  for (const stop of stopObservers) stop();
  removeHandlers?.();
  superdoc.destroy();
});
