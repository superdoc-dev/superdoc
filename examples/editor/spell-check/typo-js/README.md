# Spell Check — Typo.js

Local, browser-only spell check powered by [Typo.js](https://github.com/cfinke/Typo.js). No backend required.

## Quick Start

```bash
pnpm install
pnpm dev
```

A blank document opens immediately. Start typing to see spell check in action.
This example installs the published `superdoc@next` package.

## What It Does

- Loads the en_US dictionary from the typo-js package at startup
- Checks words against the dictionary as you type
- Underlines misspelled words in red
- Right-click an underlined word to see suggestions

## Try It

Type any of these: **teh**, **recieve**, **mispelled**

## Notes

- Uses a simple word-boundary tokenizer — not a full NLP pipeline
- Best for privacy-sensitive use cases, offline demos, and local development
- No multi-language support in this example

## Licensing

See [../THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) for third-party licensing details.
