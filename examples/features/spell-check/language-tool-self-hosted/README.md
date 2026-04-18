# Spell Check — LanguageTool (Self-Hosted)

Self-hosted spell check powered by [LanguageTool](https://languagetool.org/) over HTTP. Requires Docker.

## Quick Start

```bash
# Start the LanguageTool server
docker compose up -d

# Install and run the example
pnpm install
pnpm dev
```

A blank document opens immediately. Start typing to see spell check in action.
This example installs the published `superdoc@next` package.

## What It Does

- Sends text to a self-hosted LanguageTool server over HTTP
- Filters results to spelling matches only (grammar/style are ignored in this example)
- Underlines misspelled words in red
- Right-click an underlined word to see suggestions from LanguageTool

## Try It

Type any of these: **teh**, **recieve**, **mispelled**

## Configuration

If your LanguageTool server runs elsewhere, set the URL in a `.env` file:

```
VITE_LANGUAGETOOL_URL=http://your-host:8081/v2/check
```

The default URL is `http://localhost:8081/v2/check`.

## Notes

- This example intentionally demonstrates the most direct HTTP integration, not optimized batching
- LanguageTool can detect grammar and style issues too, but this example filters to spelling only to match what the proofing UI currently renders
- The Docker image may take 15-30 seconds to be ready on first start

## Licensing

See [../THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) for third-party licensing details.
