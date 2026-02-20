#!/usr/bin/env node

import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import process from 'node:process';
import { spawn } from 'node:child_process';
import readline from 'node:readline';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { Window } from 'happy-dom';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const SCRIPT_DIR = path.dirname(SCRIPT_PATH);
const REPO_ROOT = path.resolve(SCRIPT_DIR, '../..');
const SNAPSHOT_OUTPUT_BASE = path.join(REPO_ROOT, 'tests', 'layout-snapshots');

const DEFAULT_INPUT_ROOT = process.env.SUPERDOC_CORPUS_ROOT
  ? path.resolve(process.env.SUPERDOC_CORPUS_ROOT)
  : path.join(REPO_ROOT, 'test-corpus');
const DEFAULT_OUTPUT_ROOT = path.join(REPO_ROOT, 'tests', 'layout-snapshots', 'candidate');
const DEFAULT_SUPER_EDITOR_MODULE = path.resolve(REPO_ROOT, 'packages/superdoc/dist/super-editor.es.js');
const DEFAULT_PIPELINE = 'headless';
const HEADER_FOOTER_VARIANTS = ['default', 'first', 'even', 'odd'];
const MAX_LOG_LINE_CHARS = 120;
const TELEMETRY_DISABLED_LOG_FRAGMENT = '[super-editor] Telemetry: disabled';
const MAX_RECOMMENDED_JOBS = 8;

const DEFAULT_PAGE_SIZE = { w: 612, h: 792 };
const DEFAULT_MARGINS = { top: 72, right: 72, bottom: 72, left: 72 };
const DEFAULT_PAGE_GAP = 24;
const DEFAULT_HORIZONTAL_PAGE_GAP = 20;

const require = createRequire(import.meta.url);

function getRecommendedJobs() {
  const cpuCount =
    typeof os.availableParallelism === 'function'
      ? os.availableParallelism()
      : Array.isArray(os.cpus())
        ? os.cpus().length
        : 1;
  return Math.max(1, Math.min(MAX_RECOMMENDED_JOBS, cpuCount));
}

const DEFAULT_JOBS = getRecommendedJobs();

function pathToPosix(value) {
  return String(value ?? '').split(path.sep).join('/');
}

function normalizeMatchPattern(value) {
  const text = String(value ?? '').trim();
  if (!text) {
    throw new Error('Invalid --match value: expected non-empty text.');
  }
  return text.toLowerCase();
}

function matchesAnyPattern(value, patterns) {
  if (!Array.isArray(patterns) || patterns.length === 0) return true;
  const normalizedValue = String(value ?? '').toLowerCase();
  return patterns.some((pattern) => normalizedValue.includes(pattern));
}

function parseArgs(argv) {
  const args = {
    inputRoot: DEFAULT_INPUT_ROOT,
    outputRoot: DEFAULT_OUTPUT_ROOT,
    module: DEFAULT_SUPER_EDITOR_MODULE,
    limit: undefined,
    matches: [],
    timeoutMs: 30_000,
    failFast: false,
    telemetryEnabled: false,
    jobs: DEFAULT_JOBS,
    pipeline: DEFAULT_PIPELINE,

    isWorker: false,
    workerId: null,
    workerManifestPath: null,
    totalDocs: null,
    summaryFile: null,
    suppressFinalSummary: false,
    cleanOutput: true,
  };

  const requireValue = (optionName, optionValue) => {
    if (typeof optionValue !== 'string' || optionValue.length === 0 || optionValue.startsWith('-')) {
      throw new Error(`Missing value for ${optionName}.`);
    }
    return optionValue;
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }

    if (arg === '--match') {
      args.matches.push(normalizeMatchPattern(requireValue(arg, next)));
      i += 1;
      continue;
    }
    if (arg.startsWith('--match=')) {
      args.matches.push(normalizeMatchPattern(arg.slice('--match='.length)));
      continue;
    }
    if (arg === '--input-root' || arg === '-i') {
      args.inputRoot = requireValue(arg, next);
      i += 1;
      continue;
    }
    if (arg === '--output-root' || arg === '-o') {
      args.outputRoot = requireValue(arg, next);
      i += 1;
      continue;
    }
    if (arg === '--module' || arg === '-m') {
      args.module = requireValue(arg, next);
      i += 1;
      continue;
    }
    if (arg === '--limit') {
      const parsed = Number(requireValue(arg, next));
      if (Number.isFinite(parsed) && parsed > 0) {
        args.limit = Math.floor(parsed);
      } else {
        throw new Error(`Invalid value for --limit: "${next}". Expected integer > 0.`);
      }
      i += 1;
      continue;
    }
    if (arg === '--timeout-ms') {
      const parsed = Number(requireValue(arg, next));
      if (Number.isFinite(parsed) && parsed > 0) {
        args.timeoutMs = Math.floor(parsed);
      } else {
        throw new Error(`Invalid value for --timeout-ms: "${next}". Expected integer > 0.`);
      }
      i += 1;
      continue;
    }
    if (arg === '--jobs') {
      const parsed = Number(requireValue(arg, next));
      if (Number.isFinite(parsed) && parsed >= 1) {
        args.jobs = Math.floor(parsed);
      } else {
        throw new Error(`Invalid value for --jobs: "${next}". Expected integer >= 1.`);
      }
      i += 1;
      continue;
    }
    if (arg === '--pipeline') {
      const normalized = String(requireValue(arg, next)).toLowerCase();
      if (normalized === 'headless' || normalized === 'presentation') {
        args.pipeline = normalized;
      } else {
        throw new Error(`Invalid value for --pipeline: "${next}". Use "headless" or "presentation".`);
      }
      i += 1;
      continue;
    }
    if (arg === '--headless') {
      args.pipeline = 'headless';
      continue;
    }
    if (arg === '--presentation') {
      args.pipeline = 'presentation';
      continue;
    }
    if (arg === '--fail-fast') {
      args.failFast = true;
      continue;
    }
    if (arg === '--enable-telemetry') {
      args.telemetryEnabled = true;
      continue;
    }
    if (arg === '--disable-telemetry') {
      args.telemetryEnabled = false;
      continue;
    }
    if (arg === '--telemetry') {
      const normalized = String(requireValue(arg, next)).toLowerCase();
      if (['1', 'true', 'on', 'enabled'].includes(normalized)) {
        args.telemetryEnabled = true;
      } else if (['0', 'false', 'off', 'disabled'].includes(normalized)) {
        args.telemetryEnabled = false;
      } else {
        throw new Error(
          `Invalid value for --telemetry: "${next}". Use one of: on, off, true, false, 1, 0.`,
        );
      }
      i += 1;
      continue;
    }

    if (arg === '--worker') {
      args.isWorker = true;
      continue;
    }
    if (arg === '--worker-id') {
      args.workerId = Number(requireValue(arg, next));
      i += 1;
      continue;
    }
    if (arg === '--worker-manifest') {
      args.workerManifestPath = requireValue(arg, next);
      i += 1;
      continue;
    }
    if (arg === '--total-docs') {
      args.totalDocs = Number(requireValue(arg, next));
      i += 1;
      continue;
    }
    if (arg === '--summary-file') {
      args.summaryFile = requireValue(arg, next);
      i += 1;
      continue;
    }
    if (arg === '--suppress-final-summary') {
      args.suppressFinalSummary = true;
      continue;
    }
    if (arg === '--no-clean-output') {
      args.cleanOutput = false;
      continue;
    }

    if (arg.startsWith('-')) {
      throw new Error(`Unknown option "${arg}". Run with --help for usage.`);
    }
    throw new Error(`Unexpected positional argument "${arg}". Run with --help for usage.`);
  }

  if (args.jobs < 1) {
    throw new Error('`--jobs` must be >= 1.');
  }

  args.matches = [...new Set(args.matches)];

  return args;
}

function printHelp() {
  console.log(`
Usage:
  node tests/layout-snapshots/export-layout-snapshots.mjs [options]

Options:
  -i, --input-root <path>   Source DOCX root (default: ${DEFAULT_INPUT_ROOT})
  -o, --output-root <path>  Snapshot output root (default: ${DEFAULT_OUTPUT_ROOT})
  -m, --module <specifier>  SuperEditor module (default: ${DEFAULT_SUPER_EDITOR_MODULE})
      --pipeline <mode>     Layout pipeline: headless | presentation (default: ${DEFAULT_PIPELINE})
      --headless            Shorthand for --pipeline headless
      --presentation        Shorthand for --pipeline presentation
      --jobs <n>            Process docs with n worker processes (default: ${DEFAULT_JOBS})
      --limit <n>           Process at most n DOCX files
      --match <pattern>     Filter docs by relative path substring (repeatable, case-insensitive)
      --timeout-ms <ms>     Per-document layout timeout for presentation mode (default: 30000)
      --fail-fast           Stop on first error
      --telemetry <on|off>  Enable/disable editor telemetry (default: off)
      --enable-telemetry    Shorthand for --telemetry on
      --disable-telemetry   Shorthand for --telemetry off
  -h, --help                Show this help

Examples:
  bun tests/layout-snapshots/export-layout-snapshots.mjs
  bun tests/layout-snapshots/export-layout-snapshots.mjs --jobs 4
  bun tests/layout-snapshots/export-layout-snapshots.mjs --match list-in-table
  bun tests/layout-snapshots/export-layout-snapshots.mjs --pipeline presentation --limit 10
  node tests/layout-snapshots/export-layout-snapshots.mjs --module superdoc/super-editor
`);
}

