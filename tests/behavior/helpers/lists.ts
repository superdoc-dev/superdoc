import type { ListItemAddress, ListsListQuery, ListsListResult } from '@superdoc/document-api';
import type { SuperDocFixture } from '../fixtures/superdoc.js';
import { listItems } from './document-api.js';

export const LIST_MARKER_SELECTOR = '.superdoc-paragraph-marker';

type ListKind = 'ordered' | 'bullet';
type ListItemDomain = ListsListResult['items'][number];

export type ParagraphNumberingSnapshot = {
  paragraphPos: number;
  text: string;
  numId: number | null;
  ilvl: number | null;
  numberingType: string | null;
};

async function createList(superdoc: SuperDocFixture, kind: ListKind, items: string[]): Promise<void> {
  if (items.length === 0) {
    throw new Error('createList requires at least one item.');
  }

  const firstMarker = kind === 'ordered' ? '1. ' : '- ';

  await superdoc.type(`${firstMarker}${items[0]}`);
  await superdoc.waitForStable();

  for (const item of items.slice(1)) {
    await superdoc.newLine();
    await superdoc.waitForStable();

    if (item.length > 0) {
      await superdoc.type(item);
      await superdoc.waitForStable();
    }
  }
}

export async function createOrderedList(superdoc: SuperDocFixture, items: string[]): Promise<void> {
  await createList(superdoc, 'ordered', items);
}

export async function createBulletList(superdoc: SuperDocFixture, items: string[]): Promise<void> {
  await createList(superdoc, 'bullet', items);
}

export async function countListMarkers(superdoc: SuperDocFixture): Promise<number> {
  return superdoc.page.locator(LIST_MARKER_SELECTOR).count();
}

export async function getListItemsSnapshot(
  superdoc: SuperDocFixture,
  query?: ListsListQuery,
): Promise<ListsListResult> {
  return listItems(superdoc.page, query);
}

export async function getListItemByText(
  superdoc: SuperDocFixture,
  text: string,
  occurrence = 0,
): Promise<ListItemDomain | null> {
  const snapshot = await getListItemsSnapshot(superdoc);
  const matches = snapshot.items.filter((item) => (item.text ?? '').includes(text));
  return matches[occurrence] ?? null;
}

export async function getListItemAddressByText(
  superdoc: SuperDocFixture,
  text: string,
  occurrence = 0,
): Promise<ListItemAddress> {
  const item = await getListItemByText(superdoc, text, occurrence);
  if (!item?.address) {
    throw new Error(`List item not found for text "${text}" at occurrence ${occurrence}.`);
  }

  return item.address;
}

export async function getParagraphPosByText(superdoc: SuperDocFixture, text: string, occurrence = 0): Promise<number> {
  return superdoc.page.evaluate(
    ({ searchText, targetOccurrence }) => {
      const editor = (window as any).editor;
      const positions: number[] = [];

      editor.state.doc.descendants((node: any, pos: number) => {
        if (node.type.name !== 'paragraph') return true;
        const paragraphText = String(node.textContent ?? '');
        if (paragraphText.includes(searchText)) {
          positions.push(pos);
        }
        return true;
      });

      const match = positions[targetOccurrence];
      if (match == null) {
        throw new Error(`Paragraph containing "${searchText}" was not found.`);
      }

      return match;
    },
    { searchText: text, targetOccurrence: occurrence },
  );
}

export async function getParagraphNumberingByText(
  superdoc: SuperDocFixture,
  text: string,
  occurrence = 0,
): Promise<ParagraphNumberingSnapshot | null> {
  return superdoc.page.evaluate(
    ({ searchText, targetOccurrence }) => {
      const editor = (window as any).editor;
      const matches: Array<{
        paragraphPos: number;
        text: string;
        numId: number | null;
        ilvl: number | null;
        numberingType: string | null;
      }> = [];

      editor.state.doc.descendants((node: any, pos: number) => {
        if (node.type.name !== 'paragraph') return true;

        const paragraphText = String(node.textContent ?? '');
        if (!paragraphText.includes(searchText)) return true;

        const numberingProperties = node.attrs?.paragraphProperties?.numberingProperties ?? null;
        if (!numberingProperties) return true;

        const rawNumId = numberingProperties?.numId;
        const rawIlvl = numberingProperties?.ilvl;

        matches.push({
          paragraphPos: pos,
          text: paragraphText,
          numId: Number.isFinite(Number(rawNumId)) ? Number(rawNumId) : null,
          ilvl: Number.isFinite(Number(rawIlvl)) ? Number(rawIlvl) : null,
          numberingType: node.attrs?.listRendering?.numberingType ?? null,
        });

        return true;
      });

      return matches[targetOccurrence] ?? null;
    },
    { searchText: text, targetOccurrence: occurrence },
  );
}

export async function getStartOverrideForText(
  superdoc: SuperDocFixture,
  text: string,
  occurrence = 0,
): Promise<number | null> {
  const paragraph = await getParagraphNumberingByText(superdoc, text, occurrence);
  if (!paragraph || paragraph.numId == null || paragraph.ilvl == null) return null;

  return superdoc.page.evaluate(
    ({ numId, ilvl }) => {
      const editor = (window as any).editor;
      const definition = editor?.converter?.numbering?.definitions?.[numId];
      if (!definition?.elements) return null;

      const levelOverride = definition.elements.find(
        (element: any) => element.name === 'w:lvlOverride' && String(element.attributes?.['w:ilvl']) === String(ilvl),
      );
      if (!levelOverride?.elements) return null;

      const startOverride = levelOverride.elements.find((element: any) => element.name === 'w:startOverride');
      const rawValue = startOverride?.attributes?.['w:val'];
      if (rawValue == null) return null;

      const numericValue = Number(rawValue);
      return Number.isFinite(numericValue) ? numericValue : null;
    },
    { numId: paragraph.numId, ilvl: paragraph.ilvl },
  );
}

export async function getAllListParagraphs(superdoc: SuperDocFixture): Promise<ParagraphNumberingSnapshot[]> {
  return superdoc.page.evaluate(() => {
    const editor = (window as any).editor;
    const rows: ParagraphNumberingSnapshot[] = [];

    editor.state.doc.descendants((node: any, pos: number) => {
      if (node.type.name !== 'paragraph') return true;

      const numberingProperties = node.attrs?.paragraphProperties?.numberingProperties ?? null;
      if (!numberingProperties) return true;

      const rawNumId = numberingProperties?.numId;
      const rawIlvl = numberingProperties?.ilvl;

      rows.push({
        paragraphPos: pos,
        text: String(node.textContent ?? ''),
        numId: Number.isFinite(Number(rawNumId)) ? Number(rawNumId) : null,
        ilvl: Number.isFinite(Number(rawIlvl)) ? Number(rawIlvl) : null,
        numberingType: node.attrs?.listRendering?.numberingType ?? null,
      });

      return true;
    });

    return rows;
  });
}

export async function getAllListLevels(superdoc: SuperDocFixture): Promise<number[]> {
  const listParagraphs = await getAllListParagraphs(superdoc);
  return listParagraphs.map((paragraph) => paragraph.ilvl ?? 0);
}
