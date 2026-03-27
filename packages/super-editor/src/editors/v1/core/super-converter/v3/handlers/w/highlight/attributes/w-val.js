// @ts-check

export const encode = (attributes) => attributes?.['w:val'];

export const decode = (attrs) => attrs?.highlight;

/** @type {import('@translator').AttrConfig} */
export const attrConfig = Object.freeze({
  xmlName: 'w:val',
  sdName: 'highlight',
  encode,
  decode,
});
