# Typing Super Editor Commands

The Super Editor command API is extensible, so extensions can expose their own
commands via `addCommands`. Historically these commands were typed as
`(...args: unknown[]) => boolean`, which meant the compiler could not catch
incorrect parameters. The new command typing system introduces two shared type
maps that extensions can augment to describe each command's signature.

This guide explains how to adopt the new pattern without breaking existing
extensions.

---

## 1. Understand the Type Maps

- `CoreCommandMap` – reserved for built-in commands that ship with Super Editor.
- `ExtensionCommandMap` – the module each extension augments to describe its
  own commands.

Both maps live in `@core/types/ChainedCommands`. At compile time we merge them
and derive the user-facing types:

```ts
type EditorCommands = CoreCommands & ExtensionCommands & Record<string, AnyCommand>;
```

Any command not listed in a map falls back to `(...args: unknown[]) => boolean`,
so existing extensions keep working until they opt in.

---

## 2. Augmenting `ExtensionCommandMap`

Create a `.d.ts` or `.ts` file next to your extension and augment the module.
Use the command name as the key and the **outer** signature (`(...args) => boolean`)
as the value.

```ts
// packages/super-editor/src/editors/v1/extensions/bookmarks/bookmark-start.types.ts
import type { CommandProps } from '@core/types/ChainedCommands';

declare module '@core/types/ChainedCommands' {
  interface ExtensionCommandMap {
    /**
     * Insert a bookmark node.
     * Usage: editor.commands.insertBookmark({ name: 'intro' })
     */
    insertBookmark: (attrs: { name: string; id?: string }) => boolean;

    /**
     * Scroll to the bookmark with the provided name.
     * Usage: editor.commands.goToBookmark('intro')
     */
    goToBookmark: (name: string) => boolean;
  }
}
```

> **Heads up:** the `Command` implementation still receives `CommandProps`.
> We're only typing the parameters that a consumer passes to
> `editor.commands.<name>(...)`.

---

## 3. Examples

| Pattern             | Example                                                                                              |
| ------------------- | ---------------------------------------------------------------------------------------------------- |
| No parameters       | `toggleBold: () => boolean;`                                                                         |
| Single parameter    | `setFontFamily: (family: string) => boolean;`                                                        |
| Object parameter    | `setHeading: (attrs: { level: number }) => boolean;`                                                 |
| Multiple parameters | `insertContentAt: (pos: number, content: unknown, opts?: { updateSelection?: boolean }) => boolean;` |

You can also use tuples when you need strict ordering:

```ts
insertRange: (...args: [from: number, to: number, text: string]) => boolean;
```

---

## 4. Typing `chain()` and `can()`

Once a command is in the map, the following APIs inherit the signature:

- `editor.commands.myCommand` – strongly typed parameters and return type.
- `editor.can().myCommand` – same parameters, returns `boolean`.
- `editor.chain().myCommand(...).run()` – command arguments validated inside the
  chain as well.

---

## 5. Compatibility Notes

- Extensions that do **not** augment the map continue to work, but their
  commands remain `unknown[]` and TypeScript now emits a deprecation warning to
  encourage adding proper typings.
- Third-party extensions can augment the map from their own packages; just
  ensure the declaration file is included in their build output.
- The map is additive—multiple modules can add keys without conflict.

---

## 6. Checklist for New Commands

1. Implement the command via `addCommands`.
2. Add or update the augmentation file with the command signature.
3. Run `tsc` (or your editor's type checking) to verify the signature is picked
   up by `editor.commands`, `editor.chain()`, and `editor.can()`.
4. Update documentation/tests if the command accepts new parameters.

Following this process ensures we eventually provide accurate typings for every
command while keeping backwards compatibility for existing extensions.
