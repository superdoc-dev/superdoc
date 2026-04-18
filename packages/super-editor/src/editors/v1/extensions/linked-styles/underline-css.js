// @ts-check

/**
 * Map OOXML underline types to CSS text-decoration properties.
 * Returns a CSS style string (kebab-case) suitable for inline decorations.
 *
 * @param {Object} params
 * @param {string} [params.type='single'] - OOXML w:u@w:val value
 * @param {string|null} [params.color=null] - CSS color (e.g., '#RRGGBB')
 * @param {string|null} [params.thickness=null] - Optional explicit thickness (e.g., '0.2em', '2px')
 * @param {boolean} [params.approximate=true] - Whether to approximate non-standard styles
 * @returns {string} CSS style string (e.g., 'text-decoration-line: underline; text-decoration-style: dashed;')
 */
export function getUnderlineCssString({ type = 'single', color = null, thickness = null, approximate = true } = {}) {
  const parts = [];

  const add = (k, v) => {
    if (!v) return;
    parts.push(`${k}: ${v}`);
  };

  const lower = String(type || 'single').toLowerCase();

  if (lower === 'none' || lower === '0') {
    add('text-decoration', 'none');
    return parts.join('; ');
  }

  // Always underline the line, unless 'none'
  add('text-decoration-line', 'underline');

  // Map style variants
  const HEAVY = thickness || '0.2em';
  const THICK = thickness || '0.15em';

  switch (lower) {
    case 'single':
      // default, no extra
      break;
    case 'double':
      add('text-decoration-style', 'double');
      break;
    case 'thick':
      add('text-decoration-thickness', THICK);
      break;
    case 'dotted':
      add('text-decoration-style', 'dotted');
      break;
    case 'dash':
    case 'dashed':
      add('text-decoration-style', 'dashed');
      break;
    case 'dotdash':
    case 'dotdotdash':
    case 'dashlong':
    case 'dashlongheavy':
      if (approximate) {
        add('text-decoration-style', 'dashed');
        if (lower.includes('heavy')) add('text-decoration-thickness', HEAVY);
      }
      break;
    case 'dottedheavy':
      add('text-decoration-style', 'dotted');
      add('text-decoration-thickness', HEAVY);
      break;
    case 'dashedheavy':
      add('text-decoration-style', 'dashed');
      add('text-decoration-thickness', HEAVY);
      break;
    case 'wavy':
      add('text-decoration-style', 'wavy');
      break;
    case 'wavyheavy':
      add('text-decoration-style', 'wavy');
      add('text-decoration-thickness', HEAVY);
      break;
    case 'wavydouble':
      if (approximate) {
        add('text-decoration-style', 'wavy');
        add('text-decoration-thickness', HEAVY);
      }
      break;
    case 'words':
      // No cross-browser mapping; keep underline and let the browser handle default spacing
      break;
    default:
      // Unknown types: keep basic underline
      break;
  }

  if (color) add('text-decoration-color', color);

  return parts.join('; ');
}
