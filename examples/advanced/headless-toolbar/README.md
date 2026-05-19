# Headless toolbar variants

Five reference implementations of a custom toolbar driven by SuperDoc's headless `HeadlessToolbarController`. Each variant binds the same controller to a different framework + design-system pair so consumers can pick the one closest to their stack as a starting point.

The point of "headless" here is: SuperDoc supplies the toolbar state (active items, command dispatch, dynamic enablement), the consumer supplies the rendering. No built-in CSS, no opinionated component library.

## Variants

| Variant | Stack | What it shows |
|---|---|---|
| [`vanilla`](./vanilla) | Plain JS + plain DOM | Smallest possible binding. Useful if you're integrating into a non-React/Vue/Svelte surface. |
| [`react-mui`](./react-mui) | React + Material UI | Render the headless state through MUI's `<Toolbar>` and friends. |
| [`react-shadcn`](./react-shadcn) | React + shadcn/ui | Same React pattern with shadcn primitives. |
| [`svelte-shadcn`](./svelte-shadcn) | Svelte + shadcn-svelte | Svelte-flavored binding. |
| [`vue-vuetify`](./vue-vuetify) | Vue + Vuetify | Vue binding driven by Vuetify components. |

## Run a variant

Each variant is a standalone workspace with its own `package.json` and `dev` script. From the variant directory:

```bash
pnpm install
pnpm dev
```

## When to reach for it

- You're shipping a toolbar that needs to match your existing design system, and the built-in toolbar's chrome doesn't fit.
- You want to expose the same actions across multiple toolbar surfaces (main toolbar, mobile sub-toolbar, command palette) and need them all driven from one source of truth.

## When not

- You're happy with the default toolbar. Use [`examples/editor/built-in-ui/toolbar`](../../editor/built-in-ui/toolbar) instead; it's the smallest setup.
- You only need to add or remove a few default actions. The configurable-toolbar pattern at [`examples/editor/custom-ui/configurable-toolbar`](../../editor/custom-ui/configurable-toolbar) is lighter than going fully headless.

## Docs

[Headless toolbar](https://docs.superdoc.dev/editor/custom-ui/toolbar-and-commands).
