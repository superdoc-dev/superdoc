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

Token defaults live in `packages/superdoc/src/assets/styles/helpers/variables.css` as CSS custom properties (`--sd-*`).
Preset theme overrides live in `packages/superdoc/src/assets/styles/helpers/themes.css`.
Together, these files are the design-token source of truth.

Tokens are organized by layers:
- **Primitive** (`--sd-color-blue-500`, `--sd-font-size-400`, `--sd-radius-100`) — raw design values
- **UI/Document semantic** (`--sd-ui-*`, `--sd-comments-*`, `--sd-tracked-changes-*`, `--sd-layout-*`) — role-based tokens used by components and rendering layers
- **Component-level (optional)** (`--sd-ui-{component}-*`) — local overrides for a specific UI component when cross-component tokens are not enough

Consumers customize SuperDoc by overriding `--sd-*` variables in their own CSS.

## How to use

**For development**: Use semantic or component tokens in CSS — never hardcode hex values. When adding a new UI component, expose its visual properties as `--sd-ui-{component}-*` variables in `variables.css`; add per-theme overrides in `themes.css` only when needed.

**For marketing/content**: See `brand-guidelines.md` for voice, tone, and the dual-register pattern (developer vs. leader).
