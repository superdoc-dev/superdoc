// @ts-check

export const encode = (attributes) => attributes?.['w:themeShade'];

export const decode = (attrs) => attrs?.themeShade;

/** @type {import('@translator').AttrConfig} */
export const attrConfig = Object.freeze({
  xmlName: 'w:themeShade',
  sdName: 'themeShade',
  encode,
  decode,
});
