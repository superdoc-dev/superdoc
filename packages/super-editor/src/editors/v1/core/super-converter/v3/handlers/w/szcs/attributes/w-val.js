// @ts-check

export const encode = (attributes) => attributes?.['w:val'];

export const decode = (attrs) => attrs?.fontSizeCs;

/** @type {import('@translator').AttrConfig} */
export const attrConfig = Object.freeze({
  xmlName: 'w:val',
  sdName: 'fontSizeCs',
  encode,
  decode,
});
