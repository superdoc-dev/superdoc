# Content controls

Document API examples that show one content-control pattern each. Pick by what you're trying to build.

| Example | Pattern |
|---|---|
| [smart-fields](./smart-fields) | One value, every occurrence. Inline text controls sharing a tag. `selectByTag` + `text.setValue`. |
| [reusable-section](./reusable-section) | Versioned block. Tag carries `{sectionId, version}`. Detect drift, swap in place with `replaceContent` + `patch`. |

For a composed runtime workflow that combines both patterns into a contract-template app, see [`demos/contract-templates`](../../../demos/contract-templates).

For a ready-made React component that handles template authoring on top of these primitives (trigger `{{`, linked field groups, owner/signer types, export to .docx), see [`@superdoc-dev/template-builder`](https://docs.superdoc.dev/solutions/template-builder/introduction).
