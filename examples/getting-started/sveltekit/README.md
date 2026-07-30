# SuperDoc — SvelteKit

Minimal SvelteKit + TypeScript example.

## Run

```bash
npm install
npm run dev
```

Then open the dev server URL and pick a `.docx` file.

## SSR

SuperDoc is browser-only: instantiating it during SSR throws
`ReferenceError: document is not defined`. Rather than turn SSR off for the
whole app, this example scopes it to the one route that mounts the editor:

```ts
// src/routes/+page.ts
export const ssr = false;
```

The rest of a real SvelteKit app keeps server-side rendering. The editor is
created inside a `$effect` (client-only) once a file is chosen, and destroyed
in the effect's cleanup.

## Learn more

- [SvelteKit page options](https://svelte.dev/docs/kit/page-options#ssr)
- [Configuration Reference](https://docs.superdoc.dev/editor/superdoc/configuration)
