/**
 * Shared parsing for GitHub Actions path filters.
 *
 * One implementation for both guards that read them:
 *   - `superdoc/public/scripts/check-workflow-paths.mjs` (public workflows)
 *   - `scripts/superdoc-workflow-policy.mjs` (Orbit-owned workflows)
 *
 * They existed as two hand-written parsers and diverged: fixes for character
 * classes, quoted brackets, `paths-ignore`, and block-scalar headers landed in
 * one and not the other, so the same dead filter was caught in one tree and
 * missed in the other. Sharing the parser makes a fix apply once.
 *
 * Why not a YAML library
 * ---------------------
 * Both guards run from a clean checkout with no install step, which is what
 * lets them sit early in CI and in pre-merge hooks. Pulling in a parser would
 * trade that away, and would not settle the parts that actually bite: dorny's
 * `filters:` block is not a standard trigger, and GitHub's glob dialect is not
 * YAML's problem. A focused evaluation belongs in its own change.
 *
 * What is parsed
 * --------------
 * - `paths:` / `paths-ignore:` on a trigger, in block and flow form, on one
 *   line or several
 * - `dorny/paths-filter` `filters: |` blocks, including chomping and
 *   indentation indicators and a trailing comment
 *
 * `paths-ignore` entries and `!negations` are dropped: both subtract from a
 * set, so naming a path that does not exist is legitimate.
 *
 * Parsed line-wise rather than with a YAML library because the guards must
 * report the exact line to edit, and both forms are flat lists of scalars.
 */

// A YAML key may be quoted (`'paths':`, `"paths":`), which is equivalent to the
// bare spelling and appears in hand-written workflows. Every key this parser
// recognizes is built through this helper, because defining the quoting rule
// once per key is how `filters` came to accept only the bare form after `paths`
// and `on` had been fixed.
const quotable = (name) => String.raw`['"]?${name}['"]?`;

// A `filters:` block scalar header. Both literal (`|`) and folded (`>`) forms,
// each with optional chomping and indentation indicators in either order, and an
// optional trailing comment. dorny reads a folded block fine, because the
// more-indented sequence lines keep their newlines.
const DORNY_OPEN = new RegExp(
  String.raw`^(\s*)${quotable('filters')}:\s*[|>](?:[-+]?\d?|\d?[-+]?)\s*(?:#.*)?$`,
);
const KEY = quotable(String.raw`paths(-ignore)?`);
const PATHS_KEY = new RegExp(String.raw`^(\s*)${KEY}:\s*(?:#.*)?$`);
const PATHS_FLOW = new RegExp(String.raw`^(\s*)${KEY}:\s*\[(.*)$`);
// The same key inside a flow mapping (`push: { paths: ['a/**'] }`), where it is
// not at the start of the line. Only the key is matched here; the array body is
// scanned separately, because a `]` inside a quoted character class is not the
// closer.
const PATHS_INLINE = new RegExp(String.raw`(?:^|[{,]\s*)${quotable(String.raw`(paths(?:-ignore)?)`)}\s*:\s*\[`, 'g');
// Any occurrence of the key at all, used only to decide whether an unreadable
// line should be reported rather than skipped.
const PATHS_ANYWHERE = new RegExp(String.raw`(?:^|[\s{,])${quotable(String.raw`paths(?:-ignore)?`)}\s*:`);
const LIST_ENTRY = /^(\s*)-\s*(.+?)\s*$/;

/**
 * Translate a GitHub Actions path filter into a RegExp.
 *
 * The dialect, per GitHub's workflow-syntax reference:
 *   `**`  any characters, including `/`
 *   `*`   any characters except `/`
 *   `?`   zero or one of the PRECEDING character
 *   `+`   one or more of the PRECEDING character
 *   `[]`  character class
 *   `\`   escapes the next character to match it literally
 *
 * `?` and `+` are postfix quantifiers over what came before, not wildcards in
 * their own right. Reading either as a standalone character class makes a live
 * filter look dead, which blocks a correct workflow.
 *
 * Character classes are translated rather than escaped: `*.[dD][oO][cC][xX]` is
 * how a case-insensitive filter is written, and escaping the brackets would look
 * for a literal `[dD]`.
 */
