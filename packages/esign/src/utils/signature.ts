// Convert typed signature text into a PNG data URL for consistent rendering.
export const textToImageDataUrl = (text: string): string => {
  const canvas = globalThis.document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;

  const fontSize = 30;
  ctx.font = `italic ${fontSize}px cursive`;

  const metrics = ctx.measureText(text);
  const textWidth = metrics.width;

  const estimatedHeight = fontSize * 1.3;
  const paddingX = 4;
  const paddingY = 6;

  canvas.width = Math.ceil(textWidth + paddingX * 2) + 20;
  canvas.height = Math.ceil(estimatedHeight + paddingY * 2);

  ctx.font = `italic ${fontSize}px cursive`;
  ctx.fillStyle = 'black';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  return canvas.toDataURL('image/png');
};
