# @superdoc-testing/harness

Configurable Vue test harness for SuperDoc visual testing.

## Overview

This harness provides a flexible way to load and configure SuperDoc for visual regression testing. All configuration is passed via URL parameters, making tests self-documenting and easy to debug.

## Usage

### Development

```bash
# From repo root
pnpm install
pnpm dev

# Or from packages/harness
cd packages/harness
pnpm install
pnpm dev
```

Then open `http://localhost:9989` with query parameters.

### URL Parameters

| Parameter | Values | Default | Description |
|-----------|--------|---------|-------------|
| `layout` | `0`, `1` | `1` (on) | Layout engine mode (use `0` to disable) |
| `toolbar` | `none`, `minimal`, `full` | `none` | Toolbar display mode |
| `comments` | `off`, `on`, `panel`, `readonly` | `off` | Comments module mode |
| `trackChanges` | `0`, `1` | `0` | Enable track changes |
| `width` | number | `1600` | Viewport width |
| `height` | number | `1200` | Viewport height |
| `fonts` | `0`, `1` | `0` | Wait for fonts to resolve before ready |
| `hideCaret` | `0`, `1` | `1` | Hide caret for visual testing |
| `hideSelection` | `0`, `1` | `1` | Hide selection for visual testing |
| `caretBlink` | `0`, `1` | `0` | Enable caret blinking |
| `extensions` | comma-separated | none | Custom extensions to load |

### Example URLs

```
# Default (layout engine on)
http://localhost:9989

# With comments panel open
http://localhost:9989?comments=panel

# Full toolbar
http://localhost:9989?toolbar=full

# Disable layout engine
http://localhost:9989?layout=0

# Custom viewport
http://localhost:9989?width=1200&height=800

# Show caret and selection (for interaction testing)
http://localhost:9989?hideCaret=0&hideSelection=0

# Show caret with blinking (for interaction testing)
http://localhost:9989?hideCaret=0&hideSelection=0&caretBlink=1
```

## Window API

The harness exposes several objects on `window` for test automation:

| Property | Description |
|----------|-------------|
| `window.superdoc` | SuperDoc instance |
| `window.editor` | Active ProseMirror editor |
| `window.fileData` | Currently loaded file |
| `window.harnessConfig` | Parsed configuration object |
| `window.superdocReady` | Boolean, true when SuperDoc is ready |
| `window.onTransaction()` | Callback on document changes |
| `window.onFontsResolved()` | Callback when fonts resolve |

## Programmatic Configuration

For test scripts, use the config parser utilities:

```typescript
import { buildUrl, parseConfig, describeConfig } from './src/config-parser';

// Build a URL for a specific test
const url = buildUrl('http://localhost:9989', {
  comments: 'panel',
  hideCaret: false,
});
// → 'http://localhost:9989?comments=panel&hideCaret=0'

// Parse config from URL
const config = parseConfig('?layout=1&comments=on');
// → { layout: true, comments: 'on', toolbar: 'none', ... }

// Get a description for test naming
const desc = describeConfig(config);
// → 'layout-engine_comments-on'
```

## Architecture

```
packages/harness/
├── src/
│   ├── App.vue           # Main Vue component (TypeScript)
│   ├── config-parser.ts  # URL param parsing + utilities
│   ├── main.ts           # Vue entry point
│   └── style.css         # Global styles
├── index.html
├── vite.config.ts
└── package.json
```