function resolveModuleSpecifier(value) {
  if (!value) {
    return pathToFileURL(DEFAULT_SUPER_EDITOR_MODULE).href;
  }
  if (value.startsWith('.') || value.startsWith('/') || value.startsWith('file:')) {
    if (value.startsWith('file:')) return value;
    return pathToFileURL(path.resolve(process.cwd(), value)).href;
  }
  return value;
}

async function resolveModuleUrl(specifier) {
  const normalized = resolveModuleSpecifier(specifier);
  if (normalized.startsWith('file:')) {
    return normalized;
  }

  if (typeof import.meta.resolve === 'function') {
    const resolved = import.meta.resolve(normalized);
    return typeof resolved === 'string' ? resolved : await resolved;
  }

  const resolvedPath = require.resolve(normalized);
  return pathToFileURL(resolvedPath).href;
}

async function runCommand(command, commandArgs, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, {
      cwd: options.cwd ?? process.cwd(),
      env: options.env ?? process.env,
      stdio: options.stdio ?? 'inherit',
    });

    child.on('error', reject);
    child.on('close', (code) => resolve(code ?? 1));
  });
}

function resolveLocalModulePath(specifier) {
  const normalized = resolveModuleSpecifier(specifier);
  if (!normalized.startsWith('file:')) {
    return null;
  }
  return path.resolve(fileURLToPath(normalized));
}

async function ensureDefaultSuperEditorBuild(args) {
  if (args.isWorker) return;

  const modulePath = resolveLocalModulePath(args.module);
  if (!modulePath || modulePath !== DEFAULT_SUPER_EDITOR_MODULE) return;

  try {
    await fs.access(modulePath);
    return;
  } catch {
    // Build on-demand when the local dist module is missing.
  }

  logLine(`[layout-snapshots] Missing module at ${modulePath}`);
  logLine('[layout-snapshots] Running `pnpm run pack:es` to build local artifacts...');

  const exitCode = await runCommand('pnpm', ['run', 'pack:es'], {
    cwd: REPO_ROOT,
  });
  if (exitCode !== 0) {
    throw new Error(`Auto-build failed: "pnpm run pack:es" exited with code ${exitCode}.`);
  }

  try {
    await fs.access(modulePath);
  } catch {
    throw new Error(`Auto-build completed but module is still missing: ${modulePath}`);
  }
}

function resolveCanvasConstructor() {
  try {
    const { Canvas } = require('canvas');
    return { Canvas, usingStub: false };
  } catch {
    class MockCanvasRenderingContext2D {
      font = '';

      measureText(text) {
        const fontSizeMatch = this.font.match(/([\d.]+)px/);
        const fontSize = fontSizeMatch ? Number(fontSizeMatch[1]) : 16;
        const bold = /\bbold\b/i.test(this.font);
        const italic = /\bitalic\b/i.test(this.font);
        const styleMultiplier = (bold ? 1.06 : 1) * (italic ? 1.02 : 1);
        const width = text.length * fontSize * 0.5 * styleMultiplier;
        return {
          width,
          actualBoundingBoxAscent: fontSize * 0.8,
          actualBoundingBoxDescent: fontSize * 0.2,
        };
      }
    }

    class MockCanvas {
      getContext(type) {
        if (type === '2d') return new MockCanvasRenderingContext2D();
        return null;
      }
    }

    return { Canvas: MockCanvas, usingStub: true };
  }
}

function installDomEnvironment() {
  const window = new Window({
    width: 1280,
    height: 720,
    url: 'http://localhost',
  });

  globalThis.window = window;
  globalThis.document = window.document;
  Object.defineProperty(globalThis, 'navigator', {
    value: window.navigator,
    configurable: true,
    writable: true,
  });
  globalThis.HTMLElement = window.HTMLElement;
  globalThis.Element = window.Element;
  globalThis.Node = window.Node;
  globalThis.DOMParser = window.DOMParser;
  globalThis.MutationObserver = window.MutationObserver;
  globalThis.getComputedStyle = window.getComputedStyle.bind(window);
  globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
  globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
  globalThis.performance = window.performance;
  globalThis.ResizeObserver = window.ResizeObserver;
  globalThis.DOMRect = window.DOMRect;
  globalThis.Range = window.Range;
  globalThis.Selection = window.Selection;
  globalThis.screen = window.screen;
  globalThis.matchMedia = window.matchMedia.bind(window);

  if (typeof globalThis.URL.createObjectURL !== 'function') {
    globalThis.URL.createObjectURL = () => 'blob:mock';
  }
  if (typeof globalThis.URL.revokeObjectURL !== 'function') {
    globalThis.URL.revokeObjectURL = () => {};
  }

  const { Canvas, usingStub } = resolveCanvasConstructor();
  const proto = window.HTMLCanvasElement?.prototype;
  if (!proto) {
    throw new Error('HTMLCanvasElement is not available in this DOM environment');
  }
  const originalGetContext = proto.getContext;
  proto.getContext = function getContext(contextId, ...args) {
    if (contextId === '2d') {
      const w = Number(this.width) > 0 ? Number(this.width) : 1024;
      const h = Number(this.height) > 0 ? Number(this.height) : 768;
      const nodeCanvas = new Canvas(w, h);
      return nodeCanvas.getContext('2d');
    }
    if (typeof originalGetContext === 'function') {
      return originalGetContext.call(this, contextId, ...args);
    }
    return null;
  };

  return { usingStubCanvas: usingStub };
}

async function listDocxFiles(rootPath) {
  const found = [];
  const stack = [path.resolve(rootPath)];

  while (stack.length > 0) {
    const current = stack.pop();
    const entries = await fs.readdir(current, { withFileTypes: true });

    for (const entry of entries) {
      const absolutePath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(absolutePath);
        continue;
      }
      if (entry.isFile() && entry.name.toLowerCase().endsWith('.docx')) {
        found.push(absolutePath);
      }
    }
  }

  return found.sort();
}

function filterDocxFilesByMatchPatterns(docxFiles, inputRoot, patterns) {
  if (!Array.isArray(patterns) || patterns.length === 0) {
    return docxFiles;
  }

  return docxFiles.filter((docxPath) => {
    const relativePath = pathToPosix(path.relative(inputRoot, docxPath));
    if (matchesAnyPattern(relativePath, patterns)) return true;
    if (relativePath.toLowerCase().endsWith('.docx')) {
      const withoutExtension = relativePath.slice(0, -'.docx'.length);
      if (matchesAnyPattern(withoutExtension, patterns)) return true;
    }
    return false;
  });
}

function toJsonSafe(value) {
  const seen = new WeakSet();

  const visit = (input) => {
    if (input == null) return input;

    const inputType = typeof input;
    if (inputType === 'string' || inputType === 'number' || inputType === 'boolean') return input;
    if (inputType === 'bigint') return input.toString();
    if (inputType === 'function' || inputType === 'symbol') return undefined;

    if (input instanceof Date) return input.toISOString();
    if (input instanceof Map) {
      const out = {};
      for (const [k, v] of input.entries()) {
        out[String(k)] = visit(v);
      }
      return out;
    }
    if (input instanceof Set) {
      return Array.from(input, (item) => visit(item));
    }
    if (ArrayBuffer.isView(input)) {
      return Array.from(input);
    }
    if (input instanceof ArrayBuffer) {
      return Array.from(new Uint8Array(input));
    }

    if (Array.isArray(input)) {
      return input.map((item) => visit(item));
    }

    if (inputType === 'object') {
      if (seen.has(input)) {
        throw new Error('Encountered circular reference while serializing snapshot');
      }
      seen.add(input);
      const out = {};
      for (const [k, v] of Object.entries(input)) {
        const next = visit(v);
        if (next !== undefined) {
          out[k] = next;
        }
      }
      seen.delete(input);
      return out;
    }

    return input;
  };

  return visit(value);
}

function roundMetric(value) {
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 1000) / 1000;
}

