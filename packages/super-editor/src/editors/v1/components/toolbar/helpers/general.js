import { encodeMarksFromRPr } from '@core/super-converter/styles.js';

export const getParagraphFontFamilyFromProperties = (paragraphProps, convertedXml = {}) => {
  const fontFamilyProps = paragraphProps?.runProperties?.fontFamily;
  if (!fontFamilyProps) return null;
  const [markDef] = encodeMarksFromRPr({ fontFamily: fontFamilyProps }, convertedXml);
  return markDef?.attrs?.fontFamily ?? null;
};

export const findElementBySelector = (selector) => {
  let el = null;

  if (selector) {
    if (selector.startsWith('#') || selector.startsWith('.')) {
      el = document.querySelector(selector);
    } else {
      el = document.getElementById(selector);
    }

    if (!el) {
      return null;
    }
  }

  return el;
};
