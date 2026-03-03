# SuperDoc Brand

Brand identity, voice guidelines, and visual rules for SuperDoc.

## Structure

```
brand/
  brand-guidelines.md   Voice, tone, positioning, and content patterns
  visual-identity.md    Logo usage, color meanings, and visual do's/don'ts
  assets/
    logos/               Logo files
```

## Design tokens

Token values live in `packages/superdoc/src/assets/styles/tokens.css` as CSS custom properties (`--sd-*`). That file is the single source of truth.

Tokens follow three tiers:
- **Primitive** (`--sd-color-blue-500`) — raw palette values
- **Semantic** (`--sd-action-primary`, `--sd-surface-card`) — UI roles that reference primitives
- **Component** (`--sd-comment-bg`) — component-specific overrides that reference semantic tokens

Consumers customize SuperDoc by overriding `--sd-*` variables in their own CSS. Component customization is documented at `apps/docs/ui-components/`.

## How to use

**For development**: Use semantic or component tokens in CSS — never hardcode hex values. When adding a new UI component, expose its visual properties as `--sd-{component}-*` variables in `tokens.css`.

**For marketing/content**: See `brand-guidelines.md` for voice, tone, and the dual-register pattern (developer vs. leader).
