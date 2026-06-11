import type { Line, TabRun, TabStop, TextFormatting, TextPart } from '@superdoc/contracts';
import { calculateTabWidth } from '@superdoc/contracts';
import { renderInlineTabRun } from './runs/tab-run.js';

const TWIPS_PER_PX = 15;
const DEFAULT_TAB_DISTANCE_PX = 48;

export type ShapeTextboxTabState = {
  currentX: number;
  paragraphWidth: number;
  tabStopsPx: TabStop[];
};

export function createShapeTextboxTabState(paragraphWidth: number, paragraphTabs?: TabStop[]): ShapeTextboxTabState {
  const tabStopsPx =
    paragraphTabs
      ?.filter((stop) => stop.val !== 'clear')
      .map((stop) => ({ ...stop, pos: stop.pos / TWIPS_PER_PX }))
      .sort((a, b) => a.pos - b.pos) ?? [];

  return {
    currentX: 0,
    paragraphWidth: Math.max(1, paragraphWidth),
    tabStopsPx,
  };
}

export function measureShapeTextPartWidth(text: string, formatting?: TextFormatting): number {
  if (!text) return 0;

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return text.length * 7;
  }

  const fontSize = formatting?.fontSize ?? 12;
  const weight = formatting?.bold ? 'bold' : 'normal';
  const style = formatting?.italic ? 'italic' : 'normal';
  const family = formatting?.fontFamily ?? 'Arial';
  ctx.font = `${style} ${weight} ${fontSize}px ${family}`;
  const baseWidth = ctx.measureText(text).width;
  const letterSpacing = formatting?.letterSpacing ?? 0;
  if (letterSpacing === 0 || text.length <= 1) {
    return baseWidth;
  }
  return baseWidth + letterSpacing * (text.length - 1);
}

function textPartToTabRun(part: TextPart, width: number): TabRun {
  const formatting = part.formatting;
  return {
    kind: 'tab',
    text: '\t',
    width,
    fontSize: formatting?.fontSize ?? 12,
    fontFamily: formatting?.fontFamily,
    bold: formatting?.bold,
    italic: formatting?.italic,
    color: formatting?.color,
  };
}

function minimalLineForTab(fontSize: number): Line {
  return {
    fromRun: 0,
    fromChar: 0,
    toRun: 0,
    toChar: 0,
    width: 0,
    ascent: fontSize * 0.8,
    descent: fontSize * 0.2,
    lineHeight: fontSize * 1.2,
  };
}

export function appendShapeTextboxTabElement(
  doc: Document,
  parent: HTMLElement,
  part: TextPart,
  state: ShapeTextboxTabState,
  followingText: string,
): void {
  const fontSize = part.formatting?.fontSize ?? 12;
  const { width } =
    state.tabStopsPx.length > 0
      ? calculateTabWidth({
          currentX: state.currentX,
          tabStops: state.tabStopsPx,
          paragraphWidth: state.paragraphWidth,
          defaultTabDistance: DEFAULT_TAB_DISTANCE_PX,
          defaultLineLength: state.paragraphWidth,
          followingText,
          measureText: (text) => measureShapeTextPartWidth(text, part.formatting),
        })
      : { width: DEFAULT_TAB_DISTANCE_PX };

  const tabRun = textPartToTabRun(part, Math.max(1, width));
  const tabEl = renderInlineTabRun(tabRun, minimalLineForTab(fontSize), doc, 0);
  parent.appendChild(tabEl);
  state.currentX += tabRun.width ?? DEFAULT_TAB_DISTANCE_PX;
}

export function isShapeTextboxTabPart(part: TextPart): boolean {
  return part.kind === 'tab' || part.text === '\t';
}
