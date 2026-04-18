// @ts-check

export const decode = (attrs) => attrs?.['w:id'];

/** @type {import('@translator').AttrConfig} */
export const attrConfig = Object.freeze({
  xmlName: 'w:id',
  sdName: 'w:id', // We do not translate it from 'w:id' to 'id' when encoding, so the name is the same
  encode: () => {},
  decode,
});