function readPxMetric(styleValue) {
  if (typeof styleValue !== 'string' || styleValue.length === 0) return null;
  const parsed = Number.parseFloat(styleValue);
  return Number.isFinite(parsed) ? roundMetric(parsed) : null;
}

function readStyleString(styleValue) {
  if (typeof styleValue !== 'string' || styleValue.length === 0) return null;
  return styleValue;
}

function compactObject(input) {
  const out = {};
  for (const [key, value] of Object.entries(input)) {
    if (value == null) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    out[key] = value;
  }
  return out;
}

function snapshotLineStyle(lineEl) {
  const style = lineEl?.style;
  if (!style) return {};
  return compactObject({
    paddingLeftPx: readPxMetric(style.paddingLeft),
    paddingRightPx: readPxMetric(style.paddingRight),
    textIndentPx: readPxMetric(style.textIndent),
    marginLeftPx: readPxMetric(style.marginLeft),
    marginRightPx: readPxMetric(style.marginRight),
    leftPx: readPxMetric(style.left),
    topPx: readPxMetric(style.top),
    widthPx: readPxMetric(style.width),
    heightPx: readPxMetric(style.height),
    display: readStyleString(style.display),
    position: readStyleString(style.position),
    textAlign: readStyleString(style.textAlign),
    justifyContent: readStyleString(style.justifyContent),
  });
}

function snapshotMarkerStyle(markerEl) {
  const style = markerEl?.style;
  if (!style) return {};
  return compactObject({
    text: markerEl?.textContent ?? '',
    leftPx: readPxMetric(style.left),
    widthPx: readPxMetric(style.width),
    paddingRightPx: readPxMetric(style.paddingRight),
    display: readStyleString(style.display),
    position: readStyleString(style.position),
    textAlign: readStyleString(style.textAlign),
    fontWeight: readStyleString(style.fontWeight),
    fontStyle: readStyleString(style.fontStyle),
    color: readStyleString(style.color),
  });
}

function collectLineMarkers(lineEl) {
  const markers = [];
  const parent = lineEl?.parentElement;
  if (parent) {
    for (const child of parent.children) {
      if (!(child instanceof HTMLElement)) continue;
      if (!child.classList.contains('superdoc-paragraph-marker')) continue;
      markers.push(snapshotMarkerStyle(child));
    }
  }

  const inlineMarkers = lineEl?.querySelectorAll?.('.superdoc-paragraph-marker') ?? [];
  for (const markerEl of inlineMarkers) {
    if (!(markerEl instanceof HTMLElement)) continue;
    if (markers.some((existing) => existing.text === markerEl.textContent && existing.leftPx === readPxMetric(markerEl.style.left))) {
      continue;
    }
    markers.push(snapshotMarkerStyle(markerEl));
  }

  return markers;
}

function collectLineTabs(lineEl) {
  const tabs = [];
  const tabElements = lineEl?.querySelectorAll?.('.superdoc-tab') ?? [];
  for (const tabEl of tabElements) {
    if (!(tabEl instanceof HTMLElement)) continue;
    tabs.push(
      compactObject({
        widthPx: readPxMetric(tabEl.style.width),
        leftPx: readPxMetric(tabEl.style.left),
        position: readStyleString(tabEl.style.position),
        borderBottom: readStyleString(tabEl.style.borderBottom),
      }),
    );
  }
  return tabs;
}

function collectPaintSnapshotFromDomRoot(rootEl) {
  const pageElements = Array.from(rootEl?.querySelectorAll?.('.superdoc-page') ?? []);
  const pages = [];
  let totalLineCount = 0;
  let totalMarkerCount = 0;
  let totalTabCount = 0;

  for (let pageIndex = 0; pageIndex < pageElements.length; pageIndex += 1) {
    const pageEl = pageElements[pageIndex];
    if (!(pageEl instanceof HTMLElement)) continue;

    const lineElements = Array.from(pageEl.querySelectorAll('.superdoc-line'));
    const lines = [];
    for (let lineIndex = 0; lineIndex < lineElements.length; lineIndex += 1) {
      const lineEl = lineElements[lineIndex];
      if (!(lineEl instanceof HTMLElement)) continue;

      const markers = collectLineMarkers(lineEl);
      const tabs = collectLineTabs(lineEl);
      totalMarkerCount += markers.length;
      totalTabCount += tabs.length;
      totalLineCount += 1;

      lines.push(
        compactObject({
          index: lineIndex,
          inTableFragment: Boolean(lineEl.closest('.superdoc-table-fragment')),
          inTableParagraph: Boolean(lineEl.closest('.superdoc-table-paragraph')),
          style: snapshotLineStyle(lineEl),
          markers,
          tabs,
        }),
      );
    }

    const pageNumberRaw = pageEl.dataset?.pageNumber;
    const pageNumberParsed = pageNumberRaw == null ? Number.NaN : Number(pageNumberRaw);

    pages.push(
      compactObject({
        index: pageIndex,
        pageNumber: Number.isFinite(pageNumberParsed) ? pageNumberParsed : null,
        lineCount: lines.length,
        lines,
      }),
    );
  }

  return {
    formatVersion: 1,
    pageCount: pages.length,
    lineCount: totalLineCount,
    markerCount: totalMarkerCount,
    tabCount: totalTabCount,
    pages,
  };
}

function readPaintSnapshotFromPresentation(presentation, host) {
  const snapshotFromPainter = presentation?.getPaintSnapshot?.();
  if (snapshotFromPainter && typeof snapshotFromPainter === 'object' && snapshotFromPainter.formatVersion != null) {
    return snapshotFromPainter;
  }
  return collectPaintSnapshotFromDomRoot(host);
}

function waitForLayoutUpdate(presentation, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      unsubscribe?.();
      reject(new Error(`Timed out waiting for layout after ${timeoutMs}ms`));
    }, timeoutMs);

    const unsubscribe = presentation.onLayoutUpdated((payload) => {
      clearTimeout(timer);
      unsubscribe?.();
      resolve(payload);
    });
  });
}

function makeOutputPath(outputRoot, inputRoot, docxPath) {
  const relativePath = path.relative(inputRoot, docxPath);
  const outRelativePath = `${relativePath}.layout.json`;
  return {
    relativePath,
    outRelativePath,
    outputPath: path.join(outputRoot, outRelativePath),
  };
}

function assertSafeOutputRoot(outputRoot) {
  const normalized = path.resolve(outputRoot);
  const parsed = path.parse(normalized);

  if (normalized === parsed.root) {
    throw new Error(`Refusing to wipe filesystem root: ${normalized}`);
  }

  if (normalized === REPO_ROOT) {
    throw new Error(`Refusing to wipe repository root: ${normalized}`);
  }

  const relativeToSnapshotBase = path.relative(SNAPSHOT_OUTPUT_BASE, normalized);
  const isWithinSnapshotBase =
    Boolean(relativeToSnapshotBase) &&
    relativeToSnapshotBase !== '.' &&
    !relativeToSnapshotBase.startsWith('..') &&
    !path.isAbsolute(relativeToSnapshotBase);

  if (!isWithinSnapshotBase) {
    throw new Error(`Refusing to wipe unsafe output path: ${normalized}`);
  }
}

function nowMs() {
  return Number(process.hrtime.bigint()) / 1_000_000;
}

function formatDuration(ms) {
  return `${(ms / 1000).toFixed(2)}s`;
}

function wrapText(text, maxChars = MAX_LOG_LINE_CHARS) {
  const normalized = String(text ?? '');
  if (normalized.length <= maxChars) return [normalized];

  const lines = [];
  let remaining = normalized;

  while (remaining.length > maxChars) {
    let splitAt = remaining.lastIndexOf(' ', maxChars);
    if (splitAt <= 0) {
      splitAt = maxChars;
    }
    lines.push(remaining.slice(0, splitAt).trimEnd());
    remaining = remaining.slice(splitAt).trimStart();
  }

  if (remaining.length > 0) {
    lines.push(remaining);
  }

  return lines;
}

function logLine(text) {
  const lines = wrapText(text);
  for (const line of lines) {
    console.log(line);
  }
}

function errorLine(text) {
  const lines = wrapText(text);
  for (const line of lines) {
    console.error(line);
  }
}

function shouldSuppressTelemetryDisabledLog(line, telemetryEnabled) {
  return (
    !telemetryEnabled &&
    typeof line === 'string' &&
    line.includes(TELEMETRY_DISABLED_LOG_FRAGMENT)
  );
}

