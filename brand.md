---
name: "SuperDoc"
tagline: "The document engine for the modern web."
version: 1
language: en
---

# SuperDoc

## Strategy

### Overview

SuperDoc is a document editing and rendering engine built on native OOXML. It lets developers embed high-fidelity Word document editing in any web application — and gives AI agents full programmatic control over every element in a .docx file.

SuperDoc was born from frustration. Its founders were building a contract lifecycle management platform and needed to embed document editing. They tried every editor on the market. None could round-trip a .docx file — import it, edit it, export it — without destroying formatting. Headers broke. Tables collapsed. Tracked changes vanished. So they built their own, from scratch, with a different premise: as you type in the browser, you write directly back to the XML. No conversion layer. No fidelity loss.

What SuperDoc really does is eliminate the gap between a Word document and the web. It doesn't convert .docx to HTML and back. It reads the XML, renders it faithfully, lets you edit it, and writes clean XML back. The document stays a real document at every step.

The problem it solves is structural: every other approach to web-based document editing introduces a conversion layer — DOCX to HTML, DOCX to a proprietary format, DOCX to PDF. That conversion destroys information. Formatting breaks. Styles flatten. Round-trip fidelity is impossible. SuperDoc eliminates this by operating directly on the OOXML, maintaining 1:1 parity with the source format.

**Before SuperDoc**: Developers cobble together iframe embeds, server-side converters, or rich-text editors with bolted-on DOCX export. Documents look different in the browser than in Word. AI can't reliably edit documents. Users complain. Workarounds multiply.

**After SuperDoc**: One component. Five lines of code. Documents render exactly as they appear in Word. AI agents manipulate any element programmatically. Round-trip fidelity is a guarantee, not a hope.

**Long-term ambition**: SuperDoc becomes the default engine any platform uses to render, edit, and automate documents on the web — the way Stripe became the default for payments.

### Positioning

**Category**: Document engine for the web — rendering, editing, and programmatic automation of OOXML documents, client-side.

**What SuperDoc is NOT**:
- Not a rich-text editor with DOCX export bolted on
- Not a server-side document converter
- Not a full office suite you self-host in Docker
- Not an iframe wrapper around Microsoft's or Google's editor
- Not a PDF viewer that happens to open Word files

**Competitive landscape**:

The market has four layers:

1. **Enterprise DOCX SDKs** (Apryse, Nutrient) — Native rendering, high fidelity, but sales-gated pricing ($1,500–$76K+/year). Built as PDF toolkits first; DOCX added later.
2. **Rich-text editors** (CKEditor, Froala, TinyMCE) — HTML-first editors that convert DOCX to HTML and back. Developer-friendly pricing, but round-trip fidelity is architecturally impossible.
3. **Self-hosted office suites** (OnlyOffice, Collabora) — Full office experiences, but require heavy server infrastructure (1GB+ RAM idle). Not embeddable components.
4. **Server-side processing** (Aspose, GrapeCity) — Generate and manipulate documents on the server. No browser rendering. No editing UI.

SuperDoc sits in the gap between layers 1 and 2: native OOXML fidelity with developer-first pricing, self-serve onboarding, and no server requirement.

**Structural differentiators**:
- **OOXML-native from day one** — Not a PDF toolkit that added DOCX. Not an HTML editor that converts. Built on the XML spec.
- **Zero conversion architecture** — Editing writes directly back to XML. No intermediate format. Round-trip fidelity is structural, not aspirational.
- **Client-side only** — No server infrastructure. No Docker containers. No cloud calls. Documents never leave the user's browser.
- **AI-agent-first** — Headless mode, Document API, SDK, CLI, MCP server. Agents get the same access as the visual editor.
- **Transparent pricing** — Self-serve. No "contact sales." Open-source under AGPLv3 with a commercial license developers can buy today.

**The territory SuperDoc owns**: Document fidelity as a programmable primitive. The intersection of "renders exactly right" and "fully controllable by code."

### Personality

**Dominant archetype**: The Precision Toolmaker — builds tools so well-crafted that developers trust them with core infrastructure. Earns authority through engineering excellence and obsessive attention to detail.

**Attributes the brand transmits**:
- Precision
- Craft
- Confidence
- Transparency
- Technical depth
- Quiet authority

**What SuperDoc IS**:
- The tool that gets documents right
- Infrastructure you build on, not a product you wrestle with
- Obsessively detailed where it matters
- Opinionated about quality, flexible about integration
- The kind of library developers recommend to each other

**What SuperDoc is NOT**:
- Flashy or hype-driven
- Half-baked and shipped anyway
- A features-first, quality-second product
- A "good enough" solution
- Loud about what it will do someday instead of what it does today

### Promise

SuperDoc renders your documents exactly as they appear in Word.
SuperDoc gives you full programmatic control over every element in a .docx file.
SuperDoc runs entirely in the browser — your documents never leave your infrastructure.

**Base message**: SuperDoc is the document engine that gets .docx files right — pixel-perfect rendering, full programmatic control, zero server infrastructure.