export function globToRegExp(glob) {
  // Atoms rather than one string, because `?` makes the PRECEDING atom optional
  // and that cannot be done by appending.
  const atoms = [];
  for (let i = 0; i < glob.length; i += 1) {
    if (glob.startsWith('**/', i)) {
      atoms.push('(?:.*/)?');
      i += 2;
    } else if (glob.startsWith('**', i)) {
      atoms.push('.*');
      i += 1;
    } else if (glob[i] === '*') {
      atoms.push('[^/]*');
    } else if (glob[i] === '?' || glob[i] === '+') {
      // Postfix quantifiers over the preceding atom: `?` is zero-or-one, `+` is
      // one-or-more. So `ym?l` matches `yml` and `yl`, and `ym+l` matches `yml`
      // and `ymml`. With nothing to quantify they degrade to a single-character
      // class rather than producing an invalid expression.
      const quantifier = glob[i] === '?' ? '?' : '+';
      const previous = atoms.pop();
      if (previous === undefined) atoms.push(`[^/]${quantifier}`);
      else atoms.push(`(?:${previous})${quantifier}`);
    } else if (glob[i] === '\\' && i + 1 < glob.length) {
      // A backslash escapes the next character so it matches literally.
      atoms.push(glob[i + 1].replace(/[.+*?^${}()|[\]\\]/g, '\\$&'));
      i += 1;
    } else if (glob[i] === '[') {
      const close = glob.indexOf(']', i + 1);
      if (close === -1) {
        atoms.push('\\[');
      } else {
        atoms.push(`[${glob.slice(i + 1, close).replace(/\\/g, '\\\\')}]`);
        i = close;
      }
    } else {
      atoms.push(glob[i].replace(/[.+^${}()|[\]\\]/g, '\\$&'));
    }
  }
  return new RegExp(`^${atoms.join('')}$`);
}

/**
 * Does a filter select anything in `files`?
 *
 * A leaf that starts with a wildcard names a kind of file rather than a
 * location, so no rename can strand it and matching nothing today is a fact
 * about the tree. Sometimes that is the intent: the DOCX privacy gate watches
 * `*.[dD][oO][cC][xX]` so a fixture landing there trips a scan, and a repo with
 * no such file is the healthy state.
 *
 * The directory part still has to exist, because that half CAN go stale: a
 * deleted package makes `packages/gone/*.ts` unreachable even though `*.ts`
 * names a kind. A leaf with literal text before the wildcard
 * (`superdoc-subtree-*.yml`) names a family that was expected to exist, so it
 * stays checked too.
 *
 * `dirExists` lets a caller resolve the directory half; without it, only root
 * and `**` prefixes are treated as present.
 */