function installTelemetryConsoleFilter(telemetryEnabled) {
  if (telemetryEnabled) {
    return () => {};
  }

  const methods = ['debug', 'log', 'info', 'warn'];
  const originals = new Map();

  for (const method of methods) {
    const original = console[method];
    if (typeof original !== 'function') continue;

    originals.set(method, original);
    console[method] = (...parts) => {
      const hasSuppressedLine = parts.some(
        (part) => typeof part === 'string' && part.includes(TELEMETRY_DISABLED_LOG_FRAGMENT),
      );
      if (hasSuppressedLine) return;
      original.apply(console, parts);
    };
  }

  return () => {
    for (const [method, original] of originals.entries()) {
      console[method] = original;
    }
  };
}

function logDocProgress({ progress, relativePath, pageCount, docElapsedMs, phaseLabel }) {
  logLine(`${progress} OK    ${relativePath}`);
  logLine(`  pages: ${pageCount} | took ${formatDuration(docElapsedMs)}`);
  logLine(`  phases: ${phaseLabel}`);
}

function logDocFailure({ progress, relativePath, docElapsedMs, message }) {
  logLine(`${progress} FAIL  ${relativePath}`);
  logLine(`  took: ${formatDuration(docElapsedMs)}`);
  errorLine(`  error: ${message}`);
}

function inchesToPx(value) {
  if (value == null) return undefined;
  const num = Number(value);
  if (!Number.isFinite(num)) return undefined;
  return num * 96;
}

function parseColumns(raw) {
  if (!raw || typeof raw !== 'object') return undefined;
  const source = raw;
  const rawCount = Number(source.count ?? source.num ?? source.numberOfColumns ?? 1);
  if (!Number.isFinite(rawCount) || rawCount <= 1) return undefined;
  const count = Math.max(1, Math.floor(rawCount));
  const gap = inchesToPx(source.space ?? source.gap) ?? 0;
  return { count, gap };
}

function computeDefaultLayoutDefaults(converter) {
  const pageStyles = converter?.pageStyles ?? {};
  const size = pageStyles.pageSize ?? {};
  const pageMargins = pageStyles.pageMargins ?? {};

  const pageSize = {
    w: inchesToPx(size.width) ?? DEFAULT_PAGE_SIZE.w,
    h: inchesToPx(size.height) ?? DEFAULT_PAGE_SIZE.h,
  };

  const margins = {
    top: inchesToPx(pageMargins.top) ?? DEFAULT_MARGINS.top,
    right: inchesToPx(pageMargins.right) ?? DEFAULT_MARGINS.right,
    bottom: inchesToPx(pageMargins.bottom) ?? DEFAULT_MARGINS.bottom,
    left: inchesToPx(pageMargins.left) ?? DEFAULT_MARGINS.left,
    ...(inchesToPx(pageMargins.header) != null ? { header: inchesToPx(pageMargins.header) } : {}),
    ...(inchesToPx(pageMargins.footer) != null ? { footer: inchesToPx(pageMargins.footer) } : {}),
  };

  const columns = parseColumns(pageStyles.columns);
  return { pageSize, margins, columns };
}

function resolveLayoutOptions({ defaults, blocks, sectionMetadata }) {
  const firstSection = blocks?.find(
    (block) => block.kind === 'sectionBreak' && block?.attrs?.isFirstSection,
  );

  const pageSize = firstSection?.pageSize ?? defaults.pageSize;
  const margins = {
    ...defaults.margins,
    ...(firstSection?.margins?.top != null ? { top: firstSection.margins.top } : {}),
    ...(firstSection?.margins?.right != null ? { right: firstSection.margins.right } : {}),
    ...(firstSection?.margins?.bottom != null ? { bottom: firstSection.margins.bottom } : {}),
    ...(firstSection?.margins?.left != null ? { left: firstSection.margins.left } : {}),
    ...(firstSection?.margins?.header != null ? { header: firstSection.margins.header } : {}),
    ...(firstSection?.margins?.footer != null ? { footer: firstSection.margins.footer } : {}),
  };
  const columns = firstSection?.columns ?? defaults.columns;

  return {
    pageSize,
    margins,
    ...(columns ? { columns } : {}),
    sectionMetadata,
  };
}

function computeHeaderFooterConstraints(layoutOptions) {
  const pageSize = layoutOptions.pageSize ?? DEFAULT_PAGE_SIZE;
  const margins = layoutOptions.margins ?? DEFAULT_MARGINS;
  const marginLeft = margins.left ?? DEFAULT_MARGINS.left;
  const marginRight = margins.right ?? DEFAULT_MARGINS.right;
  const bodyContentWidth = pageSize.w - (marginLeft + marginRight);
  if (!Number.isFinite(bodyContentWidth) || bodyContentWidth <= 0) return null;

  const marginTop = margins.top ?? DEFAULT_MARGINS.top;
  const marginBottom = margins.bottom ?? DEFAULT_MARGINS.bottom;
  if (!Number.isFinite(marginTop) || !Number.isFinite(marginBottom)) return null;
  if (marginTop + marginBottom >= pageSize.h) return null;

  const MIN_HEADER_FOOTER_HEIGHT = 1;
  const height = Math.max(MIN_HEADER_FOOTER_HEIGHT, pageSize.h - (marginTop + marginBottom));
  const headerMargin = margins.header ?? 0;
  const footerMargin = margins.footer ?? 0;
  const headerBand = Math.max(MIN_HEADER_FOOTER_HEIGHT, marginTop - headerMargin);
  const footerBand = Math.max(MIN_HEADER_FOOTER_HEIGHT, marginBottom - footerMargin);
  const overflowBaseHeight = Math.max(headerBand, footerBand);

  return {
    width: bodyContentWidth,
    height,
    pageWidth: pageSize.w,
    margins: { left: marginLeft, right: marginRight },
    overflowBaseHeight,
  };
}

function getEffectivePageGap(layoutOptions) {
  if (layoutOptions?.virtualization?.enabled) {
    return Math.max(0, layoutOptions.virtualization.gap ?? DEFAULT_PAGE_GAP);
  }
  if (layoutOptions?.layoutMode === 'horizontal') {
    return DEFAULT_HORIZONTAL_PAGE_GAP;
  }
  return DEFAULT_PAGE_GAP;
}

function buildFootnoteNumberById(editor) {
  const footnoteNumberById = {};
  try {
    const seen = new Set();
    let counter = 1;
    editor?.state?.doc?.descendants?.((node) => {
      if (node?.type?.name !== 'footnoteReference') return;
      const rawId = node?.attrs?.id;
      if (rawId == null) return;
      const key = String(rawId);
      if (!key || seen.has(key)) return;
      seen.add(key);
      footnoteNumberById[key] = counter;
      counter += 1;
    });
  } catch {
    // Best effort: if traversal fails, fall back to no numbering map.
  }
  return footnoteNumberById;
}

function buildConverterContext(converter, footnoteNumberById) {
  if (!converter) return undefined;
  return {
    docx: converter.convertedXml,
    ...(Object.keys(footnoteNumberById).length > 0 ? { footnoteNumberById } : {}),
    translatedLinkedStyles: converter.translatedLinkedStyles,
    translatedNumbering: converter.translatedNumbering,
  };
}

function buildHeaderFooterConverterContext(converter) {
  if (!converter) return undefined;
  return {
    docx: converter.convertedXml,
    numbering: converter.numbering,
    translatedLinkedStyles: converter.translatedLinkedStyles,
    translatedNumbering: converter.translatedNumbering,
  };
}

function toHeaderFooterDoc(doc) {
  if (!doc || typeof doc !== 'object') return null;
  if (doc.type === 'doc') return doc;
  if (Array.isArray(doc.content)) {
    return { type: 'doc', content: doc.content };
  }
  return null;
}

function collectHeaderFooterIds(idConfig, docsById) {
  const ids = new Set();

  for (const variant of HEADER_FOOTER_VARIANTS) {
    const value = idConfig?.[variant];
    if (typeof value === 'string' && value.length > 0) {
      ids.add(value);
    }
  }

  const arrayIds = idConfig?.ids;
  if (Array.isArray(arrayIds)) {
    for (const value of arrayIds) {
      if (typeof value === 'string' && value.length > 0) {
        ids.add(value);
      }
    }
  }

  if (docsById && typeof docsById === 'object') {
    for (const key of Object.keys(docsById)) {
      if (typeof key === 'string' && key.length > 0) {
        ids.add(key);
      }
    }
  }

  return ids;
}

