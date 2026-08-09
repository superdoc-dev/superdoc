import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

type CanvasCtor = new (
  width?: number,
  height?: number,
) => {
  getContext(type: '2d'): CanvasRenderingContext2D;
};

let warned = false;

export function resolveCanvas(): { Canvas: CanvasCtor; usingStub: boolean } {
  try {
    const { Canvas } = require('canvas') as { Canvas: CanvasCtor };
    return { Canvas, usingStub: false };
  } catch {
    if (!warned) {
      console.warn(
        '[superdoc] Using mock canvas fallback; text metrics may be approximate. Install native deps (pkg-config + cairo/pixman) or use Node 20 for precise measurements.',
      );
      warned = true;
    }

    class MockCanvasRenderingContext2D {
      font = '';

      // Deterministic, font-aware approximation to keep tests stable without native canvas.
      measureText(text: string) {
        const size = this.getFontSize();
        const bold = /\bbold\b/i.test(this.font);
        const italic = /\bitalic\b/i.test(this.font);
        const fontHash = this.hashString(this.font);

        // Per-character width with deterministic variance so different strings of equal length differ.
        let units = 0;
        for (let i = 0; i < text.length; i += 1) {
          const ch = text.charCodeAt(i);
          if (text[i] === ' ') {
            units += 0.33;
            continue;
          }
          // Base glyph width plus small deterministic variance.
          const variance = ((ch + fontHash + i) % 11) / 200; // 0.00–0.05
          units += 0.5 + variance;
        }

        const weightMultiplier = bold ? 1.06 : 1;
        const styleMultiplier = italic ? 1.02 : 1;
        const width = units * size * weightMultiplier * styleMultiplier;
        return {
          width,
          actualBoundingBoxAscent: size * 0.8,
          actualBoundingBoxDescent: size * 0.2,
        } as TextMetrics;
      }

      private getFontSize(): number {
        const match = this.font.match(/([\d.]+)px/);
        return match ? Number(match[1]) : 16;
      }

      private hashString(value: string): number {
        // djb2-ish, deterministic within JS number range
        let hash = 5381;
        for (let i = 0; i < value.length; i += 1) {
          hash = ((hash << 5) + hash) ^ value.charCodeAt(i);
        }
        return hash >>> 0;
      }
    }

    class MockCanvas {
      constructor(
        private width: number = 1024,
        private height: number = 768,
      ) {}

      getContext(type: '2d') {
        if (type === '2d') {
          return new MockCanvasRenderingContext2D() as unknown as CanvasRenderingContext2D;
        }
        return null;
      }
    }

    return { Canvas: MockCanvas as unknown as CanvasCtor, usingStub: true };
  }
}
