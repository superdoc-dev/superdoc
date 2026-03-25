# Spell Check / Proofing

Both examples use SuperDoc's built-in proofing platform with different spell-check providers. Each is intentionally minimal and optimized for clarity over production hardening.
They install the published `superdoc@next` package rather than a local workspace build.

| | Typo.js | LanguageTool |
|---|---|---|
| Provider | [typo-js](https://github.com/cfinke/Typo.js) | [LanguageTool](https://languagetool.org/) |
| Deployment | Browser-only | Self-hosted (Docker) |
| Offline | Yes | No |
| Grammar capable | No | Yes (filtered to spelling in this example) |
| Best for | Privacy, offline, demos | Production, multi-language |

## Examples

- **[typo-js/](./typo-js/)** — Local, browser-only spell check. No backend required.
- **[language-tool-self-hosted/](./language-tool-self-hosted/)** — Self-hosted HTTP spell check via LanguageTool.

## Third-Party Notices

See [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md) for licensing details on bundled third-party software.
