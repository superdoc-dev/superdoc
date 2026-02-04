/**
 * HTML report generation for visual testing comparisons.
 * Generates an interactive report with image diffing, approval workflow, and filtering.
 */

import fs from 'node:fs';
import path from 'node:path';

import type { ComparisonReport } from './compare.js';

/**
 * Options for HTML report generation.
 */
export interface HtmlReportOptions {
  /** Include passing results in the report (default: false, diffs only) */
  showAll?: boolean;
  /** Report mode: 'visual' for document screenshots, 'interactions' for interaction stories */
  mode?: 'visual' | 'interactions';
  /** Output filename (default: 'report.html') */
  reportFileName?: string;
  /** Prefix to trim from displayed paths */
  trimPrefix?: string;
}

/**
 * Try to load a logo image and convert it to a data URI.
 * Searches for logo in multiple locations: env var, cwd, assets/, scripts/assets/.
 *
 * @returns Data URI string for the logo, or null if not found
 */
function getLogoDataUri(): string | null {
  const candidates = [
    process.env.SUPERDOC_REPORT_LOGO,
    path.resolve(process.cwd(), 'superdoc-logo.png'),
    path.resolve(process.cwd(), 'assets/superdoc-logo.png'),
    path.resolve(process.cwd(), 'scripts/assets/superdoc-logo.png'),
  ].filter(Boolean) as string[];

  for (const logoPath of candidates) {
    if (!fs.existsSync(logoPath)) continue;
    const ext = path.extname(logoPath).toLowerCase();
    const mime = ext === '.svg' ? 'image/svg+xml' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
    const data = fs.readFileSync(logoPath);
    return `data:${mime};base64,${data.toString('base64')}`;
  }

  return null;
}

/**
 * Generate and write an interactive HTML comparison report.
 *
 * The report includes:
 * - Summary header with version info and statistics
 * - Grouped diff cards by document/story
 * - Image switcher with baseline, diff, and actual views
 * - Magnifier lens for detailed inspection
 * - Approval workflow for triaging changes
 * - Search and filter controls
 *
 * @param report - Comparison report data
 * @param outputFolder - Directory to write the report to
 * @param options - Report generation options
 * @returns Absolute path to the generated report file
 */
