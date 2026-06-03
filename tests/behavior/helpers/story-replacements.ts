import type { Page } from '@playwright/test';

export type StoryReplacementResult = {
  success: boolean;
  activeDocumentId: string | null;
  deletedText: string;
  insertedText: string;
};

export async function replaceFirstLettersInActiveStory(
  page: Page,
  insertedText: string,
  letterCount = 2,
): Promise<StoryReplacementResult> {
  return page.evaluate(
    ({ nextText, count }) => {
      const presentationEditor = (window as any).editor?.presentationEditor;
      const bodyEditor = (window as any).editor;
      const activeEditor = presentationEditor?.getActiveEditor?.();

      if (!activeEditor || activeEditor === bodyEditor) {
        throw new Error('Expected an active story editor.');
      }

      const storyText = activeEditor.state.doc.textBetween(0, activeEditor.state.doc.content.size, '\n', '\n') ?? '';
      const firstWordMatch = storyText.match(/[A-Za-z]{2,}/);
      if (!firstWordMatch || firstWordMatch.index == null) {
        throw new Error(`No replaceable word found in active story text: "${storyText}"`);
      }

      const replaceCount = Math.max(1, Math.min(count, firstWordMatch[0].length));
      const deletedText = storyText.slice(firstWordMatch.index, firstWordMatch.index + replaceCount);
      const characterPositions: number[] = [];

      activeEditor.state.doc.descendants((node: any, pos: number) => {
        if (!node?.isText || !node.text) return;
        for (let offset = 0; offset < node.text.length; offset += 1) {
          characterPositions.push(pos + offset);
        }
      });

      const from = characterPositions[firstWordMatch.index];
      const to = characterPositions[firstWordMatch.index + replaceCount - 1] + 1;
      const success = activeEditor.commands.insertTrackedChange({ from, to, text: nextText });

      return {
        success,
        activeDocumentId: activeEditor.options.documentId ?? null,
        deletedText,
        insertedText: nextText,
      };
    },
    { nextText: insertedText, count: letterCount },
  );
}
