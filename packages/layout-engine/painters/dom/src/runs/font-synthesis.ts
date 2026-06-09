export function allowFontSynthesis(element: HTMLElement): void {
  // Host resets commonly disable synthesis globally. SuperDoc text must still honor Word-style
  // synthetic bold/italic when DocFonts authorizes a real source face for a styled fallback.
  element.style.setProperty('font-synthesis', 'weight style');
}
