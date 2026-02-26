# SuperDoc Brand Guidelines

## What SuperDoc Is

SuperDoc is a document editing and rendering library for the web. It brings native Word document fidelity to web applications — editing, viewing, and collaborating on .docx files without leaving the browser.

## Positioning

**One-liner**: High-fidelity Word document editing for the web.

**Elevator pitch**: SuperDoc lets developers embed a full-featured Word document editor in any web application. It renders .docx files with native fidelity, supports real-time collaboration, and provides an SDK for programmatic document manipulation — no server-side conversion, no format loss.

**Key differentiators**:
- Native OOXML rendering (not a PDF preview or simplified editor)
- Embeddable as a Vue or React component
- Document API for programmatic editing (AI, automation, templates)
- Real-time collaboration via Yjs
- MCP server for AI agent integration

## Voice: One Personality, Two Registers

SuperDoc is the same person in every conversation — clear, technically confident, concise. But it adjusts **what it emphasizes** based on who's listening. Developers hear about the how. Leaders hear about the why.

### Core Voice Attributes

| Attribute | Definition | Do | Don't |
|-----------|-----------|-----|-------|
| **Clear** | Plain language, no jargon unless addressing developers | "SuperDoc renders Word documents in the browser" | "Our paradigm-shifting platform leverages cutting-edge rendering" |
| **Technical** | Speak as peers, not marketers | "Uses ProseMirror under the hood with a custom rendering pipeline" | "Powered by AI-driven intelligent document processing" |
| **Confident** | State capabilities directly, no hedging | "SuperDoc handles complex tables, headers, and track changes" | "We try our best to support most document features" |
| **Concise** | Shorter is better | "Install, embed, done." | "With just a few simple steps, you'll be up and running in no time at all" |
| **Honest** | Acknowledge limitations; don't overpromise | "Some advanced VBA macros aren't supported yet" | "Works with every Word document ever created" |

### Voice Spectrum (Developer vs. Leader)

| Dimension | Developer register | Leader register |
|-----------|-------------------|-----------------|
| **Formality** | Casual-professional | Professional |
| **Technical depth** | Implementation detail | Conceptual |
| **Appeal type** | Rational (facts/proof) | Balanced (pain/relief + facts) |
| **Time horizon** | "Ship today" | "Strategy for next year" |
| **Proof style** | Code examples | Case studies & ROI |

### Same Concept, Two Registers

| Concept | Developer | Leader |
|---------|-----------|--------|
| Self-hosted | "Runs entirely in the browser. No cloud calls. Your data stays on your servers." | "Documents never leave your infrastructure. Full data sovereignty with zero cloud dependency." |
| Easy to use | "Five lines of code. Pass a file, mount the editor, done." | "Your team can ship document editing in days, not quarters. No specialized hires needed." |
| DOCX fidelity | "Built on OOXML. Real pagination, section breaks, headers/footers. Not rich text with export bolted on." | "Users see documents exactly as they look in Word. No formatting loss, no complaints, no re-work." |
| Collaboration | "Yjs-based CRDT. Add real-time editing in ~10 lines. Conflicts resolve automatically." | "Teams edit documents together in real time. Built-in conflict resolution means no lost work." |
| Open source | "AGPLv3. Read the code, fork it, contribute. Commercial license if you need proprietary." | "Open-source foundation means no vendor lock-in. Inspect the code. Switch away anytime." |
| Extensible | "60+ extensions built-in. Write your own with the plugin API. Full ProseMirror access." | "Adapts to your workflow, not the other way around. Custom extensions, branding, and integrations." |
| AI | "Bring your own LLM. AI actions with tool use — find, replace, highlight, insert. Streaming built in." | "AI-assisted document workflows with your choice of provider. Your data, your model, your infrastructure." |
| vs. competitors | "CKEditor can't do DOCX. OnlyOffice needs a server. Aspose is Java. We're JavaScript-native, browser-only." | "Replace iframe-based editors and server-side renderers with a modern, client-side component your team actually enjoys working with." |

## Universal Voice Rules

These apply everywhere, regardless of audience.