**Synthesizing phrase**: SuperDoc exists so documents on the web can finally be real documents.

### Guardrails

**Tone summary**: Clear. Technical. Confident. Concise. Honest.

**What the brand cannot be**:
- A marketing-first company that ships demos better than products
- A "platform" that locks developers into proprietary formats
- An enterprise vendor that hides pricing behind sales calls
- A company that claims features it hasn't built yet
- A tool that's impressive in demos but breaks on real documents

**Litmus test**: If it sounds like a press release, it's wrong. If it sounds like a smart colleague explaining their favorite library, it's right.

---

## Voice

### Identity

We build document infrastructure. Not an editor widget. Not a SaaS platform. A rendering and editing engine that developers embed in their own products.

We started building SuperDoc because every document editor we tried broke our documents. Import a contract with tracked changes, complex tables, and headers — export it — and half the formatting is gone. That's not a minor inconvenience. That's a broken tool. We decided to fix it by building on OOXML directly, with no conversion layer, no intermediate format, no shortcuts that trade fidelity for convenience.

We care about craft the way a toolmaker cares about tolerances. Every pixel of rendering, every round-trip of a document, every API surface — it matters. We'd rather ship one feature that works perfectly than five that work mostly. If we haven't built it yet, we'll say so. If it has limitations, we'll document them. We don't overpromise and we don't ship half-baked.

**Essence**: Document fidelity, fully programmable.

### Tagline & Slogans

**Primary tagline**: The document engine for the modern web.
_Use on homepage hero, social bios, pitch decks._

**Alternatives**:
- Real documents. Real editing. No conversion.
- The OOXML engine developers trust.
- Documents, exactly right.

**Slogans for different contexts**:
- Developer landing page: "Five lines of code. Pixel-perfect documents."
- AI/agent context: "Give your agents hands-on access to Word documents."
- Self-hosting pitch: "Your documents. Your servers. Zero cloud calls."
- Fidelity pitch: "Import it. Edit it. Export it. Nothing lost."
- Open-source context: "Read the code. Fork it. Ship it."

### Manifesto

Every document editor on the web makes a compromise.

Some convert your .docx to HTML and hope for the best. Some require a server farm to render a single page. Some hide behind iframes and call it "embedding."

We refused to compromise.

We built SuperDoc directly on OOXML — the same XML that Word reads and writes. No conversion layer. No intermediate format. No shortcuts.

When you type in SuperDoc, you're writing to the XML. When you export, the document is the same document. Headers intact. Tables intact. Tracked changes intact.

This is not a technical detail. This is the entire point.

We believe documents on the web should be real documents — not approximations, not previews, not "close enough."

We believe developers deserve tools that work the way they expect — install, embed, done. Not "contact sales." Not "schedule a demo." Not "deploy a Docker container."

We believe AI agents should have the same access to a document that a human editor has — every paragraph, every style, every tracked change, programmable through a clean API.

We build for developers who care about getting it right.

One document at a time.

**SuperDoc.**

### Message Pillars

**Fidelity**
- Documents render exactly as they appear in Word. Not approximately. Exactly.
- Round-trip is a guarantee: import, edit, export — nothing lost.

**Control**
- Full programmatic access to every element in a .docx file.
- API, SDK, CLI, MCP server — choose your interface. Same engine underneath.

**Sovereignty**
- Runs entirely client-side. Documents never leave your infrastructure.
- Self-hosted. No cloud dependency. No phone-home.

**Craft**
- We'd rather ship one feature that works perfectly than five that work mostly.
- Every detail matters — rendering, API surface, documentation, developer experience.

**Openness**
- AGPLv3 open source. Read the code. Contribute. Fork.
- Transparent pricing. No "contact sales."

### Phrases

- "Import it. Edit it. Export it. Nothing lost."
- "As you type, you write to the XML."
- "Your documents never leave your servers."
- "Five lines of code. Real documents."
- "We don't convert. We render."
- "The same engine — visual or headless."
- "Built on OOXML. Not bolted onto HTML."
- "If it breaks your document, it's a bug. We fix bugs."

### Social Bios

**LinkedIn**:
SuperDoc is the document engine for the modern web. We render and edit .docx files with native OOXML fidelity — no conversion, no server infrastructure, no compromises. Embed real document editing in any web application with five lines of code. Give AI agents full programmatic control over Word documents. Open source under AGPLv3.

**Instagram**:
- Document engine for the modern web
- Native OOXML rendering & editing
- Self-hosted. Zero cloud dependency.
- Open source (AGPLv3)
- superdoc.dev

**X/Twitter**:
The document engine for the modern web. Native OOXML rendering. Full programmatic control. No conversion. No server. Open source.

**Website (footer/about)**:
SuperDoc is a document rendering and editing engine built on native OOXML. It lets developers embed high-fidelity Word document editing in any web application — and gives AI agents full programmatic control over every element in a .docx file. Open source under AGPLv3.

### Tonal Rules

