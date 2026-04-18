# Patches

## openapi-types@12.1.3

**TODO: Remove once Mintlify fixes the upstream bug.**

`@mintlify/scraping` (used by `mintlify dev`) imports `{ OpenAPIV3 }` from `openapi-types` using
ESM named import syntax, but `openapi-types` is a CJS module. Node rejects this.

Additionally, `@mintlify/scraping` doesn't declare `openapi-types` as a dependency at all, so pnpm
resolves it to the wrong version (7.2.3 via `@apidevtools/swagger-parser`). The `pnpm.overrides`
entry in `package.json` forces resolution to 12.1.3 (which has actual runtime exports).

The patch adds an ESM wrapper (`dist/index.mjs`) and `exports` field to `package.json` so the
named import works under Node's ESM loader.

To check if this is still needed: remove the override and patch, run `pnpm install`, then
`pnpm dev:docs`. If Mintlify starts without the `SyntaxError: Named export 'OpenAPIV3' not found`
error, the fix landed upstream and this patch can be deleted.
