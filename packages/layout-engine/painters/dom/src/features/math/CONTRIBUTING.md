# Contributing a Math Object Converter

SuperDoc converts Office Math (OMML) XML into browser-native MathML. The rendering pipeline is built. What's missing: individual converters for each of the 18 OMML math object types.

One converter = one function (~20 lines). It transforms a single OMML element into MathML DOM nodes. No schema changes. No adapter changes. No exporter changes. One file, two one-line registrations, a test.

## How the pipeline works

When SuperDoc opens a .docx with math, the equation's XML is stored as a JSON tree on the document node. At render time, the DomPainter calls `convertOmmlToMathml()`, which walks the tree and checks a **registry** for each element:

```
OMML JSON tree
     │
     ▼
convertOmmlToMathml()
     │
     ├── m:r (math run)  → convertMathRun()   → <mi>, <mo>, <mn>
     ├── m:f (fraction)   → convertFraction()  → <mfrac>
     ├── m:sSup (super)   → you write this      → <msup>
     ├── m:rad (radical)  → you write this      → <msqrt>
     └── ...
     │
     ▼
  <math> element (browser renders it natively)
```

If a converter exists in the registry, it's called. If not (`null`), the engine falls back to extracting the text content — so unimplemented objects degrade gracefully instead of crashing.

## The converter interface

Every converter has the same signature:

```typescript
type MathObjectConverter = (
  node: OmmlJsonNode,       // The OMML element (e.g., an m:sSup node)
  doc: Document,            // For creating DOM elements
  convertChildren: (children: OmmlJsonNode[]) => DocumentFragment,
                             // Recursively converts nested OMML content
) => Element | null;
```

`convertChildren` is the important one. Pass it any child elements that contain nested math content (`m:e`, `m:num`, `m:sub`, etc.). It handles everything inside them, including other math objects.

## Reference implementation: fraction

The complete `fraction.ts` converter. Every converter follows this pattern:

```typescript
import type { MathObjectConverter } from '../types.js';

const MATHML_NS = 'http://www.w3.org/1998/Math/MathML';

export const convertFraction: MathObjectConverter = (node, doc, convertChildren) => {
  const elements = node.elements ?? [];

  // 1. Find the OMML child elements you need
  const num = elements.find((e) => e.name === 'm:num');
  const den = elements.find((e) => e.name === 'm:den');

  // 2. Create the MathML element
  const frac = doc.createElementNS(MATHML_NS, 'mfrac');

  // 3. Convert children recursively and append
  frac.appendChild(convertChildren(num?.elements ?? []));
  frac.appendChild(convertChildren(den?.elements ?? []));

  return frac;
};
```

That's it. Find the OMML children, create the MathML element, convert nested content with `convertChildren`, return.

## Step-by-step: adding a new converter

Let's say you're implementing `m:sSup` (superscript) → `<msup>`.

### 1. Create the converter file

`converters/superscript.ts`:

```typescript
import type { MathObjectConverter } from '../types.js';

const MATHML_NS = 'http://www.w3.org/1998/Math/MathML';

export const convertSuperscript: MathObjectConverter = (node, doc, convertChildren) => {
  const elements = node.elements ?? [];
  const base = elements.find((e) => e.name === 'm:e');
  const sup = elements.find((e) => e.name === 'm:sup');

  const msup = doc.createElementNS(MATHML_NS, 'msup');
  msup.appendChild(convertChildren(base?.elements ?? []));
  msup.appendChild(convertChildren(sup?.elements ?? []));

  return msup;
};
```

### 2. Export from the barrel file

`converters/index.ts` — add one line:

```typescript
export { convertMathRun } from './math-run.js';
export { convertFraction } from './fraction.js';
export { convertSuperscript } from './superscript.js';  // ← add this
```

### 3. Register in the registry

`omml-to-mathml.ts` — two changes:

```typescript
// Add to imports
import { convertMathRun, convertFraction, convertSuperscript } from './converters/index.js';

// Change null → your converter in the registry
'm:sSup': convertSuperscript,  // was: null
```

### 4. Add a test

`omml-to-mathml.test.ts` — add a test case:

```typescript
it('converts m:sSup to <msup>', () => {
  const omml = {
    name: 'm:oMath',
    elements: [
      {
        name: 'm:sSup',
        elements: [
          { name: 'm:e', elements: [{ name: 'm:r', elements: [{ name: 'm:t', elements: [{ type: 'text', text: 'x' }] }] }] },
          { name: 'm:sup', elements: [{ name: 'm:r', elements: [{ name: 'm:t', elements: [{ type: 'text', text: '2' }] }] }] },
        ],
      },
    ],
  };

  const result = convertOmmlToMathml(omml, doc);
  expect(result).not.toBeNull();

  const msup = result!.querySelector('msup');
  expect(msup).not.toBeNull();
  expect(msup!.children.length).toBe(2);
  expect(msup!.children[0]!.textContent).toBe('x');
  expect(msup!.children[1]!.textContent).toBe('2');
});
```

### 5. Verify with the test document

Each Linear issue has a `.docx` test file attached. Download it, upload to the SuperDoc dev app, and confirm your equation renders correctly in the browser.

## OMML structure reference

Every OMML math object follows the same pattern:

```xml
<m:OBJECT_NAME>
  <m:OBJECT_NAMEPr>   <!-- Properties (optional) — skipped automatically -->
    ...
  </m:OBJECT_NAMEPr>
  <m:ARGUMENT_1>       <!-- Named child elements containing math content -->
    <m:r><m:t>...</m:t></m:r>
  </m:ARGUMENT_1>
  <m:ARGUMENT_2>
    ...
  </m:ARGUMENT_2>
</m:OBJECT_NAME>
```

Property elements (ending in `Pr`) are skipped by the engine. You only need to handle the argument elements — and `convertChildren` takes care of whatever's inside them.

The ECMA-376 spec section for each object is listed in the Linear issue. Key argument element names used across objects:

| OMML element | Purpose |
|---|---|
| `m:e` | Base expression (used by most objects) |
| `m:num` | Numerator (fractions) |
| `m:den` | Denominator (fractions) |
| `m:sub` | Subscript content |
| `m:sup` | Superscript content |
| `m:deg` | Degree (radicals) |
| `m:lim` | Limit expression |
| `m:fName` | Function name |

## File locations

```
packages/layout-engine/painters/dom/src/features/math/
├── CONTRIBUTING.md          ← you are here
├── types.ts                 ← OmmlJsonNode, MathObjectConverter types
├── omml-to-mathml.ts        ← registry + core converter
├── omml-to-mathml.test.ts   ← tests
└── converters/
    ├── index.ts             ← barrel exports
    ├── math-run.ts          ← m:r → <mi>/<mo>/<mn> (leaf nodes)
    └── fraction.ts          ← m:f → <mfrac> (reference implementation)
```

## Tips

- **Read the properties element** when you need to customize behavior. `m:radPr` has `m:degHide` to control whether the degree shows on a radical. Access it with `elements.find(e => e.name === 'm:radPr')`.
- **Use `convertChildren` for everything nested.** Don't manually walk child trees. The callback handles all recursive conversion, including other math objects.
- **Return `null` if the node can't be converted.** The engine falls back to text extraction.
- **MathML reference**: [MDN MathML elements](https://developer.mozilla.org/en-US/docs/Web/MathML/Element) — check expected children and attributes for your target element.
- **Inspect the OMML directly.** The test document attached to each issue contains exactly the element you're implementing. Open the `.docx` as a ZIP and read `word/document.xml`.
