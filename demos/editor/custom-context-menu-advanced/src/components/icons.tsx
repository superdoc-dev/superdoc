// Compact SVG icon component
export const Icon = ({ d, size = 16 }: { d: readonly string[]; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    {d.map((path, i) => <path key={i} d={path} />)}
  </svg>
);

// Icon path data
export const icons = {
  bold: ['M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z', 'M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z'],
  italic: ['M19 4h-9', 'M14 20H5', 'M15 4L9 20'],
  underline: ['M6 3v7a6 6 0 0 0 12 0V3', 'M4 21h16'],
  strikethrough: ['M4 12h16', 'M17.5 7.5c-1.5-1.5-4-2-6.5-1.5s-4.5 2-5 4c-.5 2 .5 4 2.5 5', 'M8.5 16.5c1.5 1.5 4 2 6.5 1.5s4-2 4.5-4'],
  list: ['M8 6h13', 'M8 12h13', 'M8 18h13', 'M3 6h.01', 'M3 12h.01', 'M3 18h.01'],
  bulletList: ['M9 6h11', 'M9 12h11', 'M9 18h11', 'M4 6a1.5 1.5 0 1 0 0 .01', 'M4 12a1.5 1.5 0 1 0 0 .01', 'M4 18a1.5 1.5 0 1 0 0 .01'],
  numberedList: ['M10 6h11', 'M10 12h11', 'M10 18h11'],
  chevron: ['M9 18l6-6-6-6'],
} as const;

export type IconName = keyof typeof icons;
