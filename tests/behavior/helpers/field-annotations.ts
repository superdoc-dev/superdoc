import type { Page } from '@playwright/test';

export interface AnnotationAttrs {
  type?: string;
  displayLabel: string;
  fieldId: string;
  fieldColor?: string;
  highlighted?: boolean;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  linkUrl?: string;
  rawHtml?: string;
  [key: string]: unknown;
}

interface DocTextNode {
  isText?: boolean;
  text?: string | null;
}

interface DescendantDoc {
  descendants(callback: (node: DocTextNode, pos: number) => boolean | void): void;
}

interface AnnotationEditor {
  state?: { doc?: DescendantDoc };
  commands?: {
    replaceWithFieldAnnotation?: (ranges: Array<{ from: number; to: number; attrs: AnnotationAttrs }>) => void;
  };
}

/**
 * Find a text placeholder in the document and replace it with a field annotation.
 */
export async function replaceTextWithAnnotation(page: Page, searchText: string, attrs: AnnotationAttrs): Promise<void> {
  await page.evaluate(
    ({ search, annotationAttrs }) => {
      const editor = (window as { editor?: AnnotationEditor }).editor;
      const doc = editor?.state?.doc;
      const replaceWithFieldAnnotation = editor?.commands?.replaceWithFieldAnnotation;

      if (!doc || typeof replaceWithFieldAnnotation !== 'function') {
        throw new Error(
          'Field annotation helper requires editor.state.doc.descendants() and editor.commands.replaceWithFieldAnnotation().',
        );
      }

      let from = -1;
      let to = -1;

      doc.descendants((node, pos) => {
        if (from >= 0 && to >= 0) return false;
        if (node.isText && typeof node.text === 'string') {
          const index = node.text.indexOf(search);
          if (index !== -1) {
            from = pos + index;
            to = pos + index + search.length;
            return false;
          }
        }
        return true;
      });

      if (from < 0 || to < 0) throw new Error(`Text "${search}" not found`);

      replaceWithFieldAnnotation([
        {
          from,
          to,
          attrs: {
            fieldColor: '#6366f1',
            highlighted: true,
            type: 'text',
            ...annotationAttrs,
          },
        },
      ]);
    },
    { search: searchText, annotationAttrs: attrs },
  );
}
