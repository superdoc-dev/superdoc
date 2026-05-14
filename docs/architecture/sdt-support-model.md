# SDT Support Model

**Status:** Draft (SD-3053)
**Owner:** Caio Pizzol
**Last updated:** 2026-05-14

## Why this exists

SuperDoc has a broad Structured Document Tag (SDT / content control) surface — converter, painter, Document API, layout-engine — but no written rules about how those pieces are allowed to interact. Without rules, every SDT-touching PR is a judgment call, and judgment calls drift.

This document is the contract. It defines five support levels, two reusable type concepts, and three structural invariants. Every SDT-touching PR is reviewable against it.

## Five support levels

Each SDT capability sits at one of five levels. A capability can be at level _N_ on one axis (e.g. import) and a different level on another (e.g. edit), but the levels describe what `contentControls.*` claims to do for that capability end-to-end.

| Level | Meaning |
|---|---|
| **1. Preserve** | The SDT survives import and export without structural loss. Raw `sdtPr` is stored on the PM node and exported with structurally equivalent preservation; managed identity/lock children (`w:id`, `w:alias`, `w:tag`, `w:lock`) may be reconstructed from current attrs. The Document API may not type it. |
| **2. Render** | The painter shows the SDT correctly. Chrome, alias, and appearance state behave per ECMA-376 / Word. |
| **3. Expose** | The Document API reads it. `ContentControlInfo.properties.*` returns recognized values; `controlType` is one of the recognized OOXML markers (see below). |
| **4. Edit** | The Document API mutates it. Typed setters (`contentControls.text.setValue`, `date.setValue`, `checkbox.setState`, etc.) are wired and round-trip. |
| **5. Emulate** | SuperDoc matches Word's runtime behavior: live `dataBinding` sync, `temporary` self-removal on first edit, lock-policy enforcement, placeholder swap. |

Levels are additive: a capability at level 4 is also at levels 1–3.

## Per-PR contract

Every SDT-touching PR description states which level the PR advances, for which capability. Examples:

> Advances **inline SDT appearance** from Preserve+Expose to Preserve+Render+Expose.

> Advances **`w:temporary`** from absent to Preserve+Expose (importer + Document API).

> Does NOT advance to Edit or Emulate; documents `undefined` as "absent" and separately names the effective Word default.

Reviewers check the claim by spot-reading the corresponding axis in the codebase, not by inferring from the diff. Conversely, a PR that touches the painter without saying so should fail review.

## Two type concepts

`ContentControlType` is currently a single enum used in four positions: read output, list filter, create input, setType input. That conflates two things. Going forward, `controlType` has two surfaces:

| Surface | Members | Used in |
|---|---|---|
| **Recognized OOXML SDT marker** | All spec-defined type children: text, richText, date, checkbox, comboBox, dropDownList, repeatingSection, repeatingSectionItem, group, picture, equation, citation, bibliography, docPartList, plus `unknown` for truly unrecognized. | Read positions: `ContentControlInfo.controlType`, list filters, anywhere `controlType` describes what's there. |
| **Supported authorable type** | Subset of the above that SuperDoc can actually create / set via the Document API. Today: text, richText, date, checkbox, comboBox, dropDownList, repeatingSection, repeatingSectionItem, group. | Write positions: `CreateContentControlInput.controlType`, `setType` input. |

`unknown` stays reserved for "the importer saw a type child it doesn't recognize" — not for "the importer saw a known marker that SuperDoc doesn't fully model." Picture / citation / bibliography / equation / docPartList move from `'unknown'` to their spec names on the read surface as Preserve+Expose lands for each.

This is the API design risk worth fixing before more SDT API work lands on top.

## Three structural invariants

### Invariant 1: `attrs.sdtPr` is the substrate

The imported `sdtPr` element tree is stored verbatim on the PM node attrs and is the source of truth for everything we haven't explicitly typed. Typed properties are read/write *views* over it:

- **Reading** a typed property (`properties.appearance`, `properties.temporary`, etc.) parses out of `attrs.sdtPr`.
- **Writing** a typed property (typed setter or `patchRawProperties`) updates the relevant child of `attrs.sdtPr` in place. `removeSdtPrChild` / `upsertSdtPrChild` handle individual elements; everything else stays.
- The exporter reconstructs `w:id`, `w:alias`, `w:tag`, `w:lock` from current attrs (the canonical four), then appends the remaining `sdtPr` children verbatim.

