# SuperDoc Visual Identity

## Primary Color: SuperDoc Blue

`#1355FF` — This is SuperDoc's signature color. It's a vivid, saturated blue that conveys precision and trust.

### Usage rules
- **Primary buttons and CTAs** always use SuperDoc Blue
- **Active/selected states** use SuperDoc Blue or its lighter tints
- **Links** default to SuperDoc Blue
- **Never use blue for error states** — red is for errors, green for success
- **Don't place blue text on blue backgrounds** — maintain contrast

### Color scale
See `packages/superdoc/src/assets/styles/tokens.css` for the full blue scale (`--sd-color-blue-50` through `--sd-color-blue-900`). The scale moves from near-white (#EBF0FF) to near-black (#041133), with 500 being the canonical brand color.

## Logo

- Logo files are in `assets/logos/`
- The logo is the stylized "SuperDoc" wordmark
- **Minimum clear space**: Half the height of the logo on all sides
- **Minimum size**: 80px wide for digital, 20mm for print
- **On dark backgrounds**: Use the white/light variant
- **On light backgrounds**: Use the dark/primary variant

### Don'ts
- Don't rotate or skew the logo
- Don't change the logo colors to non-brand colors
- Don't add effects (shadows, gradients, outlines) to the logo
- Don't place the logo on busy/patterned backgrounds without a container
- Don't stretch or distort the aspect ratio

## Typography

**Primary typeface**: Inter
- Clean, highly legible, designed for screens
- Use for all UI text, marketing copy, and documentation
- Available weights: Regular (400), Medium (500), Semibold (600), Bold (700)

**Monospace typeface**: JetBrains Mono
- Use for code snippets, CLI commands, and technical references
- Use Regular (400) weight only

### Hierarchy
| Level | Size | Weight | Use |
|-------|------|--------|-----|
| Hero heading | 48px | Bold | Marketing hero sections only |
| Page heading | 36px | Bold | Top-level page titles |
| Section heading | 24px | Semibold | Major content sections |
| Subsection | 20px | Semibold | Within-section headings |
| Body | 16px | Regular | Default text |
| Small | 14px | Regular | Secondary text, metadata |
| Caption | 12px | Regular | Labels, fine print |

## Color Palette Summary

| Role | Token | Value | When to use |
|------|-------|-------|-------------|
| Primary | `blue.500` | #1355FF | Buttons, links, active states |
| Primary hover | `blue.600` | #0F44CC | Button hover |
| Error | `red.500` | #ED4337 | Error messages, destructive actions |
| Success | `green.500` | #00853D | Success states, insertions |
| Deletion | `rose.500` | #CB0E47 | Track-changes deletions |
| Border | `gray.400` | #DBDBDB | Input borders, dividers |
| Text primary | `gray.900` | #212121 | Headings, body text |
| Text secondary | `gray.700` | #666666 | Descriptions, supporting text |
| Background | `white` | #FFFFFF | Document pages |
| Canvas | `gray.50` | #FAFAFA | Behind document pages |

## Surfaces & Elevation

SuperDoc uses a flat design language with subtle elevation cues:

- **Document pages**: White with a subtle box shadow (`0 4px 20px rgba(15, 23, 42, 0.08)`)
- **Toolbars**: White/light background, bottom border for separation
- **Modals**: White with medium shadow, semi-transparent backdrop
- **Dropdowns**: White with border and small shadow

No heavy shadows, no gradients on UI elements (gradients are reserved for marketing).

## Dark Mode

Dark mode is currently used on the homepage/marketing site. The product UI is light-only.

Dark mode token overrides are documented in `packages/superdoc/src/assets/styles/tokens.css`.

Key principle: dark backgrounds (#0B0C10) with reduced-brightness text (#E8E8E8), not pure white on pure black.

## Marketing-Specific

### Gradient
The "super-gradient" is a radial gradient used on the marketing site hero:
```css
background: radial-gradient(
  circle at -40% -70%,
  #1355ff, #8968f633, #b785f140, #fcd36152,
  #e8caec00, #f1e0f073, #f1e0f0, #f5f5fa, #f5f5fa
);
```
This gradient is for marketing use only — don't use it in the product UI.

### Gradient text
Blue-to-purple gradient for emphasis text on marketing pages:
- Light: `linear-gradient(to right, #2563eb, #9333ea)`
- Dark: `linear-gradient(to right, #60a5fa, #c084fc)`

## Iconography

- Use Lucide icons as the default icon set
- Icons should be 16px (inline), 20px (UI), or 24px (standalone)
- Match icon stroke color to adjacent text color
- Don't mix icon sets within the same interface
