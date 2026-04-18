// @ts-check

export const encode = (attributes) => attributes?.['w:themeColor'];

export const decode = (attrs) => attrs?.themeColor;

/** @type {import('@translator').AttrConfig} */
export const attrConfig = Object.freeze({
  xmlName: 'w:themeColor',
  sdName: 'themeColor',
  encode,
  decode,
});
