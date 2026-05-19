# Editor theming

A working example of theming the SuperDoc editor with custom CSS variables, including a runtime theme switcher across multiple named themes.

## What this teaches

- Overriding SuperDoc's `--sd-*` token contract from a consumer stylesheet to restyle toolbar, canvas, comments, and the review panel together.
- Defining several themes as plain JS objects and toggling between them at runtime.
- Where the SuperDoc token surface starts (the imported `superdoc/style.css`) and how to layer your own tokens on top without forking.

## Run it

```bash
pnpm install
pnpm dev
```

Open the local URL Vite prints. Use the theme switcher to flip between the bundled themes.

## When to reach for it

- You're customizing SuperDoc's look to match an existing product brand or design system.
- You want a reference for which `--sd-*` tokens are safe to override.

## When not

- You need to restyle individual document content (paragraph styles, run formatting). That's the style cascade on the document itself, not the editor chrome; use the Document API style operations instead.

## Docs

[Theming](https://docs.superdoc.dev/editor/theming/overview).
