# @superdoc-dev/font-pack-cjk-jp

Optional Japanese CJK fallback fonts for SuperDoc documents.

This package registers:

- `BIZ UDMincho` for `Yu Mincho` and `MS Mincho`
- `BIZ UDGothic` for `Yu Gothic` and `MS Gothic`

The fonts are not part of the core `superdoc` package because CJK webfont files
are large and most deployments do not need them.

## Initial editor config

```js
import SuperDoc from 'superdoc';
import { japaneseCjkFontPackFamilies } from '@superdoc-dev/font-pack-cjk-jp';

const superdoc = new SuperDoc({
  fonts: {
    families: japaneseCjkFontPackFamilies(),
  },
});
```

## Runtime registration

```js
import { registerJapaneseCjkFontPack } from '@superdoc-dev/font-pack-cjk-jp';

registerJapaneseCjkFontPack(superdoc);
```

## Hosted assets

By default the helper uses static package asset URLs. Bundlers can rewrite those
URLs and copy the font files. Hosts can also provide their own asset root:

```js
japaneseCjkFontPackFamilies({
  assetBaseUrl: 'https://cdn.example.com/superdoc-font-pack-cjk-jp/',
});
```

or a per-face resolver:

```js
japaneseCjkFontPackFamilies({
  resolveAssetUrl: ({ file }) => `/font-packs/cjk-jp/${file}`,
});
```

Font provenance, hashes, and license details are in `font-assets.manifest.json`,
`LICENSES.md`, `OFL.txt`, and `THIRD_PARTY_LICENSES.md`.
