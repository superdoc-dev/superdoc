---
name: brand-guidelines
description: Enforces SuperDoc brand voice, visual identity, and design tokens. Use when writing copy, creating UI components, reviewing content for brand consistency, or generating marketing materials.
---

# SuperDoc Brand Guidelines

Apply SuperDoc's brand identity to all content and UI work.

## Core Principle: One Personality, Two Registers

SuperDoc is clear, technically confident, and concise everywhere. It adjusts emphasis by audience:
- **Developer register**: Lead with implementation, prove with code, emphasize speed-to-ship
- **Leader register**: Lead with business outcome, prove with case studies, emphasize what they no longer need

## Product Name

Always "SuperDoc" (capital S, capital D). Never: Super Doc, Superdoc, superdoc, SUPERDOC.

## Primary Color

`#1355FF` (SuperDoc Blue). Full scale in `packages/superdoc/src/assets/styles/tokens.css`.

## Typography

- UI/marketing: Inter (400, 500, 600, 700)
- Code: JetBrains Mono (400)

## Universal Voice Rules

1. Say what it does, not what it is — verbs over nouns
2. Short sentences win — split at commas
3. No buzzwords — if it sounds like a press release, rewrite
4. Show, then tell — code snippet > paragraph
5. "You" not "we" — the reader is the hero
6. Acknowledge trade-offs — honesty builds trust
7. Be specific with numbers — "60+ extensions" not "many"
8. Conversational, not chummy — smart colleague, not pitch deck

## Developer Copy Pattern

**Structure**: What it does → How to use it → What it saves you
- Lead with the developer's problem or goal
- Include code or an install command near the top
- End with how fast they can start

## Leader Copy Pattern

**Structure**: Business problem → How SuperDoc solves it → What you no longer need
- Lead with the business outcome or strategic advantage
- Describe what they're replacing or consolidating
- End with proof of credibility (open source, licensing clarity)

## Banned Phrases

Never use: "AI-powered" (unless actual AI features), "revolutionary", "game-changing", "seamless", "best-in-class", "enterprise-grade", "cutting-edge", "leverage", "utilize".

## Quick Rewrites

| Instead of... | Write... |
|---------------|----------|
| "Next-generation document editor" | "A document editor for the web" |
| "Seamless integration" | "Five lines of code" |
| "Enterprise-grade security" | "Self-hosted. Your documents never leave your servers." |
| "Leveraging AI capabilities" | "AI that finds, replaces, and rewrites text in your documents" |
| "We ensure data privacy" | "Your documents stay on your servers" |

## Design Tokens

All color, spacing, and typography values are defined in `packages/superdoc/src/assets/styles/tokens.css` as `--sd-*` CSS custom properties. Use semantic tokens (`--sd-action-primary`, `--sd-surface-card`) — never hardcode hex values in components.

## When Building UI

1. Reference semantic tokens (e.g., `action.primary` not `#1355FF`)
2. Use Inter for all text, JetBrains Mono for code
3. Follow the spacing scale (4px grid)
4. Blue = interactive, Red = error, Green = success
5. No gradients in product UI (reserved for marketing)

## Reference Files

- `brand/brand-guidelines.md` — Full voice guide with dual registers, spectrum, and examples
- `brand/visual-identity.md` — Logo, colors, typography, surfaces
- `packages/superdoc/src/assets/styles/tokens.css` — All design token values as CSS custom properties