export function matchesSomething(glob, files, dirExists) {
  const pattern = globToRegExp(glob);
  if (files.some((file) => pattern.test(file))) return true;

  // A wildcard-free trigger has to match a tracked path exactly, which the
  // anchored pattern above already decided.
  //
  // A bare directory name is deliberately NOT treated as a prefix. GitHub's
  // `paths:` semantics would expand it, but the lane selector in
  // scripts/superdoc-protected-lanes.mjs matches the anchored glob, so `scripts`
  // selects no change while `scripts/**` selects everything beneath. Reporting
  // the first as live would call a trigger healthy that cannot activate its own
  // lane, and "live but selects nothing" is a worse answer than either verdict
  // alone. Same for a trailing slash: write the `/**` if that is the intent.
  if (!/[*?[]/.test(glob)) return false;

  const lastSlash = glob.lastIndexOf('/');
  const dir = lastSlash === -1 ? '' : glob.slice(0, lastSlash);
  const leaf = glob.slice(lastSlash + 1);
  if (!leaf.startsWith('*') || leaf.includes('**')) return false;
  // Root and `**` are always present; check them before rejecting a wildcard
  // directory, since `**/*.md` has `**` as its dir.
  if (dir === '' || dir === '**') return true;
  if (dir.includes('*')) return false;
  if (typeof dirExists === 'function') return dirExists(dir);
  // No resolver: fall back to the tracked list, which reports a directory only
  // through its contents.
  return files.some((file) => file.startsWith(`${dir}/`));
}

/**
 * The path values of one dorny filter entry.
 *
 * dorny's own `FilterItemYaml` is
 * `string | { [changeTypes]: string | string[] } | FilterItemYaml[]`, so an
 * entry may be a bare glob or a change-type mapping whose value is one glob or
 * a list of them:
 *
 *     - 'src/**'
 *     - added: 'src/**'
 *     - added|modified: ['src/**', 'docs/**']
 *
 * The change types are `added`, `modified`, and `deleted`, joined by `|`. They
 * are metadata, not part of the path, so passing the whole mapping through as a
 * glob reports a live filter as dead.
 */
function dornyEntryValues(raw) {
  const mapping = raw.match(/^((?:added|modified|deleted)(?:\|(?:added|modified|deleted))*)\s*:\s*(.*)$/);
  const value = mapping ? mapping[2].trim() : raw;
  if (value.startsWith('[')) {
    const close = findFlowClose(value.slice(1));
    if (close !== -1) return splitFlowEntries(value.slice(1, close + 1));
  }
  return [value];
}

/** Remove an unquoted trailing comment, leaving a `#` inside quotes alone. */
function stripComment(text) {
  let quote = null;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === "'" || ch === '"') {
      quote = ch;
    } else if (ch === '#') {
      return text.slice(0, i);
    }
  }
  return text;
}

/** Find a flow sequence's closing `]`, ignoring brackets inside quoted values. */
function findFlowClose(text) {
  let quote = null;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === "'" || ch === '"') {
      quote = ch;
    } else if (ch === ']') {
      return i;
    }
  }
  return -1;
}

