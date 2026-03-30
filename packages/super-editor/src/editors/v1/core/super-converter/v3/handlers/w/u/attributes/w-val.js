// @ts-check

export const encode = (attributes) => attributes?.['w:val'];

export const decode = (attrs) => attrs?.underline;

/** @type {import('@translator').AttrConfig} */
export const attrConfig = Object.freeze({
  xmlName: 'w:val',
  sdName: 'underline',
  encode,
  decode,
});
