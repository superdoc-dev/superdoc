// @ts-check

export const encode = (attributes) => attributes?.['w:themeTint'];

export const decode = (attrs) => attrs?.themeTint;

/** @type {import('@translator').AttrConfig} */
export const attrConfig = Object.freeze({
  xmlName: 'w:themeTint',
  sdName: 'themeTint',
  encode,
  decode,
});
