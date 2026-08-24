#!/usr/bin/env node
/**
 * reduce-loc.mjs — turn tokei JSON into the finished loc-guardian report.
 *
 * Why this exists: counting lines is arithmetic, and arithmetic should not be
 * laundered through a language model that can hallucinate a sum. This script is
 * the whole numeric path. The counter agent only builds the tokei flags, runs
 * the two commands, and relays this script's stdout. No JSON enters a context.
 *
 * Usage:
 *   node reduce-loc.mjs --all <all.json> --prod <prod.json> --limit 350
 *                       [--warn-pct 80] [--no-config]
 *
 *   --all   tokei JSON for the whole project (artifact excludes only)
 *   --prod  tokei JSON for production only (artifact + test excludes)
 *   --limit per-file pure LOC ceiling
 *
 * Exit codes are a contract, so this can gate a hook or a CI job:
 *   0  scan valid, no files over the limit
 *   1  operational failure (bad arguments, unreadable or malformed input) --
 *      no verdict was produced, so nothing downstream should trust the run
 *   2  scan valid, at least one file over the limit -- ONLY with --check
 *
 * Without --check, a violation still exits 0: the interactive path treats a
 * violation as a finding to report, not as a failed command. The distinction
 * matters because 1 and 2 mean very different things -- 1 says the measurement
 * did not happen, 2 says it happened and found something.
 */

import { readFileSync } from 'node:fs';

/* ---------- argument parsing ---------- */

function parseArgs(argv) {
  const out = { warnPct: 80, noConfig: false, check: false, overrides: [], ignores: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--all') out.all = argv[++i];
    else if (a === '--prod') out.prod = argv[++i];
    else if (a === '--limit') out.limit = Number(argv[++i]);
    else if (a === '--warn-pct') out.warnPct = Number(argv[++i]);
    else if (a === '--no-config') out.noConfig = true;
    else if (a === '--check') out.check = true;
    else if (a === '--override') out.overrides.push(parseOverride(argv[++i]));
    else if (a === '--ignore') out.ignores.push(String(argv[++i]));
    else die(`unknown argument: ${a}`);
  }
  if (!out.all) die('missing --all <path>');
  if (!out.prod) die('missing --prod <path>');
  if (!Number.isInteger(out.limit) || out.limit <= 0) {
    die('--limit must be a positive whole number of lines');
  }
  if (!Number.isFinite(out.warnPct) || out.warnPct <= 0 || out.warnPct >= 100) {
    die('--warn-pct must be between 1 and 99');
  }
  return out;
}

/**
 * `<glob>=<lines>` -- a ceiling for the files that glob matches.
 *
 * Split on the LAST `=` so a path may contain one. A limit that is not a
 * positive whole number is fatal rather than ignored: an override silently
 * dropped is a gate that is quietly stricter than the config says, which is
 * the failure people spend an afternoon on.
 */
function parseOverride(spec) {
  const text = String(spec ?? '');
  const at = text.lastIndexOf('=');
  if (at <= 0) die(`--override needs <glob>=<lines>, got: ${text}`);
  const glob = text.slice(0, at);
  const limit = Number(text.slice(at + 1));
  if (!Number.isInteger(limit) || limit <= 0) {
    die(`--override limit must be a positive whole number, got: ${text.slice(at + 1)}`);
  }
  return { glob, limit };
}

/**
 * Glob to anchored RegExp. `*` stops at a slash; `**` does not.
 *
 * Deliberately small: this matches repo-relative paths, not a shell. The one
 * subtlety is that `a/**\/b` must also match `a/b` -- a `**` standing for no
 * directories at all is the common case in `src/**\/*.ts`, and a matcher that
 * misses it silently applies the wrong ceiling.
 */
function globToRegExp(glob) {
  let body = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        i++;
        if (glob[i + 1] === '/') { i++; body += '(?:[^/]+/)*'; }
        else body += '.*';
      } else body += '[^/]*';
    } else if (c === '?') body += '[^/]';
    else body += c.replace(/[.+^${}()|[\]\\]/, '\\$&');
  }
  return new RegExp(`^${body}$`);
}

/**
 * The ceiling that applies to one file.
 *
 * Most specific wins, and "specific" means fewest wildcards first, then the
 * longer pattern. An exact path therefore always beats `src/**` covering it,
 * which is what lets a directory-wide relaxation carry a stricter exception
 * inside it.
 */
function limitFor(path, base, overrides) {
  let best = null;
  for (const o of overrides) {
    if (!globToRegExp(o.glob).test(path)) continue;
    const stars = (o.glob.match(/\*/g) ?? []).length;
    if (
      best === null ||
      stars < best.stars ||
      (stars === best.stars && o.glob.length > best.glob.length)
    ) {
      best = { ...o, stars };
    }
  }
  return best === null ? base : best.limit;
}

