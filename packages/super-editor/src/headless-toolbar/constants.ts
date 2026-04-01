export const DEFAULT_TEXT_ALIGN_OPTIONS = [
  { label: 'Left', value: 'left' },
  { label: 'Center', value: 'center' },
  { label: 'Right', value: 'right' },
  { label: 'Justify', value: 'justify' },
] as const;

export const DEFAULT_LINE_HEIGHT_OPTIONS = [
  { label: '1.00', value: 1 },
  { label: '1.15', value: 1.15 },
  { label: '1.50', value: 1.5 },
  { label: '2.00', value: 2 },
  { label: '2.50', value: 2.5 },
  { label: '3.00', value: 3 },
] as const;

export const DEFAULT_ZOOM_OPTIONS = [
  { label: '50%', value: 50 },
  { label: '75%', value: 75 },
  { label: '90%', value: 90 },
  { label: '100%', value: 100 },
  { label: '125%', value: 125 },
  { label: '150%', value: 150 },
  { label: '200%', value: 200 },
] as const;

export const DEFAULT_DOCUMENT_MODE_OPTIONS = [
  {
    label: 'Editing',
    value: 'editing',
    description: 'Edit document directly',
  },
  {
    label: 'Suggesting',
    value: 'suggesting',
    description: 'Edits become suggestions',
  },
  {
    label: 'Viewing',
    value: 'viewing',
    description: 'View clean version of document only',
  },
] as const;

export const DEFAULT_FONT_SIZE_OPTIONS = [
  { label: '8', value: '8pt' },
  { label: '9', value: '9pt' },
  { label: '10', value: '10pt' },
  { label: '11', value: '11pt' },
  { label: '12', value: '12pt' },
  { label: '14', value: '14pt' },
  { label: '18', value: '18pt' },
  { label: '24', value: '24pt' },
  { label: '30', value: '30pt' },
  { label: '36', value: '36pt' },
  { label: '48', value: '48pt' },
  { label: '60', value: '60pt' },
  { label: '72', value: '72pt' },
  { label: '96', value: '96pt' },
] as const;

export const DEFAULT_FONT_FAMILY_OPTIONS = [
  { label: 'Aptos', value: 'Aptos, Arial, sans-serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Arial', value: 'Arial, sans-serif' },
  { label: 'Courier New', value: 'Courier New, monospace' },
  { label: 'Times New Roman', value: 'Times New Roman, serif' },
] as const;

export const DEFAULT_TEXT_COLOR_OPTIONS = [
  { label: 'Black', value: '#000000' },
  { label: 'Dark Gray', value: '#434343' },
  { label: 'Gray', value: '#666666' },
  { label: 'Light Gray', value: '#999999' },
  { label: 'Red', value: '#ff0000' },
  { label: 'Orange', value: '#ff9900' },
  { label: 'Yellow', value: '#ffff00' },
  { label: 'Green', value: '#00ff00' },
  { label: 'Cyan', value: '#00ffff' },
  { label: 'Blue', value: '#0000ff' },
  { label: 'Purple', value: '#9900ff' },
  { label: 'Magenta', value: '#ff00ff' },
  { label: 'None', value: 'none' },
] as const;

export const DEFAULT_HIGHLIGHT_COLOR_OPTIONS = [
  { label: 'Yellow', value: '#ffff00' },
  { label: 'Green', value: '#00ff00' },
  { label: 'Cyan', value: '#00ffff' },
  { label: 'Pink', value: '#ff00ff' },
  { label: 'Blue', value: '#0000ff' },
  { label: 'Red', value: '#ff0000' },
  { label: 'Orange', value: '#ff9900' },
  { label: 'None', value: 'none' },
] as const;

export const headlessToolbarConstants = {
  DEFAULT_TEXT_ALIGN_OPTIONS,
  DEFAULT_LINE_HEIGHT_OPTIONS,
  DEFAULT_ZOOM_OPTIONS,
  DEFAULT_DOCUMENT_MODE_OPTIONS,
  DEFAULT_FONT_SIZE_OPTIONS,
  DEFAULT_FONT_FAMILY_OPTIONS,
  DEFAULT_TEXT_COLOR_OPTIONS,
  DEFAULT_HIGHLIGHT_COLOR_OPTIONS,
} as const;
