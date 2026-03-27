// @ts-check

export const encode = (attributes) => attributes?.['w:color'];

export const decode = (attrs) => attrs?.color;

/** @type {import('@translator').AttrConfig} */
export const attrConfig = Object.freeze({
  xmlName: 'w:color',
  sdName: 'color',
  encode,
  decode,
});
