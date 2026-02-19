export interface FormattingCommandAugmentations {
  // Bold
  setBold: () => boolean;
  unsetBold: () => boolean;
  toggleBold: () => boolean;

  // Italic
  setItalic: () => boolean;
  unsetItalic: () => boolean;
  toggleItalic: () => boolean;

  // Underline
  setUnderline: () => boolean;
  unsetUnderline: () => boolean;
  toggleUnderline: () => boolean;

  // Strike
  setStrike: () => boolean;
  unsetStrike: () => boolean;
  toggleStrike: () => boolean;

  // Color
  setColor: (color: string) => boolean;
  unsetColor: () => boolean;

  // Highlight
  setHighlight: (color: string) => boolean;
  unsetHighlight: () => boolean;
  toggleHighlight: () => boolean;

  // Font family
  setFontFamily: (fontFamily: string) => boolean;
  unsetFontFamily: () => boolean;

  // Font size
  setFontSize: (fontSize: string | number) => boolean;
  unsetFontSize: () => boolean;

  // Heading
  setHeading: (attrs: { level: number }) => boolean;
  toggleHeading: (attrs: { level: number }) => boolean;

  // Text alignment
  setTextAlign: (alignment: string) => boolean;
  unsetTextAlign: () => boolean;
}

declare module '../../core/types/ChainedCommands.js' {
  interface ExtensionCommandMap extends FormattingCommandAugmentations {}
}