1. Say what it does, not what it is. Verbs over nouns. "Renders DOCX files" not "a document management solution."
2. Short sentences. If there's a comma, try splitting it. If there's a semicolon, definitely split it.
3. No buzzwords. If it sounds like a press release, rewrite it.
4. Show first, tell second. A code snippet beats a paragraph. A demo beats a page.
5. "You" not "we." The developer is the hero. "Your documents stay on your servers."
6. Be specific with numbers. "60+ extensions" not "many." "Five lines of code" not "easy integration."
7. Name the technology. "Yjs-based CRDT" not "advanced collaboration technology."
8. Acknowledge trade-offs. Honesty is a competitive advantage. "Some advanced VBA macros aren't supported yet."
9. Conversational, not chummy. Smart colleague, not pitch deck, not group chat.
10. Calm confidence. Never defensive. Never boastful. State facts and let them speak.
11. Mechanism over claim. "Self-hosted — documents never leave your servers" not "enterprise-grade security."
12. One idea per sentence. Density is fine. Confusion is not.

**Identity boundaries**:
- We are not a marketing company that happens to write code.
- We are not a startup that ships demos and promises the product is coming.
- We are not a vendor that hides pricing behind sales calls.
- We are not a "platform" — we are a tool. Developers build platforms. We build the tool they use.
- We are not in the business of being impressive. We are in the business of being correct.

| We Say | We Never Say |
|---|---|
| "Renders DOCX files in the browser" | "AI-powered document management solution" |
| "Five lines of code" | "Seamless integration" |
| "Your documents stay on your servers" | "Enterprise-grade security" |
| "Built on OOXML" | "Next-generation document technology" |
| "Import, edit, export — nothing lost" | "Robust round-trip capabilities" |
| "60+ extensions" | "Comprehensive feature set" |
| "We haven't built that yet" | "Coming soon to our roadmap" |
| "Self-hosted. No cloud calls." | "Leveraging edge computing for data sovereignty" |

---

## Visual

### Colors

**Primary — SuperDoc Blue**
`#1355FF` (blue-500) — Signature color. Buttons, links, active states, CTAs.

**Primary hover**
`#0F44CC` (blue-600) — Interactive hover states.

**Supporting palette**:
| Role | Hex | Usage |
|---|---|---|
| Error | `#ED4337` | Error states, destructive actions |
| Success | `#00853D` | Confirmations, insertions |
| Deletion | `#CB0E47` | Tracked change deletions |
| Text primary | `#212121` | Headings, body copy |
| Text secondary | `#666666` | Supporting text, metadata |
| Border | `#DBDBDB` | Dividers, input borders |
| Background | `#FFFFFF` | Document pages |
| Canvas | `#FAFAFA` | Behind document pages |
| Dark surface | `#0B0C10` | Marketing dark mode |

**Colors to avoid**: Neon greens, oranges, or any saturated warm colors as primary UI elements. SuperDoc's palette is cool and precise — blue anchored, neutral supported.

### Typography

**Display / UI — Inter**
Weights: Regular (400), Medium (500), Semibold (600), Bold (700)
Usage: All interface text, marketing copy, documentation, headings.

**Monospace — JetBrains Mono**
Weight: Regular (400)
Usage: Code snippets, CLI output, API references, technical specifications.

| Level | Size | Weight | Context |
|---|---|---|---|
| Hero | 48px | Bold | Marketing hero only |
| Page heading | 36px | Bold | Top-level titles |
| Section heading | 24px | Semibold | Major sections |
| Subsection | 20px | Semibold | Within sections |
| Body | 16px | Regular | Default text |
| Small | 14px | Regular | Metadata, secondary |
| Caption | 12px | Regular | Labels, fine print |

### Photography

**Mood**: Clean, focused, precise, technical, warm lighting on cool surfaces.

**Subjects**: Developer workspaces. Clean screens showing real documents. Close-ups of code. Hands on keyboards. Real working environments — not stock photos of people pointing at whiteboards.

**Avoid**: Generic stock photography. Groups of people in suits. Abstract tech imagery (glowing circuits, floating holograms). Anything that looks like it belongs on a consulting firm's website.

### Style

**Design keywords**: Precise. Clean. Systematic. Functional. Confident. Restrained.

**Reference brands**: Resend (developer-first clarity), Linear (obsessive craft), Vercel (infrastructure confidence).

**Direction**: The visual identity communicates engineering precision, not marketing polish. Flat surfaces, clear hierarchy, generous whitespace. The product should look like it was designed by someone who cares about type rendering and pixel alignment — because it was. No decoration without function. No gradients in the product UI (reserved for marketing). The confidence comes from restraint.

**Marketing gradient** (hero/landing pages only):
```css
background: radial-gradient(
  circle at -40% -70%,
  #1355ff, #8968f633, #b785f140, #fcd36152,
  #e8caec00, #f1e0f073, #f1e0f0, #f5f5fa, #f5f5fa
);
```

**Gradient text** (marketing emphasis):
- Light: `linear-gradient(to right, #2563eb, #9333ea)`
- Dark: `linear-gradient(to right, #60a5fa, #c084fc)`