A PR that rebuilds `sdtPr` from individual modeled properties — replacing the stored tree rather than patching it — loses preservation for everything not in the modeled set. That's a hard rule.

Today this invariant is honored (verified in `content-controls-wrappers.ts:1132` and `translate-structured-content.js:139`). Keep it.

### Invariant 2: properties are explicit, defaults are documented

The Document API returns recognized values verbatim. `undefined` means "the source XML did not specify this property" — NOT "this property is at its Word default."

Effective Word defaults are documented per-property in `ContentControlProperties` JSDoc and are NOT written back unless the user explicitly sets the property. Examples:

- `appearance: undefined` → effective default is `'boundingBox'`. Consumers treating the field as "absent ⇒ chrome" do the right thing without us fabricating a value.
- `temporary: undefined` → effective default is `false`.
- `showingPlcHdr: undefined` → effective default is "not showing placeholder".

This rule preserves the distinction between "the source omitted this" and "the source explicitly set the default value." Both render the same way; only the former is editable without rewriting the XML.

### Invariant 3: primitives are separate, compositions are documented

| API namespace | What it is |
|---|---|
| `editor.doc.contentControls.*` | SDT primitive. Knows nothing about custom XML parts. |
| `editor.doc.customXml.parts.*` | Storage primitive. Knows nothing about SDTs. |
| `editor.doc.customXml.refs.*` (planned, SD-3104) | **Composition** over the above two. Encapsulates the hidden-SDT-plus-custom-XML-record pattern. Documented as a composition; consumers can fall back to the primitives if they need a non-default anchor. |

A primitive operation must never depend on the existence of another primitive. A composition must never inline what a primitive should own.

This rule keeps the Harvey-style "anchor + payload" pattern from contaminating the basic content-control surface, and keeps the customXml.parts surface from accidentally growing SDT knowledge.

## How to use this document in review

When reviewing an SDT-touching PR:

1. **Read the PR description.** Does it name which level(s) it advances, for which capability? If not, ask.
2. **Check the substrate.** Does any code path replace `attrs.sdtPr` rather than patch it? If yes, the PR breaks Invariant 1.
3. **Check the default-contract phrasing.** Does new JSDoc say `'undefined means absent'` or `'undefined means default X'`? The first is correct; the second drifts from Invariant 2.
4. **Check the primitive/composition boundary.** Does a `contentControls.*` op reference `customXml.parts.*` or vice-versa? If yes, the PR breaks Invariant 3 unless explicitly part of a composition module.
5. **Check the type enum.** Does a new `controlType` member appear? If yes, the PR must specify whether it's read-only (recognized OOXML marker) or also authorable. The two are separate decisions; defaults to read-only.

## Open architecture decisions

These are the calls to make before more SDT API work lands. None block the current PRs (#3245, #3293, #3295).

1. **Split `ContentControlType` into read vs write surfaces.** Either by adding a separate `AuthorableContentControlType`, or by validating at the adapter layer when an unsupported authorable type is requested. The current single enum is the biggest API design risk.
2. **Hoist the default-contract phrasing.** Move the "undefined means absent" rule from per-property JSDoc into `ContentControlProperties` interface-level JSDoc. Per-property JSDoc keeps the effective-default note, not the rule itself.
3. **Define the lock edit policy.** The open lock bugs (SD-3124, SD-3145, SD-3132) are symptoms of not having one statement covering: metadata-only patch, content mutation, wrapper mutation, nested SDT mutation, tracked changes inside locked SDTs, user-edit vs Document-API-edit. Write the policy, file the gaps against it.

## Out of scope for this document

- Live `dataBinding` sync (Word-level behavior). Belongs in level 5; v1 of any SDT-related project explicitly stops at level 4.
- Body-level `<w:customXml>` (§17.5.1, pre-SDT XML wrapping mechanism). Distinct from SDTs; address only if the corpus turns up real-world dependence.
- Arbitrary nested-SDT authoring UX. v1 preserves nesting; authoring affordances for it are a separate product question.

## Future work

A capability matrix + Word-authored fixture corpus + parity harness would make every level-claim above measurable in CI. That work isn't required for the architecture to be right, only for "is the architecture being followed?" to be enforceable. File when the customer pull justifies it.