function buildHeaderFooterInput({ toFlowBlocks, converter, converterContext, atomNodeTypes, layoutOptions, mediaFiles }) {
  const headers = converter?.headers ?? {};
  const footers = converter?.footers ?? {};
  const headerIds = converter?.headerIds ?? {};
  const footerIds = converter?.footerIds ?? {};

  const docDefaults = converter?.getDocumentDefaultStyles?.();
  const defaultFont = docDefaults?.typeface;
  const defaultSize = docDefaults?.fontSizePt != null ? docDefaults.fontSizePt * (96 / 72) : undefined;

  const createResolver = (kind, docsById, idConfig) => {
    const cache = new Map();
    const getBlocksById = (rId) => {
      if (cache.has(rId)) return cache.get(rId);
      const doc = toHeaderFooterDoc(docsById?.[rId]);
      if (!doc) {
        cache.set(rId, undefined);
        return undefined;
      }
      const blockIdPrefix = `hf-${kind}-${rId}-`;
      const result = toFlowBlocks(doc, {
        mediaFiles,
        blockIdPrefix,
        converterContext,
        defaultFont,
        defaultSize,
        ...(atomNodeTypes.length > 0 ? { atomNodeTypes } : {}),
      });
      const blocks = Array.isArray(result?.blocks) && result.blocks.length > 0 ? result.blocks : undefined;
      cache.set(rId, blocks);
      return blocks;
    };

    const batch = {};
    for (const variant of HEADER_FOOTER_VARIANTS) {
      const rId = idConfig?.[variant];
      if (typeof rId !== 'string' || !rId) continue;
      const blocks = getBlocksById(rId);
      if (blocks?.length) {
        batch[variant] = blocks;
      }
    }

    const allIds = collectHeaderFooterIds(idConfig, docsById);
    const byRId = new Map();
    for (const rId of allIds) {
      const blocks = getBlocksById(rId);
      if (blocks?.length) {
        byRId.set(rId, blocks);
      }
    }

    return {
      batch: Object.keys(batch).length > 0 ? batch : undefined,
      byRId: byRId.size > 0 ? byRId : undefined,
    };
  };

  const header = createResolver('header', headers, headerIds);
  const footer = createResolver('footer', footers, footerIds);
  const constraints = computeHeaderFooterConstraints(layoutOptions);

  if (!constraints) return null;
  if (!header.batch && !footer.batch && !header.byRId && !footer.byRId) return null;

  return {
    headerBlocks: header.batch,
    footerBlocks: footer.batch,
    headerBlocksByRId: header.byRId,
    footerBlocksByRId: footer.byRId,
    constraints,
  };
}

function parseNamedImports(importList) {
  const mappings = new Map();
  const chunks = importList
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  for (const chunk of chunks) {
    const match = chunk.match(/^([A-Za-z0-9_$]+)\s+as\s+([A-Za-z0-9_$]+)$/);
    if (match) {
      const [, importedName, localName] = match;
      mappings.set(localName, importedName);
      continue;
    }

    if (/^[A-Za-z0-9_$]+$/.test(chunk)) {
      mappings.set(chunk, chunk);
    }
  }

  return mappings;
}

function parseNamedExports(moduleSource) {
  const mappings = new Map();
  const exportPattern = /export\s*\{([\s\S]*?)\}\s*;/g;

  for (const match of moduleSource.matchAll(exportPattern)) {
    const exportList = match[1];
    const entries = exportList
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);

    for (const entry of entries) {
      const aliasMatch = entry.match(/^([A-Za-z0-9_$]+)\s+as\s+([A-Za-z0-9_$]+)$/);
      if (aliasMatch) {
        const [, localName, publicName] = aliasMatch;
        mappings.set(publicName, localName);
        continue;
      }

      if (/^[A-Za-z0-9_$]+$/.test(entry)) {
        mappings.set(entry, entry);
      }
    }
  }

  return mappings;
}

async function resolveRuntimeChunkInfo(superEditorModulePath) {
  const moduleSource = await fs.readFile(superEditorModulePath, 'utf8');
  const importPattern = /import\s*\{([\s\S]*?)\}\s*from\s*['"](\.\/chunks\/[^'"]+\.es\.js)['"];/g;
  const publicToLocalExports = parseNamedExports(moduleSource);
  const localEditorName = publicToLocalExports.get('Editor') ?? 'Editor';
  const localStarterName = publicToLocalExports.get('getStarterExtensions') ?? 'getStarterExtensions';
  const localPresentationName = publicToLocalExports.get('PresentationEditor') ?? 'PresentationEditor';

  for (const match of moduleSource.matchAll(importPattern)) {
    const [, importList, chunkSpec] = match;
    const imports = parseNamedImports(importList);

    const editorExportName = imports.get(localEditorName);
    const starterExportName = imports.get(localStarterName);
    const presentationExportName = imports.get(localPresentationName) ?? null;

    if (!editorExportName || !starterExportName) {
      continue;
    }

    const chunkPath = path.resolve(path.dirname(superEditorModulePath), chunkSpec);
    const chunkSource = await fs.readFile(chunkPath, 'utf8');

    return {
      chunkPath,
      chunkSource,
      exportNames: {
        Editor: editorExportName,
        getStarterExtensions: starterExportName,
        PresentationEditor: presentationExportName,
      },
    };
  }

  throw new Error(
    `Unable to resolve Editor/getStarterExtensions import mapping from module: ${superEditorModulePath}`,
  );
}