/** Split a flow sequence body on commas outside quoted values. */
function splitFlowEntries(text) {
  const out = [];
  let quote = null;
  let current = '';
  for (const ch of text) {
    if (quote) {
      current += ch;
      if (ch === quote) quote = null;
    } else if (ch === "'" || ch === '"') {
      quote = ch;
      current += ch;
    } else if (ch === ',') {
      if (current.trim()) out.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

/**
 * Unquote one scalar.
 *
 * Comments come off before quotes: the other order strands the closing quote
 * mid-string (`'scripts/**' # note` -> `scripts/**'`) and reports a live filter
 * as dead. A `#` inside quotes is part of the path.
 */
function unquote(raw) {
  const value = raw.trim();
  const quoted = value.match(/^(['"])(.*?)\1\s*(?:#.*)?$/);
  return quoted ? quoted[2] : value.replace(/\s+#.*$/, '').trim();
}

/**
 * Collect positive path-filter entries with their 1-based line numbers.
 *
 * Returns `{ entries, unparsed }`. `unparsed` lists recognized filter syntax
 * that could not be interpreted, so a caller can fail closed rather than treat
 * "found nothing" as "nothing to check".
 */
export function collectPathFilters(source) {
  const lines = source.split('\n');
  const entries = [];
  const unparsed = [];

  let blockIndent = null;
  let ignoreIndent = null;
  let dornyIndent = null;
  let flowBuffer = null;
  let flowLine = 0;
  let flowIsIgnore = false;
  // Path filters live under `on:`; dorny `filters:` blocks live under `jobs:`
  // and are recognized by their own key, so only the `paths:` forms need this
  // scope. A `paths` key elsewhere belongs to something else entirely: a
  // `strategy.matrix.paths` axis is not a filter, and checking `fast` and
  // `thorough` against tracked filenames would fail a correct workflow.
  let inOnBlock = false;

  const push = (raw, index) => {
    const value = unquote(raw);
    if (value && !value.startsWith('!')) entries.push({ glob: value, line: index + 1 });
  };

  lines.forEach((line, index) => {
    // Track the `on:` block. A top-level key ends it; `on: { ... }` is a single
    // line that both opens and closes.
    const topLevel = line.match(/^['"]?([A-Za-z_][\w-]*)['"]?\s*:/);
    if (topLevel) inOnBlock = topLevel[1] === 'on';

    // Continuation of a multiline flow sequence.
    if (flowBuffer !== null) {
      const close = findFlowClose(line);
      // Drop a per-line comment before joining, or it fuses onto the next entry
      // and produces a bogus glob out of two live ones.
      flowBuffer += ` ${stripComment(close === -1 ? line : line.slice(0, close))}`;
      if (close === -1) return;
      if (!flowIsIgnore) for (const raw of splitFlowEntries(flowBuffer)) push(raw, flowLine);
      flowBuffer = null;
      return;
    }

    // A `filters: |` block holds named groups, each a list of path globs.
    if (dornyIndent === null) {
      const open = line.match(DORNY_OPEN);
      if (open) {
        dornyIndent = open[1].length;
        blockIndent = null;
        return;
      }
    } else {
      const blank = line.trim() === '';
      if (!blank && line.search(/\S/) <= dornyIndent) {
        dornyIndent = null;
      } else {
        const entry = line.match(/^\s*-\s*(.+?)\s*$/);
        if (entry && !line.trimStart().startsWith('#')) {
          for (const value of dornyEntryValues(entry[1])) push(value, index);
        }
        return;
      }
    }

    // A `paths-ignore:` block: consume it without collecting.
    if (ignoreIndent !== null) {
      const entry = line.match(LIST_ENTRY);
      if (entry && entry[1].length >= ignoreIndent) return;
      if (line.trim() === '' || line.trimStart().startsWith('#')) return;
      ignoreIndent = null;
    }

    if (blockIndent === null) {
      const flow = inOnBlock ? line.match(PATHS_FLOW) : null;
      if (flow) {
        const close = findFlowClose(flow[3]);
        if (close !== -1) {
          if (!flow[2]) for (const raw of splitFlowEntries(flow[3].slice(0, close))) push(raw, index);
          return;
        }
        flowIsIgnore = Boolean(flow[2]);
        flowLine = index;
        // Stripped on the way in, like every continuation line. `paths: [ # note`
        // otherwise carries its comment into the buffer and fuses it onto the
        // first real entry.
        flowBuffer = stripComment(flow[3]);
        return;
      }
      const key = inOnBlock ? line.match(PATHS_KEY) : null;
      if (key) {
        blockIndent = key[2] ? null : key[1].length;
        ignoreIndent = key[2] ? key[1].length : null;
        return;
      }

      // The key inside a flow mapping (`push: { paths: ['a/**'] }`), where it is
      // not at the start of the line. Handled before the fail-closed check so a
      // readable flow mapping is parsed rather than reported.
      //
      // Only inside an `on:` block: a `paths` key elsewhere is somebody else's
      // (a `strategy.matrix.paths` axis is not a path filter, and checking its
      // values against the tree fails a correct workflow).
      let inlineFound = false;
      if (inOnBlock) {
        for (const match of line.matchAll(PATHS_INLINE)) {
          const bodyStart = match.index + match[0].length;
          const close = findFlowClose(line.slice(bodyStart));
          if (close === -1) continue;
          inlineFound = true;
          if (match[1] === 'paths') {
            for (const raw of splitFlowEntries(line.slice(bodyStart, bodyStart + close))) {
              push(raw, index);
            }
          }
        }
      }
      if (inlineFound) return;

      // The key appears but nothing above could read it. Report rather than
      // skip: a shape this parser does not understand must not read as
      // "no filters".
      if (inOnBlock && PATHS_ANYWHERE.test(line)) {
        unparsed.push({ line: index + 1, text: line.trim() });
      }
      return;
    }

    // YAML permits sequence entries at the same indentation as their key, so
    // `>=` rather than `>`. A stricter check drops the first entry and abandons
    // the block, omitting every filter written that way.
    const entry = line.match(LIST_ENTRY);
    if (entry && entry[1].length >= blockIndent) {
      push(entry[2], index);
      return;
    }

    if (line.trim() === '' || line.trimStart().startsWith('#')) return;
    blockIndent = null;
  });

  // An unterminated flow sequence is a parse failure, not an empty filter list.
  if (flowBuffer !== null) {
    unparsed.push({ line: flowLine + 1, text: 'unterminated flow sequence' });
  }

  return { entries, unparsed };
}