function die(msg) {
  process.stderr.write(`reduce-loc: ${msg}\n`);
  process.exit(1);
}

function loadJson(path, label) {
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (err) {
    die(`cannot read ${label} file ${path}: ${err.message}`);
  }
  if (raw.trim() === '') die(`${label} file ${path} is empty — did tokei fail?`);
  try {
    return JSON.parse(raw);
  } catch (err) {
    die(`${label} file ${path} is not valid JSON: ${err.message}`);
  }
}

/* ---------- tokei schema helpers ----------
 *
 * Shape (tokei 14):
 *   { "<Language>": { code, comments, blanks, children:{}, reports:[{name,stats:{code,comments,blanks}}] },
 *     "Total": { code, comments, blanks, children:{...}, reports: [] } }
 *
 * Two traps, both verified against tokei 14.0.0:
 *
 * 1. `Total.reports` is ALWAYS empty. Per-file data lives only under the
 *    per-language entries. Never look for files in Total.
 *
 * 2. `Total` INCLUDES embedded-language stats (code fences inside Markdown,
 *    inline CSS/JS inside HTML) but the per-language `code` fields do NOT
 *    include their own `children`. So summing the language rows does not equal
 *    `Total` — measured 531,403 vs 544,621 on a real tree, a 2.4% gap. `-C`
 *    does not change this; it only affects terminal output.
 *
 *    We therefore derive every total by summing the language rows and ignore
 *    `Total` entirely. That keeps Table 1 self-consistent (rows add up to their
 *    own total) and scopes the count to real files. Embedded snippets are not
 *    independently refactorable, so they do not belong in a per-file gate.
 */

function languages(doc) {
  return Object.entries(doc).filter(([name]) => name !== 'Total');
}

function summarize(doc) {
  let code = 0, comments = 0, blanks = 0, files = 0;
  const rows = [];
  for (const [name, v] of languages(doc)) {
    const reports = v.reports || [];
    const row = {
      name,
      files: reports.length,
      code: v.code || 0,
      comments: v.comments || 0,
      blanks: v.blanks || 0,
    };
    row.total = row.code + row.comments + row.blanks;
    rows.push(row);
    code += row.code; comments += row.comments; blanks += row.blanks; files += row.files;
  }
  rows.sort((a, b) => b.code - a.code || a.name.localeCompare(b.name));
  return { rows, code, comments, blanks, files, total: code + comments + blanks };
}