1. **Say what it does, not what it is** — "Renders DOCX files in the browser" not "an enterprise document management solution." Verbs are clear. Nouns are vague.
2. **Short sentences win** — If a sentence has a comma, try splitting it in two. If it has a semicolon, definitely split it.
3. **No buzzwords** — If it sounds like a press release, rewrite it.
4. **Show, then tell** — A code snippet or demo is always better than a paragraph. When words are needed, be specific: "5 lines" not "easy."
5. **"You" not "we"** — "Your documents stay on your servers" not "We ensure data privacy." The reader is the hero.
6. **Acknowledge trade-offs** — "SuperDoc runs client-side, so very large documents (1000+ pages) need good hardware." Honesty builds trust.
7. **Be specific with numbers** — "60+ extensions" not "many extensions." Specificity is credibility.
8. **Conversational, not chummy** — Write like you're talking to a smart colleague. Not a pitch deck and not a chat message.

## Feature Description Patterns

### Developer pattern
**Structure**: What it does → How to use it → What it saves you

> "Add document signing to your app with the esign package. Drop in the component, define your fields, and get back a signed document with a full audit trail. No need to integrate DocuSign or build signing from scratch."

### Leader pattern
**Structure**: Business problem → How SuperDoc solves it → What you no longer need

> "Document signing workflows typically mean another vendor, another contract, another per-seat fee. SuperDoc includes e-signatures with audit trails built in — one less vendor to manage, one less integration to maintain."

## Content Strategy: Where Each Register Lives

| Surface | Primary Register | Why |
|---------|-----------------|-----|
| Homepage | Developer | Most traffic from devs searching for editors. Code-forward, install-first. |
| /for-teams | Leader | Dedicated page for engineering leads. Outcome-focused, comparison-friendly. |
| Documentation | Developer | Devs live here. Clear, direct, code-forward. Respect their time. |
| GitHub README | Developer | First impression for OSS discovery. Code example in first scroll. |
| npm page | Developer | One line: what it does, for whom. |
| Blog / Changelog | Shared | Technical posts for devs, product updates for leaders. |
| Pricing page | Leader | Leaders make purchasing decisions. Clear tiers, comparison with alternatives. |
| Social / Twitter | Developer | Dev community drives word-of-mouth. Share demos, code, and shipping stories. |
| VS Code extension | Developer | Developer tool surface. Minimal, functional language. |
| CLI | Developer | Terminals are for developers. No marketing. Just clear output. |
| Sales decks | Leader | Procurement conversations. ROI, security posture, vendor comparison. |

## Quick Reference: Rewrites

| Instead of... | Write... | Why |
|---------------|----------|-----|
| "Next-generation document editor" | "A document editor for the web" | Cut the hype. Say what it is. |
| "Seamless integration" | "Five lines of code" | Specific beats vague. |
| "Enterprise-grade security" | "Self-hosted. Your documents never leave your servers." | Describe the mechanism, not the claim. |
| "Leveraging AI capabilities" | "AI that finds, replaces, and rewrites text in your documents" | Say what it does. |
| "Robust collaboration features" | "Real-time editing with Yjs. Conflicts resolve automatically." | Name the tech. Devs trust specifics. |
| "We ensure data privacy" | "Your documents stay on your servers" | "You" framing. Mechanism, not promise. |
| "Comprehensive formatting support" | "60+ extensions: tables, images, lists, tracked changes, and more" | List beats adjective. |
| "Get in touch for pricing" | "Free under AGPLv3. Commercial license starts at $X/year." | Transparency builds trust. Devs hate hidden pricing. |

## Naming Conventions

- Product name: **SuperDoc** (one word, capital S and D)
- Never: Super Doc, Superdoc, superdoc, SUPERDOC
- Packages: `superdoc` (npm), `@superdoc-dev/react`, `@superdoc/super-editor`
- CLI: `@superdoc-dev/cli`

## Banned Phrases

- "AI-powered" (unless describing actual AI features like the AI writer)
- "Revolutionary" / "game-changing" / "disrupting"
- "Seamless" (overused, says nothing)
- "Best-in-class"
- "Enterprise-grade" (show it, don't say it)
- "Cutting-edge" / "next-generation"
- "Leverage" (use "use")
- "Utilize" (use "use")