export function writeHtmlReport(
  report: ComparisonReport,
  outputFolder: string,
  options: HtmlReportOptions = {},
): string {
  const reportJson = JSON.stringify(report).replace(/</g, '\\u003c');
  const logoDataUri = getLogoDataUri();
  const logoMarkup = logoDataUri ? `<img src="${logoDataUri}" alt="SuperDoc logo" />` : 'SD';
  const mode = options.mode ?? 'visual';
  const showAll = options.showAll ?? false;
  const reportFileName = options.reportFileName ?? 'report.html';
  const trimPrefix = options.trimPrefix ?? '';
  const reportTitle = mode === 'interactions' ? 'Interaction Diff Report' : 'Visual Diff Report';

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>SuperDoc ${reportTitle}</title>
    <style>
      :root {
        color-scheme: light;
        --ink-900: #0b1123;
        --ink-800: #111a35;
        --ink-700: #1b2748;
        --ink-600: #273356;
        --ink-200: #d6dbe5;
        --ink-100: #eef1f6;
        --canvas: #b8bfca;
        --card: #ffffff;
        --shadow: 0 8px 30px rgba(10, 18, 38, 0.12);
        --accent: #6ba3ff;
        --accent-strong: #3c7cff;
        --warn: #ffb347;
        --danger: #ff6b6b;
        --ok: #52d4a6;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        font-family: "Inter", "SF Pro Text", "Segoe UI", sans-serif;
        background: var(--canvas);
        color: var(--ink-900);
      }

      header {
        background: linear-gradient(120deg, #0b132b 0%, #101a38 45%, #0e1630 100%);
        color: #f7f9ff;
        padding: 20px 28px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 20px;
      }

      .brand {
        display: flex;
        align-items: center;
        gap: 16px;
      }

      .logo {
        width: 44px;
        height: 44px;
        border-radius: 12px;
        background: radial-gradient(circle at 30% 30%, #8ad1ff 0%, #5f87ff 50%, #5a5edb 100%);
        display: grid;
        place-items: center;
        font-weight: 700;
        letter-spacing: 0.5px;
        color: #f7f9ff;
        overflow: hidden;
      }

      .logo img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .title {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .title .kicker {
        text-transform: uppercase;
        font-size: 11px;
        letter-spacing: 1.2px;
        color: #a7b3d6;
      }

      .title .name {
        font-size: 20px;
        font-weight: 600;
      }

      .title .run-name {
        font-size: 12px;
        color: #a7b3d6;
        letter-spacing: 0.3px;
      }

      .meta {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 8px;
        justify-content: flex-end;
      }

      .pill {
        padding: 6px 12px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.08);
        font-size: 12px;
        color: #e7edff;
      }

      .pill strong {
        color: #ffffff;
        font-weight: 600;
      }

      .controls {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        padding: 16px 28px;
        background: rgba(255, 255, 255, 0.72);
        backdrop-filter: blur(8px);
        position: sticky;
        top: 0;
        z-index: 10;
        border-bottom: 1px solid rgba(15, 25, 45, 0.1);
      }

      .search {
        flex: 1;
        max-width: 420px;
        position: relative;
      }

      .search input {
        width: 100%;
        padding: 10px 14px;
        border-radius: 10px;
        border: 1px solid rgba(15, 25, 45, 0.2);
        background: #ffffff;
        font-size: 14px;
      }

      .actions {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }

      button {
        border: none;
        border-radius: 10px;
        padding: 10px 14px;
        background: var(--ink-700);
        color: #f2f5ff;
        font-weight: 600;
        cursor: pointer;
        font-size: 13px;
      }

      button.secondary {
        background: #f0f3fa;
        color: var(--ink-700);
        border: 1px solid rgba(15, 25, 45, 0.1);
      }

      main {
        padding: 24px 28px 60px;
      }

      .empty {
        margin-top: 24px;
        padding: 32px;
        background: rgba(255, 255, 255, 0.8);
        border-radius: 18px;
        text-align: center;
        box-shadow: var(--shadow);
      }

      details.group {
        background: var(--card);
        border-radius: 18px;
        padding: 0;
        margin-bottom: 18px;
        box-shadow: var(--shadow);
        border: 1px solid rgba(15, 25, 45, 0.08);
      }

      details.group[open] summary {
        border-bottom: 1px solid rgba(15, 25, 45, 0.08);
      }

      summary {
        list-style: none;
        cursor: pointer;
        padding: 16px 20px;
        display: flex;
        align-items: center;
        gap: 12px;
        position: sticky;
        top: 73px; /* Below the controls bar */
        background: var(--card);
        z-index: 5;
        border-radius: 18px 18px 0 0;
      }

      details.group:not([open]) summary {
        border-radius: 18px;
      }

      summary::-webkit-details-marker {
        display: none;
      }

      .group-title {
        font-size: 16px;
        font-weight: 600;
        color: var(--ink-700);
      }

      .group-title-wrap {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .group-description {
        font-size: 12px;
        color: #5a688a;
      }

      .group-count {
        font-size: 12px;
        padding: 6px 12px;
        background: var(--ink-100);
        border-radius: 999px;
        color: var(--ink-700);
      }

      summary .approve-btn {
        margin-left: auto;
      }

      .group-body {
        padding: 20px;
        display: grid;
        gap: 18px;
      }

      .diff-card {
        background: #fdfdff;
        border-radius: 16px;
        border: 1px solid rgba(15, 25, 45, 0.08);
        padding: 16px;
      }

      .diff-card[data-reason="missing_in_baseline"] {
        border-color: rgba(255, 179, 71, 0.35);
      }

      .diff-card[data-reason="missing_in_results"] {
        border-color: rgba(255, 107, 107, 0.35);
      }

      .diff-card[data-reason="dimension_mismatch"] {
        border-color: rgba(91, 163, 255, 0.35);
      }

      .diff-header {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        margin-bottom: 12px;
      }

      .diff-header .approve-btn {
        margin-left: auto;
      }

      .diff-path {
        font-weight: 600;
        color: var(--ink-700);
        font-size: 14px;
      }

      .diff-path-wrap {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .diff-title {
        font-size: 12px;
        color: #5a688a;
        letter-spacing: 0.2px;
      }

      .badges {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
      }

      .diff-compare {
        display: grid;
        gap: 16px;
      }

      .diff-card.has-word .diff-compare {
        grid-template-columns: minmax(0, 1fr);
      }

      .switcher-block {
        display: grid;
        gap: 10px;
      }

      .switcher-title {
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.6px;
        text-transform: uppercase;
        color: #5a688a;
      }

      .badge {
        font-size: 11px;
        padding: 4px 8px;
        border-radius: 999px;
        background: #e7ecf8;
        color: var(--ink-700);
        text-transform: uppercase;
        letter-spacing: 0.6px;
      }

      .badge.diff {
        background: rgba(107, 163, 255, 0.2);
        color: #2c5bd4;
      }

      .badge.ok {
        background: rgba(82, 212, 166, 0.2);
        color: #1a7a5a;
      }

      .badge.warn {
        background: rgba(255, 179, 71, 0.25);
        color: #a05d12;
      }

      .badge.danger {
        background: rgba(255, 107, 107, 0.2);
        color: #b03c3c;
      }

      .badge.mute {
        background: rgba(15, 25, 45, 0.08);
        color: #47506a;
      }

      .approve-btn {
        border: 1px solid rgba(82, 212, 166, 0.4);
        background: rgba(82, 212, 166, 0.15);
        color: #1a7a5a;
        padding: 4px 10px;
        border-radius: 999px;
        font-size: 11px;
        font-weight: 600;
        cursor: pointer;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        transition: all 0.15s ease;
      }

      .approve-btn:hover {
        background: rgba(82, 212, 166, 0.3);
        border-color: rgba(82, 212, 166, 0.6);
      }

      details.group.approved {
        display: none;
      }

      body.show-approved details.group.approved {
        display: block;
        opacity: 0.5;
      }

      .diff-card.approved {
        display: none;
      }

      body.show-approved .diff-card.approved {
        display: block;
        opacity: 0.5;
      }

      body.show-approved .approved .approve-btn {
        background: rgba(255, 107, 107, 0.15);
        border-color: rgba(255, 107, 107, 0.4);
        color: #b03c3c;
      }

      body.hide-unchanged .diff-card[data-reason="passed"] {
        display: none;
      }

      .image-switcher {
        display: grid;
        gap: 12px;
        grid-template-columns: 1fr;
        align-items: start;
      }

      .image-tabs {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }

      .image-tab {
        border: 1px solid rgba(15, 25, 45, 0.1);
        background: rgba(255, 255, 255, 0.6);
        color: #394666;
        padding: 6px 12px;
        border-radius: 999px;
        font-size: 12px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.6px;
        cursor: pointer;
        transition: all 0.15s ease;
      }

      .image-tab:hover {
        border-color: rgba(60, 124, 255, 0.4);
        color: #2b4db8;
      }

      .image-tab.is-active {
        background: rgba(107, 163, 255, 0.2);
        border-color: rgba(60, 124, 255, 0.45);
        color: #2c5bd4;
      }

      .image-tab.is-selected {
        box-shadow: inset 0 0 0 1px rgba(60, 124, 255, 0.35);
      }

      .image-panel {
        display: none;
      }

      .image-panel.is-active {
        display: block;
      }

      .image-panel-label {
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.6px;
        text-transform: uppercase;
        color: #5a688a;
        margin: 2px 0 8px;
        display: none;
      }

      .image-frame {
        background: #f0f3fa;
        border-radius: 14px;
        border: 1px solid rgba(15, 25, 45, 0.08);
        padding: 8px;
        display: grid;
        place-items: center;
        min-height: 140px;
        position: relative;
      }

      .image-frame img {
        width: 100%;
        max-width: 1500px;
        height: auto;
        border-radius: 10px;
        box-shadow: 0 10px 24px rgba(15, 25, 45, 0.12);
        background: #ffffff;
      }

      .image-missing {
        font-size: 12px;
        color: #7782a0;
        text-align: center;
      }

      .zoom-lens {
        position: fixed;
        width: 180px;
        height: 180px;
        border-radius: 16px;
        border: 1px solid rgba(20, 30, 50, 0.25);
        box-shadow: 0 12px 24px rgba(15, 25, 45, 0.2);
        background-color: #ffffff;
        background-repeat: no-repeat;
        pointer-events: none;
        opacity: 0;
        transform: translate(-50%, -50%);
        transition: opacity 0.12s ease;
        z-index: 20;
      }

      .zoom-lens.is-visible {
        opacity: 1;
      }

      body.layout-side-by-side .image-tabs {
        display: none;
      }

      body.layout-side-by-side .image-panel {
        display: block;
      }

      body.layout-side-by-side .image-panel-label {
        display: block;
      }

      body.layout-side-by-side .image-switcher {
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      }

      body:not(.layout-side-by-side) .diff-card.has-word .diff-compare {
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
        align-items: start;
      }

      body.layout-side-by-side .diff-compare {
        grid-template-columns: 1fr;
      }

      .footer {
        margin-top: 32px;
        text-align: center;
        color: #5f6a86;
        font-size: 12px;
      }

      @media (max-width: 980px) {
        header {
          flex-direction: column;
          align-items: flex-start;
        }

        .controls {
          flex-direction: column;
          align-items: stretch;
        }

        body:not(.layout-side-by-side) .diff-card.has-word .diff-compare {
          grid-template-columns: 1fr;
        }
      }
    </style>
  </head>
  <body>
    <header>
      <div class="brand">
        <div class="logo">${logoMarkup}</div>
        <div class="title">
          <div class="kicker">SuperDoc Labs</div>
          <div class="name">${reportTitle}</div>
          <div class="run-name" id="run-name"></div>
        </div>
      </div>
      <div class="meta" id="meta-pills"></div>
    </header>

    <section class="controls">
      <div class="search">
        <input id="search-input" type="search" placeholder="Filter by path..." />
      </div>
      <div class="actions">
        <button class="secondary" id="toggle-layout">Show side-by-side</button>
        <button class="secondary" id="toggle-lens">Disable magnifier</button>
        <button class="secondary" id="toggle-unchanged">Hide unchanged</button>
        <button class="secondary" id="toggle-approved">Show approved</button>
        <button class="secondary" id="expand-all">Expand all</button>
        <button class="secondary" id="collapse-all">Collapse all</button>
      </div>
    </section>

    <main>
      <div class="zoom-lens" id="zoom-lens"></div>
      <div id="groups"></div>
      <div class="footer">Generated by SuperDoc Visual Testing</div>
    </main>

    <script id="report-data" type="application/json">${reportJson}</script>
    <script>
      const report = JSON.parse(document.getElementById('report-data').textContent);

      const groupsContainer = document.getElementById('groups');
      const metaContainer = document.getElementById('meta-pills');
      const searchInput = document.getElementById('search-input');
      const zoomLens = document.getElementById('zoom-lens');
      const toggleLensButton = document.getElementById('toggle-lens');
      const toggleLayoutButton = document.getElementById('toggle-layout');

      const diffs = report.results.filter((item) => !item.passed);
      const showAll = ${JSON.stringify(showAll)};
      const items = showAll ? report.results : diffs;
      const groupMap = new Map();

      // Approval state (session only, resets on refresh)
      const approved = new Set();

      const resultsFolderName = (report.resultsFolder || '').replace(/\\\\/g, '/');
      const resultsPrefix = resultsFolderName ? resultsFolderName + '/' : '';
      const trimPrefix = ${JSON.stringify(trimPrefix)};
      const reportMode = ${JSON.stringify(mode)};
      const isInteractions = reportMode === 'interactions';

      function formatMilestoneLabel(baseName) {
        const stripped = baseName.replace(/^\\d+[-_]?/, '');
        const cleaned = stripped.replace(/[-_]+/g, ' ').trim();
        return cleaned || baseName;
      }

      items.forEach((item) => {
        const normalizedPath = item.relativePath.replace(/\\\\/g, '/');
        let assetPath = normalizedPath.startsWith(resultsPrefix)
          ? normalizedPath.slice(resultsPrefix.length)
          : normalizedPath;
        if (resultsFolderName && assetPath.startsWith(resultsFolderName + '/')) {
          assetPath = assetPath.slice(resultsFolderName.length + 1);
        }

        let displayPath = assetPath;
        if (trimPrefix && displayPath.startsWith(trimPrefix)) {
          displayPath = displayPath.slice(trimPrefix.length);
          if (displayPath.startsWith('/')) {
            displayPath = displayPath.slice(1);
          }
        }

        const assetSlash = assetPath.lastIndexOf('/');
        const assetDir = assetSlash >= 0 ? assetPath.slice(0, assetSlash) : '.';
        const assetFile = assetSlash >= 0 ? assetPath.slice(assetSlash + 1) : assetPath;
        const assetBaseName = assetFile.replace(/\\.[^.]+$/, '');

        const displaySlash = displayPath.lastIndexOf('/');
        const displayDir = displaySlash >= 0 ? displayPath.slice(0, displaySlash) : '.';
        const displayFile = displaySlash >= 0 ? displayPath.slice(displaySlash + 1) : displayPath;

        if (!groupMap.has(displayDir)) {
          groupMap.set(displayDir, []);
        }

        const reason = item.passed ? 'passed' : (item.reason || 'pixel_diff');
        const interaction = item.interaction || null;
        const storyName = interaction ? (interaction.storyName || '') : '';
        const storyDescription = interaction ? (interaction.storyDescription || '') : '';
        const milestoneDescription = interaction ? (interaction.milestoneDescription || '') : '';
        const fallbackLabel = interaction && interaction.milestoneLabel
          ? interaction.milestoneLabel
          : (isInteractions ? formatMilestoneLabel(assetBaseName) : '');
        const milestoneLabel = milestoneDescription || fallbackLabel;

        groupMap.get(displayDir).push({
          relPath: displayPath,
          dir: displayDir,
          file: displayFile,
          baseName: assetBaseName,
          assetDir,
          reason,
          diffPercent: item.diffPercent,
          hasDiff: Boolean(item.diffPath),
          word: item.word || null,
          milestoneLabel,
          storyName,
          storyDescription,
          milestoneDescription,
        });
      });

      const groupEntries = Array.from(groupMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));

      function createMetaPill(label, value) {
        const pill = document.createElement('div');
        pill.className = 'pill';
        pill.innerHTML = label + ' <strong>' + value + '</strong>';
        return pill;
      }

      metaContainer.appendChild(createMetaPill('Baseline', report.baselineFolder));
      metaContainer.appendChild(createMetaPill('Threshold', report.threshold + '%'));
      metaContainer.appendChild(createMetaPill('Diffs', diffs.length));
      if (report.summary.missingInBaseline) {
        metaContainer.appendChild(createMetaPill('Missing baseline', report.summary.missingInBaseline));
      }
      if (report.summary.missingInResults) {
        metaContainer.appendChild(createMetaPill('Missing results', report.summary.missingInResults));
      }
      const runNameEl = document.getElementById('run-name');
      if (runNameEl) {
        runNameEl.textContent = resultsFolderName || 'run';
      }

      function createBadge(text, className) {
        const badge = document.createElement('span');
        badge.className = 'badge ' + (className || '');
        badge.textContent = text;
        return badge;
      }

      function buildImagePanel(kind, label, src, isMissing) {
        const panel = document.createElement('div');
        panel.className = 'image-panel';
        panel.dataset.kind = kind;

        const panelLabel = document.createElement('div');
        panelLabel.className = 'image-panel-label';
        panelLabel.textContent = label;

        const frame = document.createElement('div');
        frame.className = 'image-frame';

        if (isMissing) {
          const missing = document.createElement('div');
          missing.className = 'image-missing';
          missing.textContent = 'Missing';
          frame.appendChild(missing);
        } else if (!src) {
          const missing = document.createElement('div');
          missing.className = 'image-missing';
          missing.textContent = 'Not generated';
          frame.appendChild(missing);
        } else {
          const img = document.createElement('img');
          img.src = src;
          img.alt = label;
          img.loading = 'lazy';
          frame.appendChild(img);
        }

        panel.appendChild(panelLabel);
        panel.appendChild(frame);
        return panel;
      }

      function buildImageTab(kind, label) {
        const tab = document.createElement('button');
        tab.type = 'button';
        tab.className = 'image-tab';
        tab.textContent = label;
        tab.dataset.kind = kind;
        return tab;
      }

      function createImageSwitcher(config) {
        const switcher = document.createElement('div');
        switcher.className = 'image-switcher';

        const tabs = document.createElement('div');
        tabs.className = 'image-tabs';

        const tabMap = new Map();
        const panelMap = new Map();

        config.items.forEach((item) => {
          const tab = buildImageTab(item.kind, item.label);
          tabs.appendChild(tab);
          tabMap.set(item.kind, tab);

          const panel = buildImagePanel(item.kind, item.label, item.src, item.missing);
          panelMap.set(item.kind, panel);
        });

        switcher.appendChild(tabs);
        panelMap.forEach((panel) => {
          switcher.appendChild(panel);
        });

        let activeKind = config.defaultKind;

        function setDisplayed(kind, isActive) {
          panelMap.forEach((panel, panelKind) => {
            panel.classList.toggle('is-active', panelKind === kind);
          });

          tabMap.forEach((tab, tabKind) => {
            tab.classList.toggle('is-active', tabKind === kind);
            tab.classList.toggle('is-selected', tabKind === activeKind);
          });

          if (isActive) {
            activeKind = kind;
          }
        }

        setDisplayed(activeKind, true);

        tabMap.forEach((tab, tabKind) => {
          tab.addEventListener('mouseenter', () => setDisplayed(tabKind, true));
          tab.addEventListener('click', () => setDisplayed(tabKind, true));
        });

        return switcher;
      }

      function reasonLabel(reason) {
        if (reason === 'passed') return { text: 'PASS', className: 'ok' };
        if (reason === 'missing_in_baseline') return { text: 'NEW', className: 'warn' };
        if (reason === 'missing_in_results') return { text: 'REMOVED', className: 'danger' };
        if (reason === 'dimension_mismatch') return { text: 'SIZE', className: 'diff' };
        return { text: 'DIFF', className: 'diff' };
      }

      if (items.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'empty';
        empty.textContent = 'No diffs detected for this run.';
        groupsContainer.appendChild(empty);
      }

      groupEntries.forEach(([dir, items]) => {
        const details = document.createElement('details');
        details.className = 'group';
        details.open = false;

        const summary = document.createElement('summary');
        const titleWrap = document.createElement('div');
        titleWrap.className = 'group-title-wrap';

        const title = document.createElement('div');
        title.className = 'group-title';
        title.textContent = dir === '.' ? '(root)' : dir;
        titleWrap.appendChild(title);

        const storyDescription = items.find((item) => item.storyDescription)?.storyDescription;
        if (storyDescription) {
          const desc = document.createElement('div');
          desc.className = 'group-description';
          desc.textContent = storyDescription;
          titleWrap.appendChild(desc);
        }

        const count = document.createElement('div');
        count.className = 'group-count';
        if (showAll) {
          count.textContent = items.length + (items.length === 1 ? ' item' : ' items');
        } else {
          count.textContent = items.length + (items.length === 1 ? ' diff' : ' diffs');
        }

        const approveBtn = document.createElement('button');
        approveBtn.type = 'button';
        approveBtn.className = 'approve-btn';
        approveBtn.textContent = 'Approve doc';
        approveBtn.dataset.group = dir;

        summary.appendChild(titleWrap);
        summary.appendChild(count);
        summary.appendChild(approveBtn);
        details.appendChild(summary);

        const body = document.createElement('div');
        body.className = 'group-body';

        items.forEach((item) => {
          const card = document.createElement('article');
          card.className = 'diff-card';
          card.dataset.path = item.relPath.toLowerCase();
          card.dataset.group = dir.toLowerCase();
          card.dataset.reason = item.reason;

          const header = document.createElement('div');
          header.className = 'diff-header';

          const pathWrap = document.createElement('div');
          pathWrap.className = 'diff-path-wrap';

          const pathLabel = document.createElement('div');
          pathLabel.className = 'diff-path';
          pathLabel.textContent = item.file;
          pathWrap.appendChild(pathLabel);

          if (item.milestoneLabel) {
            const title = document.createElement('div');
            title.className = 'diff-title';
            title.textContent = item.milestoneLabel;
            pathWrap.appendChild(title);
          }

          const badges = document.createElement('div');
          badges.className = 'badges';

          const reason = reasonLabel(item.reason);
          badges.appendChild(createBadge(reason.text, reason.className));
          badges.appendChild(createBadge(item.diffPercent.toFixed(2) + '%', 'mute'));

          const cardApproveBtn = document.createElement('button');
          cardApproveBtn.type = 'button';
          cardApproveBtn.className = 'approve-btn';
          cardApproveBtn.textContent = 'Approve';
          cardApproveBtn.dataset.card = item.relPath;

          header.appendChild(pathWrap);
          header.appendChild(badges);
          header.appendChild(cardApproveBtn);

          const baseDir = item.assetDir === '.' ? '' : item.assetDir + '/';
          const diffSrc = item.hasDiff ? baseDir + item.baseName + '-diff.png' : '';
          const baselineSrc = baseDir + item.baseName + '-baseline.png';
          const actualSrc = baseDir + item.baseName + '-actual.png';

          const missingBaseline = item.reason === 'missing_in_baseline';
          const missingActual = item.reason === 'missing_in_results';
          const hasWord = Boolean(item.word && (item.word.baseline || item.word.diff || item.word.actual));

          card.appendChild(header);
          card.classList.toggle('has-word', hasWord);

          const compareWrap = document.createElement('div');
          compareWrap.className = 'diff-compare';

          const superdocBlock = document.createElement('div');
          superdocBlock.className = 'switcher-block';
          if (hasWord) {
            const title = document.createElement('div');
            title.className = 'switcher-title';
            title.textContent = 'Baseline comparison';
            superdocBlock.appendChild(title);
          }

          const superdocSwitcher = createImageSwitcher({
            defaultKind: item.hasDiff ? 'diff' : (missingBaseline ? 'actual' : 'baseline'),
            items: [
              { kind: 'baseline', label: 'Baseline', src: baselineSrc, missing: missingBaseline },
              { kind: 'diff', label: 'Diff', src: diffSrc, missing: !item.hasDiff },
              { kind: 'actual', label: 'Actual', src: actualSrc, missing: missingActual },
            ],
          });

          superdocBlock.appendChild(superdocSwitcher);
          compareWrap.appendChild(superdocBlock);

          if (hasWord) {
            const wordBlock = document.createElement('div');
            wordBlock.className = 'switcher-block';

            const title = document.createElement('div');
            title.className = 'switcher-title';
            title.textContent = 'Word comparison';
            wordBlock.appendChild(title);

            const wordBaselineSrc = item.word ? item.word.baseline : '';
            const wordDiffSrc = item.word ? item.word.diff : '';
            const wordActualSrc = item.word ? item.word.actual : '';
            const wordDefault =
              wordDiffSrc ? 'diff' : (wordBaselineSrc ? 'baseline' : 'actual');

            const wordSwitcher = createImageSwitcher({
              defaultKind: wordDefault,
              items: [
                { kind: 'baseline', label: 'Word', src: wordBaselineSrc, missing: !wordBaselineSrc },
                { kind: 'diff', label: 'Diff', src: wordDiffSrc, missing: !wordDiffSrc },
                { kind: 'actual', label: 'SuperDoc', src: wordActualSrc, missing: !wordActualSrc },
              ],
            });

            wordBlock.appendChild(wordSwitcher);
            compareWrap.appendChild(wordBlock);
          }

          card.appendChild(compareWrap);
          body.appendChild(card);
        });

        details.appendChild(body);
        groupsContainer.appendChild(details);
      });

      if (zoomLens) {
        const lensState = {
          active: false,
          zoom: 2.2,
          raf: null,
          lastEvent: null,
          img: null,
          enabled: true,
        };

        function isSideBySide() {
          return document.body.classList.contains('layout-side-by-side');
        }

        function hideLens() {
          lensState.active = false;
          lensState.img = null;
          zoomLens.classList.remove('is-visible');
        }

        function updateLens() {
          if (!lensState.enabled || !lensState.active || !lensState.img || !lensState.lastEvent) return;
          const img = lensState.img;
          const event = lensState.lastEvent;
          if (!img.complete || !img.naturalWidth || !img.naturalHeight) return;

          const rect = img.getBoundingClientRect();
          const displayWidth = rect.width;
          const displayHeight = rect.height;
          if (displayWidth <= 0 || displayHeight <= 0) return;

          const offsetX = Math.min(Math.max(event.clientX - rect.left, 0), displayWidth);
          const offsetY = Math.min(Math.max(event.clientY - rect.top, 0), displayHeight);

          const ratioX = img.naturalWidth / displayWidth;
          const ratioY = img.naturalHeight / displayHeight;
          const bgX = offsetX * ratioX;
          const bgY = offsetY * ratioY;

          const lensBounds = zoomLens.getBoundingClientRect();
          const lensHalfW = lensBounds.width / 2;
          const lensHalfH = lensBounds.height / 2;
          const lensX = Math.min(Math.max(event.clientX + 18, rect.left + lensHalfW), rect.right - lensHalfW);
          const lensY = Math.min(Math.max(event.clientY + 18, rect.top + lensHalfH), rect.bottom - lensHalfH);

          zoomLens.style.left = lensX + 'px';
          zoomLens.style.top = lensY + 'px';
          zoomLens.style.backgroundImage = 'url(' + img.src + ')';
          zoomLens.style.backgroundSize =
            img.naturalWidth * lensState.zoom + 'px ' + img.naturalHeight * lensState.zoom + 'px';
          zoomLens.style.backgroundPosition =
            '-' + (bgX * lensState.zoom - lensHalfW) + 'px -' + (bgY * lensState.zoom - lensHalfH) + 'px';
        }

        function requestLensUpdate(event, img) {
          if (!lensState.enabled) return;
          lensState.active = true;
          lensState.lastEvent = event;
          lensState.img = img;
          zoomLens.classList.add('is-visible');

          if (!lensState.raf) {
            lensState.raf = requestAnimationFrame(() => {
              lensState.raf = null;
              updateLens();
            });
          }
        }

        document.addEventListener('mousemove', (event) => {
          if (!lensState.active || !lensState.img) return;
          requestLensUpdate(event, lensState.img);
        });

        document.addEventListener('mouseleave', () => {
          hideLens();
        });

        groupsContainer.addEventListener('mouseover', (event) => {
          const target = event.target;
          if (!(target instanceof HTMLImageElement)) return;
          const panel = target.closest('.image-panel');
          if (!panel) return;
          if (!isSideBySide() && !panel.classList.contains('is-active')) return;
          requestLensUpdate(event, target);
        });

        groupsContainer.addEventListener('mouseout', (event) => {
          const target = event.target;
          if (!(target instanceof HTMLImageElement)) return;
          const panel = target.closest('.image-panel');
          if (!panel) return;
          if (!isSideBySide() && !panel.classList.contains('is-active')) return;
          hideLens();
        });

        if (toggleLensButton) {
          toggleLensButton.addEventListener('click', () => {
            lensState.enabled = !lensState.enabled;
            if (!lensState.enabled) {
              hideLens();
              toggleLensButton.textContent = 'Enable magnifier';
            } else {
              toggleLensButton.textContent = 'Disable magnifier';
            }
          });
        }
      }

      if (toggleLayoutButton) {
        let isSideBySide = true;

        function updateLayoutToggle() {
          document.body.classList.toggle('layout-side-by-side', isSideBySide);
          toggleLayoutButton.textContent = isSideBySide ? 'Show single view' : 'Show side-by-side';
        }

        toggleLayoutButton.addEventListener('click', () => {
          isSideBySide = !isSideBySide;
          updateLayoutToggle();
        });

        updateLayoutToggle();
      }

      function applyFilter() {
        const query = searchInput.value.trim().toLowerCase();
        const groups = groupsContainer.querySelectorAll('details.group');
        let visibleCards = 0;

        groups.forEach((group) => {
          const cards = Array.from(group.querySelectorAll('.diff-card'));
          let anyVisible = false;

          cards.forEach((card) => {
            const matches =
              !query ||
              card.dataset.path.includes(query) ||
              card.dataset.group.includes(query);
            card.hidden = !matches;
            if (matches) {
              anyVisible = true;
              visibleCards += 1;
            }
          });

          group.hidden = !anyVisible;
        });

        updateGroupCounts();
      }

      searchInput.addEventListener('input', applyFilter);

      document.getElementById('expand-all').addEventListener('click', () => {
        document.querySelectorAll('details.group').forEach((group) => {
          group.open = true;
        });
      });

      document.getElementById('collapse-all').addEventListener('click', () => {
        document.querySelectorAll('details.group').forEach((group) => {
          group.open = false;
        });
      });

      // Approval handling
      function updateGroupCounts() {
        const showingApproved = document.body.classList.contains('show-approved');
        const hidingUnchanged = document.body.classList.contains('hide-unchanged');
        document.querySelectorAll('details.group').forEach((group) => {
          const isGroupApproved = group.classList.contains('approved');
          const cards = group.querySelectorAll('.diff-card');
          let visibleCount = 0;
          cards.forEach((card) => {
            const isCardApproved = card.classList.contains('approved');
            const isFiltered = card.hidden;
            const isPassed = card.dataset.reason === 'passed';
            const isHiddenByUnchanged = hidingUnchanged && isPassed;
            // Count cards that are not filtered, not hidden by unchanged toggle, and either not approved or we're showing approved
            if (!isFiltered && !isHiddenByUnchanged && (!isCardApproved || showingApproved)) {
              visibleCount++;
            }
          });
          const countEl = group.querySelector('.group-count');
          if (countEl) {
            countEl.textContent = visibleCount + (visibleCount === 1 ? ' diff' : ' diffs');
          }
          // Hide group if: group is approved (unless showing), or no visible cards
          const hasVisibleCards = visibleCount > 0;
          group.hidden = (isGroupApproved && !showingApproved) || !hasVisibleCards;
        });
      }

      groupsContainer.addEventListener('click', (event) => {
        const btn = event.target.closest('.approve-btn');
        if (!btn) return;

        // Handle group-level approval
        if (btn.dataset.group !== undefined) {
          event.preventDefault();
          event.stopPropagation();

          const group = btn.closest('details.group');
          if (!group) return;

          const groupKey = 'group:' + btn.dataset.group;
          const isApproved = group.classList.contains('approved');

          // Approve/unapprove all cards inside this group
          const cards = group.querySelectorAll('.diff-card');
          cards.forEach((card) => {
            const cardBtn = card.querySelector('.approve-btn');
            const cardKey = 'card:' + (cardBtn ? cardBtn.dataset.card : '');
            if (isApproved) {
              card.classList.remove('approved');
              if (cardBtn) cardBtn.textContent = 'Approve';
              approved.delete(cardKey);
            } else {
              card.classList.add('approved');
              if (cardBtn) cardBtn.textContent = 'Unapprove';
              approved.add(cardKey);
            }
          });

          if (isApproved) {
            group.classList.remove('approved');
            btn.textContent = 'Approve doc';
            approved.delete(groupKey);
          } else {
            group.classList.add('approved');
            btn.textContent = 'Unapprove doc';
            approved.add(groupKey);
          }

          updateGroupCounts();
          return;
        }

        // Handle card-level approval
        if (btn.dataset.card !== undefined) {
          const card = btn.closest('.diff-card');
          if (!card) return;

          const cardKey = 'card:' + btn.dataset.card;
          const isApproved = card.classList.contains('approved');

          if (isApproved) {
            card.classList.remove('approved');
            btn.textContent = 'Approve';
            approved.delete(cardKey);
          } else {
            card.classList.add('approved');
            btn.textContent = 'Unapprove';
            approved.add(cardKey);
          }

          updateGroupCounts();
        }
      });

      const toggleApprovedButton = document.getElementById('toggle-approved');
      if (toggleApprovedButton) {
        toggleApprovedButton.addEventListener('click', () => {
          const isShowing = document.body.classList.toggle('show-approved');
          toggleApprovedButton.textContent = isShowing ? 'Hide approved' : 'Show approved';
          updateGroupCounts();
        });
      }

      const toggleUnchangedButton = document.getElementById('toggle-unchanged');
      if (toggleUnchangedButton) {
        toggleUnchangedButton.addEventListener('click', () => {
          const isHiding = document.body.classList.toggle('hide-unchanged');
          toggleUnchangedButton.textContent = isHiding ? 'Show unchanged' : 'Hide unchanged';
          updateGroupCounts();
        });
      }

      // Initial count update
      updateGroupCounts();
    </script>
  </body>
</html>
`;

  const outputPath = path.join(outputFolder, reportFileName);
  fs.writeFileSync(outputPath, html, 'utf8');
  return outputPath;
}
