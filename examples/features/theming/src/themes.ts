import { createTheme } from 'superdoc';

export const themes = {
  default: null,

  indigo: createTheme({
    name: 'indigo',
    font: 'Inter, system-ui, sans-serif',
    radius: '8px',
    colors: {
      action: '#6366f1',
      actionHover: '#4f46e5',
      bg: '#ffffff',
      text: '#1e293b',
      textMuted: '#64748b',
      border: '#e2e8f0',
      hoverBg: '#f1f5f9',
    },
    vars: {
      '--sd-ui-toolbar-bg': '#f8fafc',
    },
  }),

  dark: createTheme({
    name: 'dark',
    font: 'Inter, system-ui, sans-serif',
    colors: {
      bg: '#1a1a2e',
      hoverBg: '#2a2a3e',
      activeBg: '#3a3a4e',
      text: '#e2e8f0',
      textMuted: '#94a3b8',
      textDisabled: '#64748b',
      border: '#334155',
      action: '#60a5fa',
      actionHover: '#93c5fd',
    },
    vars: {
      '--sd-ui-toolbar-bg': '#0f172a',
      '--sd-ui-toolbar-button-text': '#e2e8f0',
      '--sd-ui-dropdown-bg': '#1e293b',
      '--sd-ui-dropdown-border': '#334155',
      '--sd-ui-menu-bg': '#1e293b',
      '--sd-ui-menu-border': '#334155',
      '--sd-ui-comments-card-bg': '#1e293b',
      '--sd-ui-comments-input-bg': '#1e293b',
      '--sd-ui-comments-body-text': '#cbd5e1',
      '--sd-ui-tooltip-bg': '#f1f5f9',
      '--sd-ui-tooltip-text': '#1e293b',
      '--sd-layout-page-shadow': '0 4px 20px rgba(0, 0, 0, 0.4)',
    },
  }),

  warm: createTheme({
    name: 'warm',
    font: 'Georgia, serif',
    radius: '4px',
    colors: {
      action: '#b45309',
      actionHover: '#92400e',
      bg: '#fffbeb',
      hoverBg: '#fef3c7',
      activeBg: '#fde68a',
      text: '#451a03',
      textMuted: '#78350f',
      border: '#d97706',
    },
    vars: {
      '--sd-ui-toolbar-bg': '#fef3c7',
      '--sd-ui-comments-card-bg': '#fef9e7',
    },
  }),
} as const;

export const presets = {
  'preset-docs': 'sd-theme-docs',
  'preset-word': 'sd-theme-word',
  'preset-blueprint': 'sd-theme-blueprint',
} as const;

export type ThemeKey = keyof typeof themes | keyof typeof presets;

export const themeLabels: Record<ThemeKey, string> = {
  default: 'Default',
  indigo: 'Indigo Brand',
  dark: 'Dark',
  warm: 'Warm Earth',
  'preset-docs': 'Preset: Docs',
  'preset-word': 'Preset: Word',
  'preset-blueprint': 'Preset: Blueprint',
};