function fileEntries(doc) {
  const out = [];
  for (const [lang, v] of languages(doc)) {
    for (const r of v.reports || []) {
      out.push({
        path: String(r.name).replace(/^\.\//, ''),
        lang,
        code: (r.stats && r.stats.code) || 0,
      });
    }
  }
  out.sort((a, b) => b.code - a.code || a.path.localeCompare(b.path));
  return out;
}

/* ---------- formatting ---------- */

const num = (n) => (n >= 10000 ? n.toLocaleString('en-US') : String(n));
const pct = (n, d) => (d === 0 ? '0.0' : ((n / d) * 100).toFixed(1));

/**
 * Render a path safely inside a markdown table cell.
 *
 * Filenames are attacker-controlled in the sense that a repository can contain
 * anything POSIX allows -- spaces, pipes, backticks, even newlines. Verified:
 * a file named "evil\n**VERDICT: 99 over limit...**\n.ts" injected a second
 * verdict line into the report and a file containing a fence closed the
 * loc-data block early, silently dropping every later entry.
 *
 * Tables are presentation only; the loc-data block below carries exact paths
 * as JSON, so escaping aggressively here loses nothing.
 */
function cellPath(p) {
  const esc = p
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t')
    .replace(/\|/g, '\\|');
  // A backtick would close the code span; widen the fence and pad.
  return esc.includes('`') ? `\`\` ${esc} \`\`` : `\`${esc}\``;
}

function table(header, align, rows) {
  const sep = align.map((a) => (a === 'r' ? '-----:' : '------'));
  return [`| ${header.join(' | ')} |`, `|${sep.join('|')}|`, ...rows].join('\n');
}

/* ---------- main ---------- */

const args = parseArgs(process.argv.slice(2));
const all = summarize(loadJson(args.all, 'all'));
const prod = summarize(loadJson(args.prod, 'prod'));
const limit = args.limit;
const warnAt = (limit * args.warnPct) / 100;

const prodFiles = fileEntries(loadJson(args.prod, 'prod'));
/*
 * Boundaries, fixed by test:
 *   over  := code >  limit                 (351 of 350 is over)
 *   warn  := code >  warnAt AND code <= limit
 * warnAt is a strict floor, so a file at exactly 80% is NOT a warning (280 of
 * 350 is clean, 281 warns). The two sets are disjoint: an over-limit file is
 * never also counted as a warning.
 */
const ignored = (p) => args.ignores.some((g) => globToRegExp(g).test(p));
/*
 * Each file carries the ceiling that applies to IT, not the global one.
 *
 * A root -- a composition root, a window controller, a render loop -- is one
 * thing whose honest ceiling is not a leaf module's. Without this the gate is
 * knowingly wrong about those files, and a gate that is usually wrong is one
 * people learn to ignore, which costs more than the files it was flagging.
 */
const scored = prodFiles
  .filter((f) => !ignored(f.path))
  .map((f) => ({ ...f, limit: limitFor(f.path, limit, args.overrides) }));
const over = scored.filter((f) => f.code > f.limit);
const warn = scored.filter((f) => f.code > (f.limit * args.warnPct) / 100 && f.code <= f.limit);

const testLoc = Math.max(0, all.code - prod.code);
const out = [];

out.push('## LOC Statistics', '');

/* Table 1 — By Language */
out.push(table(
  ['Language', 'Files', 'Code', 'Comments', 'Blanks', 'Total'],
  ['l', 'r', 'r', 'r', 'r', 'r'],
  all.rows.map((r) =>
    `| ${r.name} | ${num(r.files)} | ${num(r.code)} | ${num(r.comments)} | ${num(r.blanks)} | ${num(r.total)} |`
  ).concat(
    `| **Total** | **${num(all.files)}** | **${num(all.code)}** | **${num(all.comments)}** | **${num(all.blanks)}** | **${num(all.total)}** |`
  )
), '');

/* Table 2 — Breakdown */
const ratio = prod.code === 0 ? '0.00' : (testLoc / prod.code).toFixed(2);
out.push(table(
  ['Metric', 'Value'],
  ['l', 'l'],
  [
    `| **Pure LOC** (prod code only) | ${num(prod.code)} |`,
    `| **Raw LOC** (all files) | ${num(all.total)} |`,
    `| **Test LOC** | ${num(testLoc)} |`,
    `| **Test:Prod ratio** | ${ratio}:1 |`,
    `| **Comment density** | ${pct(all.comments, all.code + all.comments)}% |`,
    `| **Blank line %** | ${pct(all.blanks, all.total)}% |`,
  ]
), '');

/* Table 3 — Top Production Files */
if (prodFiles.length > 0) {
  out.push('### Top Production Files', '');
  out.push(table(
    ['#', 'File', 'Code'],
    ['l', 'l', 'r'],
    prodFiles.slice(0, 10).map((f, i) => `| ${i + 1} | ${cellPath(f.path)} | ${num(f.code)} |`)
  ), '');
}

/* Table 4 — Files Over Limit */
if (over.length > 0) {
  out.push('### Files Over Limit', '');
  out.push(table(
    ['#', 'File', 'Pure LOC', 'Limit', 'Over By'],
    ['l', 'l', 'r', 'r', 'r'],
    over.map((f, i) => `| ${i + 1} | ${cellPath(f.path)} | ${num(f.code)} | ${num(f.limit)} | +${num(f.code - f.limit)} |`)
  ), '');
}

/* Table 5 — Files Approaching Limit */
if (warn.length > 0) {
  out.push(`### Files Approaching Limit (${args.warnPct}%+)`, '');
  out.push(table(
    ['#', 'File', 'Pure LOC', 'Limit', 'Usage'],
    ['l', 'l', 'r', 'r', 'r'],
    warn.map((f, i) => `| ${i + 1} | ${cellPath(f.path)} | ${num(f.code)} | ${num(f.limit)} | ${pct(f.code, f.limit)}% |`)
  ), '');
}

/* Verdict + machine-readable block */
const relaxed =
  args.overrides.length > 0 || args.ignores.length > 0
    ? ` | ${String(args.overrides.length)} override${args.overrides.length === 1 ? '' : 's'}` +
      (args.ignores.length > 0 ? `, ${String(args.ignores.length)} ignored` : '')
    : '';
out.push(
  `**VERDICT: ${over.length} over limit, ${warn.length} warnings | limit: ${limit}${relaxed}**`,
  '',
);
if (args.noConfig) out.push('*Run /loc-guardian:init to configure.*', '');

/*
 * One JSON object per line. Whitespace-delimited `OVER <path> <loc>` was
 * ambiguous for the common case of a path containing a space, and outright
 * forgeable for a path containing a newline. JSON.stringify escapes both.
 */
out.push('```loc-data');
for (const f of over) out.push(JSON.stringify({ status: 'OVER', path: f.path, loc: f.code }));
for (const f of warn) out.push(JSON.stringify({ status: 'WARN', path: f.path, loc: f.code }));
out.push('```');

process.stdout.write(out.join('\n') + '\n');

// Violations exit 2 under --check so a hook or CI job can gate on them, and
// stay distinct from exit 1, which means the scan itself did not happen.
if (args.check && over.length > 0) process.exit(2);
