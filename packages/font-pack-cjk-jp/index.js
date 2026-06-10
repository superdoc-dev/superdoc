const INTERNAL_FAMILIES = Object.freeze([
  Object.freeze({
    family: 'BIZ UDMincho',
    replaces: Object.freeze(['Yu Mincho', 'MS Mincho']),
    faces: Object.freeze([
      Object.freeze({
        file: 'BIZUDMincho-Regular.woff2',
        source: new URL('./assets/BIZUDMincho-Regular.woff2', import.meta.url).href,
        weight: 'normal',
        style: 'normal',
      }),
      Object.freeze({
        file: 'BIZUDMincho-Bold.woff2',
        source: new URL('./assets/BIZUDMincho-Bold.woff2', import.meta.url).href,
        weight: 'bold',
        style: 'normal',
      }),
    ]),
  }),
  Object.freeze({
    family: 'BIZ UDGothic',
    replaces: Object.freeze(['Yu Gothic', 'MS Gothic']),
    faces: Object.freeze([
      Object.freeze({
        file: 'BIZUDGothic-Regular.woff2',
        source: new URL('./assets/BIZUDGothic-Regular.woff2', import.meta.url).href,
        weight: 'normal',
        style: 'normal',
      }),
      Object.freeze({
        file: 'BIZUDGothic-Bold.woff2',
        source: new URL('./assets/BIZUDGothic-Bold.woff2', import.meta.url).href,
        weight: 'bold',
        style: 'normal',
      }),
    ]),
  }),
]);

export const JAPANESE_CJK_FONT_PACK_FAMILIES = Object.freeze(
  INTERNAL_FAMILIES.map((entry) =>
    Object.freeze({
      family: entry.family,
      replaces: entry.replaces,
      faces: Object.freeze(
        entry.faces.map(({ file, weight, style }) =>
          Object.freeze({
            file,
            weight,
            style,
          }),
        ),
      ),
    }),
  ),
);

function withTrailingSlash(base) {
  return base.endsWith('/') ? base : `${base}/`;
}

function joinUrl(base, file) {
  return `${withTrailingSlash(base)}${file}`;
}

function weightToken(weight) {
  return weight === 'bold' ? '700' : '400';
}

function assetSource(family, face, options) {
  if (typeof options.resolveAssetUrl === 'function') {
    return options.resolveAssetUrl({
      file: face.file,
      family,
      weight: weightToken(face.weight),
      style: face.style,
      source: 'font-pack-cjk-jp',
    });
  }
  if (options.assetBaseUrl) {
    return joinUrl(options.assetBaseUrl, face.file);
  }
  return face.source;
}

export const JAPANESE_CJK_LOGICAL_FAMILIES = Object.freeze(INTERNAL_FAMILIES.flatMap((entry) => [...entry.replaces]));

export function japaneseCjkFontPackFamilies(options = {}) {
  return INTERNAL_FAMILIES.map((entry) => ({
    family: entry.family,
    faces: entry.faces.map((face) => ({
      source: assetSource(entry.family, face, options),
      weight: face.weight,
      style: face.style,
    })),
  }));
}

export function registerJapaneseCjkFontPack(superdoc, options = {}) {
  const add = superdoc?.fonts?.add;
  if (typeof add !== 'function') {
    throw new Error('[superdoc-font-pack-cjk-jp] expected a SuperDoc instance with fonts.add');
  }
  const families = japaneseCjkFontPackFamilies(options);
  add(families);
  return families;
}