function rewriteRelativeImports(source, chunkDir) {
  return source.replace(
    /(from\s+['"]|import\(\s*['"])(\.\.?\/[^'"]+)(['"])/g,
    (match, prefix, relPath, suffix) => {
      const absUrl = pathToFileURL(path.resolve(chunkDir, relPath)).href;
      return `${prefix}${absUrl}${suffix}`;
    },
  );
}

async function loadRuntimeModule(moduleUrl, { requireHeadlessPrimitives }) {
  const modulePath = fileURLToPath(moduleUrl);
  const runtimeInfo = await resolveRuntimeChunkInfo(modulePath);
  const chunkDir = path.dirname(runtimeInfo.chunkPath);
  const tempModulePath = path.join(
    chunkDir,
    `.layout-snapshot-runtime-${process.pid}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.mjs`,
  );
  const rewrittenSource = rewriteRelativeImports(runtimeInfo.chunkSource, chunkDir);
  const exportLine =
    '\nexport { toFlowBlocks, FlowBlockCache, buildFootnotesInput, getAtomNodeTypes, buildPositionMapFromPmDoc, incrementalLayout, measureBlock };\n';
  await fs.writeFile(tempModulePath, `${rewrittenSource}${exportLine}`, 'utf8');

  try {
    const runtimeModule = await import(pathToFileURL(tempModulePath).href);
    const Editor = runtimeModule[runtimeInfo.exportNames.Editor];
    const getStarterExtensions = runtimeModule[runtimeInfo.exportNames.getStarterExtensions];
    const PresentationEditor = runtimeInfo.exportNames.PresentationEditor
      ? runtimeModule[runtimeInfo.exportNames.PresentationEditor]
      : undefined;

    if (!Editor || !getStarterExtensions) {
      throw new Error('Failed to resolve Editor/getStarterExtensions from extracted runtime module.');
    }

    const headlessPrimitives = {
      toFlowBlocks: runtimeModule.toFlowBlocks,
      FlowBlockCache: runtimeModule.FlowBlockCache,
      buildFootnotesInput: runtimeModule.buildFootnotesInput,
      getAtomNodeTypes: runtimeModule.getAtomNodeTypes,
      buildPositionMapFromPmDoc: runtimeModule.buildPositionMapFromPmDoc,
      incrementalLayout: runtimeModule.incrementalLayout,
      measureBlock: runtimeModule.measureBlock,
    };

    if (requireHeadlessPrimitives) {
      for (const [name, value] of Object.entries(headlessPrimitives)) {
        if (typeof value === 'undefined') {
          throw new Error(`Headless primitive "${name}" not found in extracted runtime module.`);
        }
      }
    }

    return {
      moduleExports: {
        Editor,
        PresentationEditor,
        getStarterExtensions,
      },
      headlessPrimitives: requireHeadlessPrimitives ? headlessPrimitives : null,
    };
  } finally {
    await fs.rm(tempModulePath, { force: true }).catch(() => {});
  }
}

function writeWithBackpressure(writer, chunk) {
  return new Promise((resolve) => {
    const ok = writer.write(chunk);
    if (ok) {
      resolve();
      return;
    }
    writer.once('drain', () => resolve());
  });
}

function createSerialLineWriter(writer) {
  let queue = Promise.resolve();
  return {
    push(line) {
      queue = queue.then(() => writeWithBackpressure(writer, `${line}\n`));
      return queue;
    },
    flush() {
      return queue;
    },
  };
}

function pipeWithPrefix(stream, prefix, lineWriter, { suppressLine } = {}) {
  if (!stream) return Promise.resolve();

  return (async () => {
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
    try {
      for await (const line of rl) {
        if (suppressLine?.(line)) continue;
        const wrapped = wrapText(`${prefix}${line}`);
        for (const wrappedLine of wrapped) {
          await lineWriter.push(wrappedLine);
        }
      }
    } catch {
      // Best effort forwarding: ignore stream forwarding errors and let worker exit code decide failure.
    }
  })();
}

function chunkDocEntries(entries, jobs) {
  const chunks = Array.from({ length: jobs }, () => []);
  entries.forEach((entry, index) => {
    chunks[index % jobs].push(entry);
  });
  return chunks;
}

async function runWorkers({ args, moduleUrl, docs, totalDocs, inputRoot, outputRoot }) {
  const runTempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'layout-snapshots-'));
  const chunks = chunkDocEntries(docs, args.jobs).filter((chunk) => chunk.length > 0);
  const workerLogWriter = createSerialLineWriter(process.stdout);

  const workerSpecs = [];
  for (let i = 0; i < chunks.length; i += 1) {
    const workerId = i + 1;
    const manifestPath = path.join(runTempDir, `worker-${workerId}.manifest.json`);
    const summaryPath = path.join(runTempDir, `worker-${workerId}.summary.json`);

    await fs.writeFile(
      manifestPath,
      JSON.stringify({
        docs: chunks[i],
      }),
      'utf8',
    );

    workerSpecs.push({ workerId, manifestPath, summaryPath, docCount: chunks[i].length });
  }

  const runtime = process.execPath;

  const runWorker = (spec) =>
    new Promise((resolve) => {
      const workerArgs = [
        SCRIPT_PATH,
        '--worker',
        '--worker-id',
        String(spec.workerId),
        '--worker-manifest',
        spec.manifestPath,
        '--total-docs',
        String(totalDocs),
        '--summary-file',
        spec.summaryPath,
        '--input-root',
        inputRoot,
        '--output-root',
        outputRoot,
        '--module',
        moduleUrl,
        '--pipeline',
        args.pipeline,
        '--jobs',
        '1',
        '--timeout-ms',
        String(args.timeoutMs),
        '--no-clean-output',
        '--suppress-final-summary',
      ];

      if (args.failFast) workerArgs.push('--fail-fast');
      if (args.telemetryEnabled) workerArgs.push('--enable-telemetry');
      else workerArgs.push('--disable-telemetry');

      const child = spawn(runtime, workerArgs, {
        cwd: process.cwd(),
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      const suppressLine = (line) => shouldSuppressTelemetryDisabledLog(line, args.telemetryEnabled);
      const stdoutDone = pipeWithPrefix(child.stdout, `[w${spec.workerId}] `, workerLogWriter, { suppressLine });
      const stderrDone = pipeWithPrefix(child.stderr, `[w${spec.workerId}] `, workerLogWriter, { suppressLine });

      child.on('close', (code) => {
        Promise.all([stdoutDone, stderrDone]).then(() => {
          resolve({ spec, code: code ?? 1 });
        });
      });
      child.on('error', () => {
        Promise.all([stdoutDone, stderrDone]).then(() => {
          resolve({ spec, code: 1 });
        });
      });
    });

  const results = await Promise.all(workerSpecs.map((spec) => runWorker(spec)));
  await workerLogWriter.flush();

  const summaries = [];
  for (const result of results) {
    try {
      const raw = await fs.readFile(result.spec.summaryPath, 'utf8');
      const parsed = JSON.parse(raw);
      summaries.push(parsed);
    } catch {
      summaries.push({
        elapsedMs: 0,
        successCount: 0,
        failures: [
          {
            path: `worker-${result.spec.workerId}`,
            message: `Worker exited with code ${result.code} and did not produce summary output.`,
          },
        ],
        phaseTotals: {
          importMs: 0,
          editorInitMs: 0,
          layoutWaitMs: 0,
          layoutMs: 0,
          serializeMs: 0,
          writeMs: 0,
          totalMs: 0,
        },
      });
    }
  }

  await fs.rm(runTempDir, { recursive: true, force: true }).catch(() => {});

  const merged = {
    elapsedMs: summaries.reduce((sum, s) => sum + (s.elapsedMs ?? 0), 0),
    successCount: summaries.reduce((sum, s) => sum + (s.successCount ?? 0), 0),
    failures: summaries.flatMap((s) => s.failures ?? []),
    phaseTotals: {
      importMs: summaries.reduce((sum, s) => sum + (s.phaseTotals?.importMs ?? 0), 0),
      editorInitMs: summaries.reduce((sum, s) => sum + (s.phaseTotals?.editorInitMs ?? 0), 0),
      layoutWaitMs: summaries.reduce((sum, s) => sum + (s.phaseTotals?.layoutWaitMs ?? 0), 0),
      layoutMs: summaries.reduce((sum, s) => sum + (s.phaseTotals?.layoutMs ?? 0), 0),
      serializeMs: summaries.reduce((sum, s) => sum + (s.phaseTotals?.serializeMs ?? 0), 0),
      writeMs: summaries.reduce((sum, s) => sum + (s.phaseTotals?.writeMs ?? 0), 0),
      totalMs: summaries.reduce((sum, s) => sum + (s.phaseTotals?.totalMs ?? 0), 0),
    },
  };

  return merged;
}

function printFinalSummary({ elapsedMs, successCount, failures, phaseTotals, outputRoot }) {
  console.log('');
  logLine(`[layout-snapshots] Success: ${successCount}`);
  logLine(`[layout-snapshots] Failed:  ${failures.length}`);
  logLine(`[layout-snapshots] Snapshot output directory: ${outputRoot}`);
  logLine(`[layout-snapshots] Snapshot files written: ${successCount}`);

  if (successCount > 0) {
    const avgMs = phaseTotals.totalMs / successCount;
    const pct = (value) => (phaseTotals.totalMs > 0 ? ((value / phaseTotals.totalMs) * 100).toFixed(1) : '0.0');
    logLine(`[layout-snapshots] Avg/doc: ${formatDuration(avgMs)}`);
    logLine(
      `[layout-snapshots] Phase totals: import ${formatDuration(phaseTotals.importMs)} (${pct(phaseTotals.importMs)}%), editorInit ${formatDuration(phaseTotals.editorInitMs)} (${pct(phaseTotals.editorInitMs)}%), waitLayout ${formatDuration(phaseTotals.layoutWaitMs)} (${pct(phaseTotals.layoutWaitMs)}%), layoutTotal ${formatDuration(phaseTotals.layoutMs)} (${pct(phaseTotals.layoutMs)}%), serialize ${formatDuration(phaseTotals.serializeMs)} (${pct(phaseTotals.serializeMs)}%), write ${formatDuration(phaseTotals.writeMs)} (${pct(phaseTotals.writeMs)}%)`,
    );

  }

  if (failures.length > 0) {
    for (const failure of failures) {
      const elapsed = typeof failure.elapsedMs === 'number' ? ` after ${formatDuration(failure.elapsedMs)}` : '';
      logLine(`- ${failure.path}${elapsed}: ${failure.message}`);
    }
  }

  logLine(`[layout-snapshots] Complete in ${(elapsedMs / 1000).toFixed(2)}s`);
}

async function renderWithPresentation({
  Editor,
  PresentationEditor,
  getStarterExtensions,
  args,
  docxPath,
  docId,
  relativePath,
}) {
  let presentation = null;
  let host = null;

  let importMs = 0;
  let editorInitMs = 0;
  let layoutWaitMs = 0;
  let layoutMs = 0;
  let paintSnapshot = null;

  try {
    const importStartedAtMs = nowMs();
    const docxBuffer = await fs.readFile(docxPath);
    const loaded = await Editor.loadXmlData(docxBuffer, true);
    if (!Array.isArray(loaded) || loaded.length < 4) {
      throw new Error('Editor.loadXmlData returned invalid data');
    }
    importMs = nowMs() - importStartedAtMs;

    const [content, media, mediaFiles, fonts] = loaded;

    host = document.createElement('div');
    document.body.appendChild(host);

    const layoutStartedAtMs = nowMs();
    const editorInitStartedAtMs = nowMs();
    presentation = new PresentationEditor({
      element: host,
      documentId: docId,
      mode: 'docx',
      telemetry: { enabled: args.telemetryEnabled },
      extensions: getStarterExtensions(),
      content,
      media,
      mediaFiles,
      fonts,
      layoutEngineOptions: {
        virtualization: { enabled: false },
      },
    });
    editorInitMs = nowMs() - editorInitStartedAtMs;

    const layoutWaitStartedAtMs = nowMs();
    const payload = await waitForLayoutUpdate(presentation, args.timeoutMs);
    layoutWaitMs = nowMs() - layoutWaitStartedAtMs;
    layoutMs = nowMs() - layoutStartedAtMs;

    const snapshot = presentation.getLayoutSnapshot();
    const layoutOptions = presentation.getLayoutOptions();
    const pageCount = snapshot.layout?.pages?.length ?? 0;
    paintSnapshot = readPaintSnapshotFromPresentation(presentation, host);

    return {
      snapshot,
      paintSnapshot,
      layoutOptions,
      metrics: payload.metrics,
      pageCount,
      timings: {
        importMs,
        editorInitMs,
        layoutWaitMs,
        layoutMs,
      },
      pipelineRuntime: {
        mode: 'presentation',
      },
    };
  } finally {
    try {
      presentation?.destroy?.();
    } catch {}
    try {
      host?.remove?.();
    } catch {}
  }
}

async function renderPaintSnapshotWithPresentation({
  PresentationEditor,
  getStarterExtensions,
  args,
  docId,
  content,
  media,
  mediaFiles,
  fonts,
}) {
  if (!PresentationEditor) {
    throw new Error('PresentationEditor is required to capture paintSnapshot.');
  }

  let presentation = null;
  let host = null;
  try {
    host = document.createElement('div');
    document.body.appendChild(host);

    presentation = new PresentationEditor({
      element: host,
      documentId: `${docId}-paint`,
      mode: 'docx',
      telemetry: { enabled: args.telemetryEnabled },
      extensions: getStarterExtensions(),
      content,
      media,
      mediaFiles,
      fonts,
      layoutEngineOptions: {
        virtualization: { enabled: false },
      },
    });

    await waitForLayoutUpdate(presentation, args.timeoutMs);
    return readPaintSnapshotFromPresentation(presentation, host);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to capture paintSnapshot via PresentationEditor: ${message}`);
  } finally {
    try {
      presentation?.destroy?.();
    } catch {}
    try {
      host?.remove?.();
    } catch {}
  }
}

async function renderWithHeadless({
  Editor,
  PresentationEditor,
  getStarterExtensions,
  headlessPrimitives,
  args,
  docxPath,
  docId,
  relativePath,
}) {
  let editor = null;

  let importMs = 0;
  let editorInitMs = 0;
  let layoutMs = 0;
  let paintSnapshot = null;

  try {
    const importStartedAtMs = nowMs();
    const docxBuffer = await fs.readFile(docxPath);
    const loaded = await Editor.loadXmlData(docxBuffer, true);
    if (!Array.isArray(loaded) || loaded.length < 4) {
      throw new Error('Editor.loadXmlData returned invalid data');
    }
    importMs = nowMs() - importStartedAtMs;

    const [content, media, mediaFiles, fonts] = loaded;

    const editorInitStartedAtMs = nowMs();
    editor = new Editor({
      documentId: docId,
      mode: 'docx',
      isHeadless: true,
      telemetry: { enabled: args.telemetryEnabled },
      extensions: getStarterExtensions(),
      content,
      media,
      mediaFiles,
      fonts,
    });
    editorInitMs = nowMs() - editorInitStartedAtMs;

    const layoutStartedAtMs = nowMs();

    const docJson = editor.getJSON?.() ?? editor.state?.doc?.toJSON?.();
    if (!docJson || typeof docJson !== 'object') {
      throw new Error('Failed to serialize editor document JSON for headless layout');
    }

    const sectionMetadata = [];
    const footnoteNumberById = buildFootnoteNumberById(editor);
    const converterContext = buildConverterContext(editor.converter, footnoteNumberById);
    const atomNodeTypes = headlessPrimitives.getAtomNodeTypes(editor?.schema ?? null);
    const positionMap =
      editor?.state?.doc && docJson ? headlessPrimitives.buildPositionMapFromPmDoc(editor.state.doc, docJson) : null;

    const flowBlockCache = new headlessPrimitives.FlowBlockCache();
    const toFlowBlocksStart = nowMs();
    const toFlowResult = headlessPrimitives.toFlowBlocks(docJson, {
      mediaFiles: editor?.storage?.image?.media,
      emitSectionBreaks: true,
      sectionMetadata,
      trackedChangesMode: 'review',
      enableTrackedChanges: true,
      enableComments: true,
      enableRichHyperlinks: true,
      themeColors: editor?.converter?.themeColors ?? undefined,
      converterContext,
      flowBlockCache,
      ...(positionMap ? { positions: positionMap } : {}),
      ...(atomNodeTypes.length > 0 ? { atomNodeTypes } : {}),
    });
    const toFlowBlocksMs = nowMs() - toFlowBlocksStart;

    const blocks = toFlowResult?.blocks;
    if (!Array.isArray(blocks)) {
      throw new Error('toFlowBlocks returned invalid blocks in headless mode');
    }

    const defaults = computeDefaultLayoutDefaults(editor.converter);
    const baseLayoutOptions = resolveLayoutOptions({ defaults, blocks, sectionMetadata });

    const footnotesLayoutInput = headlessPrimitives.buildFootnotesInput(
      editor?.state,
      editor?.converter,
      converterContext,
      editor?.converter?.themeColors ?? undefined,
    );

    const layoutOptions = footnotesLayoutInput ? { ...baseLayoutOptions, footnotes: footnotesLayoutInput } : baseLayoutOptions;

    const headerFooterInput = buildHeaderFooterInput({
      toFlowBlocks: headlessPrimitives.toFlowBlocks,
      converter: editor?.converter,
      converterContext: buildHeaderFooterConverterContext(editor?.converter),
      atomNodeTypes,
      layoutOptions,
      mediaFiles:
        (editor?.storage?.image?.media && Object.keys(editor.storage.image.media).length > 0
          ? editor.storage.image.media
          : editor?.converter?.media) ?? undefined,
    });

    const incrementalLayoutStart = nowMs();
    const layoutResult = await headlessPrimitives.incrementalLayout(
      [],
      null,
      blocks,
      layoutOptions,
      (block, constraints) => headlessPrimitives.measureBlock(block, constraints),
      headerFooterInput ?? undefined,
      null,
    );
    const incrementalLayoutMs = nowMs() - incrementalLayoutStart;

    if (!layoutResult?.layout || !Array.isArray(layoutResult?.measures)) {
      throw new Error('incrementalLayout returned invalid result in headless mode');
    }

    const layout = layoutResult.layout;
    layout.pageGap = getEffectivePageGap({ virtualization: { enabled: false }, layoutMode: 'vertical' });

    layoutMs = nowMs() - layoutStartedAtMs;

    const snapshot = {
      layout,
      blocks,
      measures: layoutResult.measures,
      sectionMetadata,
    };

    const pageCount = snapshot.layout?.pages?.length ?? 0;
    paintSnapshot = await renderPaintSnapshotWithPresentation({
      PresentationEditor,
      getStarterExtensions,
      args,
      docId,
      content,
      media,
      mediaFiles,
      fonts,
    });

    return {
      snapshot,
      paintSnapshot,
      layoutOptions: {
        pageSize: layoutOptions.pageSize,
        margins: layoutOptions.margins,
        ...(layoutOptions.columns ? { columns: layoutOptions.columns } : {}),
        virtualization: { enabled: false },
        zoom: 1,
        layoutMode: 'vertical',
      },
      metrics: {
        toFlowBlocksMs,
        incrementalLayoutMs,
        layoutMs,
      },
      pageCount,
      timings: {
        importMs,
        editorInitMs,
        layoutWaitMs: 0,
        layoutMs,
      },
      pipelineRuntime: {
        mode: 'headless',
        toFlowBlocksMs,
        incrementalLayoutMs,
      },
    };
  } finally {
    try {
      editor?.destroy?.();
    } catch {}
  }
}

async function runDocBatch({
  args,
  inputRoot,
  outputRoot,
  moduleUrl,
  envInfo,
  moduleExports,
  headlessPrimitives,
  docEntries,
  totalDocs,
}) {
  const { Editor, PresentationEditor, getStarterExtensions } = moduleExports;

  if (!Editor || !getStarterExtensions) {
    throw new Error(`Module "${args.module}" must export Editor and getStarterExtensions.`);
  }
  if (args.pipeline === 'presentation' && !PresentationEditor) {
    throw new Error(`Module "${args.module}" must export PresentationEditor for pipeline=presentation.`);
  }

  const startedAt = Date.now();
  let successCount = 0;
  const failures = [];
  const phaseTotals = {
    importMs: 0,
    editorInitMs: 0,
    layoutWaitMs: 0,
    layoutMs: 0,
    serializeMs: 0,
    writeMs: 0,
    totalMs: 0,
  };

  for (let localIndex = 0; localIndex < docEntries.length; localIndex += 1) {
    const entry = docEntries[localIndex];
    const docxPath = typeof entry === 'string' ? entry : entry.path;
    const globalIndex = typeof entry === 'object' && typeof entry.index === 'number' ? entry.index : localIndex + 1;

    const { relativePath, outputPath } = makeOutputPath(outputRoot, inputRoot, docxPath);
    const progress = `[${globalIndex}/${totalDocs}]`;

    const docStartedAtMs = nowMs();

    let importMs = 0;
    let editorInitMs = 0;
    let layoutWaitMs = 0;
    let layoutMs = 0;
    let serializeMs = 0;
    let writeMs = 0;

    try {
      const docId = `layout-snapshot-${globalIndex}-${relativePath}`;
      const rendered =
        args.pipeline === 'presentation'
          ? await renderWithPresentation({
              Editor,
              PresentationEditor,
              getStarterExtensions,
              args,
              docxPath,
              docId,
              relativePath,
            })
          : await renderWithHeadless({
              Editor,
              PresentationEditor,
              getStarterExtensions,
              headlessPrimitives,
              args,
              docxPath,
              docId,
              relativePath,
            });

      importMs = rendered.timings.importMs;
      editorInitMs = rendered.timings.editorInitMs;
      layoutWaitMs = rendered.timings.layoutWaitMs;
      layoutMs = rendered.timings.layoutMs;

      const serializeStartedAtMs = nowMs();
      const exportPayload = {
        formatVersion: 1,
        exportedAt: new Date().toISOString(),
        source: {
          docxAbsolutePath: docxPath,
          docxRelativePath: relativePath,
          inputRoot,
        },
        runtime: {
          nodeVersion: process.version,
          isBun: typeof Bun !== 'undefined',
          usingStubCanvas: envInfo.usingStubCanvas,
          superEditorModule: args.module,
          telemetryEnabled: args.telemetryEnabled,
          pipeline: args.pipeline,
          ...rendered.pipelineRuntime,
        },
        layoutSnapshot: rendered.snapshot,
        paintSnapshot: rendered.paintSnapshot ?? null,
        layoutOptions: rendered.layoutOptions,
        metrics: rendered.metrics,
      };

      const jsonSafe = toJsonSafe(exportPayload);
      const jsonOutput = JSON.stringify(jsonSafe, null, 2);
      serializeMs = nowMs() - serializeStartedAtMs;

      const writeStartedAtMs = nowMs();
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      await fs.writeFile(outputPath, jsonOutput, 'utf8');
      writeMs = nowMs() - writeStartedAtMs;

      successCount += 1;
      const docElapsedMs = nowMs() - docStartedAtMs;

      phaseTotals.importMs += importMs;
      phaseTotals.editorInitMs += editorInitMs;
      phaseTotals.layoutWaitMs += layoutWaitMs;
      phaseTotals.layoutMs += layoutMs;
      phaseTotals.serializeMs += serializeMs;
      phaseTotals.writeMs += writeMs;
      phaseTotals.totalMs += docElapsedMs;

      const pageCount = rendered.pageCount ?? rendered.snapshot?.layout?.pages?.length ?? 0;

      const phaseLabel =
        args.pipeline === 'presentation'
          ? `import ${formatDuration(importMs)}, editorInit ${formatDuration(editorInitMs)}, waitLayout ${formatDuration(layoutWaitMs)}, layoutTotal ${formatDuration(layoutMs)}, serialize ${formatDuration(serializeMs)}, write ${formatDuration(writeMs)}`
          : `import ${formatDuration(importMs)}, editorInit ${formatDuration(editorInitMs)}, layoutTotal ${formatDuration(layoutMs)}, serialize ${formatDuration(serializeMs)}, write ${formatDuration(writeMs)}`;

      logDocProgress({ progress, relativePath, pageCount, docElapsedMs, phaseLabel });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const docElapsedMs = nowMs() - docStartedAtMs;
      failures.push({ path: docxPath, message, elapsedMs: docElapsedMs });
      logDocFailure({ progress, relativePath, docElapsedMs, message });
      if (args.failFast) {
        break;
      }
    }
  }

  const elapsedMs = Date.now() - startedAt;
  return {
    elapsedMs,
    successCount,
    failures,
    phaseTotals,
  };
}

async function loadWorkerDocEntries(args) {
  if (!args.workerManifestPath) {
    throw new Error('Worker mode requires --worker-manifest <path>.');
  }
  const raw = await fs.readFile(args.workerManifestPath, 'utf8');
  const parsed = JSON.parse(raw);
  if (!parsed || !Array.isArray(parsed.docs)) {
    throw new Error(`Invalid worker manifest format: ${args.workerManifestPath}`);
  }
  return parsed.docs;
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const restoreConsoleFilter = installTelemetryConsoleFilter(args.telemetryEnabled);
  await ensureDefaultSuperEditorBuild(args);
  const moduleUrl = await resolveModuleUrl(args.module);
  const inputRoot = path.resolve(args.inputRoot);
  const outputRoot = path.resolve(args.outputRoot);

  try {
    const runtime = await loadRuntimeModule(moduleUrl, {
      requireHeadlessPrimitives: args.pipeline === 'headless',
    });
    const moduleExports = runtime.moduleExports;
    const headlessPrimitives = runtime.headlessPrimitives;

    const envInfo = installDomEnvironment();
    if (envInfo.usingStubCanvas) {
      console.warn(
        '[layout-snapshots] Native canvas is unavailable in this runtime; using approximate text metrics (not pixel-perfect).',
      );
    }

    let allDocxFiles = [];
    let matchedDocxFiles = [];
    let docEntries = [];

    if (args.isWorker) {
      docEntries = await loadWorkerDocEntries(args);
      allDocxFiles = docEntries.map((entry) => (typeof entry === 'string' ? entry : entry.path));
      matchedDocxFiles = allDocxFiles;
    } else {
      allDocxFiles = await listDocxFiles(inputRoot);
      matchedDocxFiles = filterDocxFilesByMatchPatterns(allDocxFiles, inputRoot, args.matches);
      if (args.matches.length > 0 && matchedDocxFiles.length === 0) {
        throw new Error(
          `No DOCX files matched --match patterns (${args.matches.join(', ')}) under ${inputRoot}.`,
        );
      }

      const limited = args.limit ? matchedDocxFiles.slice(0, args.limit) : matchedDocxFiles;
      docEntries = limited.map((docxPath, index) => ({ path: docxPath, index: index + 1 }));
    }

    const totalDocs = args.totalDocs && Number.isFinite(args.totalDocs) && args.totalDocs > 0 ? args.totalDocs : docEntries.length;

    if (!args.isWorker) {
      assertSafeOutputRoot(outputRoot);
      if (args.cleanOutput) {
        await fs.rm(outputRoot, { recursive: true, force: true });
      }
      await fs.mkdir(outputRoot, { recursive: true });

      logLine(`[layout-snapshots] Input root:  ${inputRoot}`);
      logLine(`[layout-snapshots] Output root: ${outputRoot}`);
      logLine(`[layout-snapshots] Docs found:  ${allDocxFiles.length}`);
      if (args.matches.length > 0) {
        logLine(`[layout-snapshots] Match:      ${args.matches.join(', ')}`);
        logLine(`[layout-snapshots] Docs matched: ${matchedDocxFiles.length}`);
      }
      logLine(`[layout-snapshots] Docs to run: ${docEntries.length}`);
      logLine(`[layout-snapshots] Module:      ${moduleUrl}`);
      logLine(`[layout-snapshots] Pipeline:    ${args.pipeline}`);
      logLine(`[layout-snapshots] Jobs:        ${args.jobs}`);
      logLine(`[layout-snapshots] Telemetry:   ${args.telemetryEnabled ? 'enabled' : 'disabled'}`);
    }

    let summary;
    const wallStart = Date.now();

    if (!args.isWorker && args.jobs > 1) {
      summary = await runWorkers({
        args,
        moduleUrl,
        docs: docEntries,
        totalDocs,
        inputRoot,
        outputRoot,
      });
      summary.elapsedMs = Date.now() - wallStart;
    } else {
      summary = await runDocBatch({
        args,
        inputRoot,
        outputRoot,
        moduleUrl,
        envInfo,
        moduleExports,
        headlessPrimitives,
        docEntries,
        totalDocs,
      });
    }

    if (args.summaryFile) {
      await fs.mkdir(path.dirname(path.resolve(args.summaryFile)), { recursive: true });
      await fs.writeFile(path.resolve(args.summaryFile), JSON.stringify(summary), 'utf8');
    }

    if (!args.suppressFinalSummary) {
      printFinalSummary({
        ...summary,
        outputRoot,
      });
    }

    if (summary.failures?.length > 0) {
      process.exitCode = 1;
    }
  } finally {
    restoreConsoleFilter();
  }
}

run().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  errorLine(`[layout-snapshots] Fatal: ${message}`);
  process.exit(1);
});
