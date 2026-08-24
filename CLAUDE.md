# loc-guardian — Developer Notes

## Architecture

Two-agent pipeline orchestrated by a thin command:

```
/loc-guardian:scan
  → counter agent (haiku) — resolves args, runs tokei, relays the report
      └─ scripts/reduce-loc.mjs — computes every metric and formats the report
  → optimizer agent (opus) — reads over-limit files, measures extractions
                             (only invoked when files are OVER the limit)
```

**No bulk data enters a model context.** tokei's JSON goes to a temp file and
`scripts/reduce-loc.mjs` reads it from there; the counter only relays the finished report.
This matters because the JSON scales with repository size — roughly 287 bytes per file, so a
1,000-file repo produces ~840 KB across the two calls. Measured on a 4,864-file tree: 2,660 KB
of JSON on disk reduced to a 55 KB report, with none of the JSON in context.

The report ends with a **verdict line** and a **`loc-data` block** (one JSON object per line)
that scan.md validates before deciding whether to invoke the optimizer. scan.md matches the
verdict against a strict pattern rather than searching for the substring `VERDICT:`, because
an error message mentioning it would otherwise pass.

## Project Structure

```
.claude-plugin/plugin.json       — Plugin identity & metadata
commands/
  scan.md                        — /loc-guardian:scan — orchestrator (counter → optimizer)
  init.md                        — /loc-guardian:init — per-project config setup (inherits session model)
agents/
  counter.md                     — haiku: resolves args, runs tokei, relays the report
  optimizer.md                   — opus: reads files, measures extraction savings
scripts/
  reduce-loc.mjs                 — all arithmetic and formatting (Node, no deps)
  reduce-loc.test.mjs            — behavioural tests: node scripts/reduce-loc.test.mjs
skills/
  loc/SKILL.md                   — Tokei conventions, metric definitions, report formats
  loc-optimization/SKILL.md      — Config file format, generic optimization patterns
```

## Skill Separation

- **`loc` skill** — loaded by counter. Contains: tokei conventions, metric definitions, and the
  report formats. The formats are documented so output can be recognised and checked, not so an
  agent can rebuild them by hand — `reduce-loc.mjs` produces them.
- **`loc-optimization` skill** — loaded by optimizer only. Contains: config file format, generic fallback optimization patterns (used when no project-specific extraction rules exist).

The counter does NOT load `loc-optimization` — it doesn't need optimization knowledge.

## Config

Per-project config: `.claude/loc-guardian.local.md`
- YAML frontmatter: `max_pure_loc` (default 350)
- Markdown body: user-defined extraction rules (project-specific, language-specific)
- Created by `/loc-guardian:init`, which detects the project stack and proposes rules

## Data Flow: counter → scan → optimizer

1. `reduce-loc.mjs` ends the report with `**VERDICT: N over limit, M warnings | limit: L**`
2. It appends a `loc-data` fenced block, one JSON object per line:
   `{"status":"OVER","path":"…","loc":482}`
3. Counter relays that stdout unchanged — it adds no numbers of its own
4. Scan validates the verdict against a strict line pattern (not a substring search). If no
   line matches, the scan did not happen: scan runs the tokei + reducer pipeline directly,
   once, rather than reporting failure or re-dispatching the counter
5. If the validated verdict shows N > 0, scan passes the entire report to the optimizer
6. Optimizer reads each `path` field (never splitting the line on whitespace), opens the file,
   and measures each proposed extraction with `sed` + `tokei` rather than estimating

## Conventions

- Agent names: short role names (`counter`, `optimizer`), no plugin-name prefix
- Command names: action verbs (`scan`, `init`)
- Skills: topic names (`loc`, `loc-optimization`)
- All references use `loc-guardian:` prefix (e.g. `loc-guardian:counter`, `loc-guardian:loc`)

## Why the arithmetic is not in the model

Counting lines is arithmetic. A language model asked to sum a column can be confidently wrong,
and the wrongness is invisible — the table still looks like a table. `reduce-loc.mjs` owns every
number, and `reduce-loc.test.mjs` pins the behaviour that is easy to get subtly wrong:

- **Embedded languages.** tokei's `Total` includes code inside Markdown fences and inline
  CSS/JS in HTML, but the per-language `code` fields do not include their own `children`.
  Summing the language rows gives a different answer from reading `Total` — measured 531,403
  vs 544,621 on a real tree. `-C` does not change the JSON. The reducer sums the rows, so the
  table is self-consistent and the count covers real files only.
- **`Total.reports` is always empty.** Per-file data lives only under the language entries.
- **Boundaries.** `over := code > limit`; `warn := code > 80% AND code <= limit`. Disjoint,
  with 280/281/350/351 pinned by test.
- **Hostile paths.** A filename may contain spaces, pipes, backticks or newlines. The
  `loc-data` block is JSON so such a path cannot truncate the block or forge a verdict line.

## Exit codes

`reduce-loc.mjs` exits `0` for a clean scan and `1` for an operational failure (bad arguments,
unreadable or malformed input — meaning no verdict was produced and nothing downstream should
trust the run). With `--check` it exits `2` when files are over the limit, so a hook or CI job
can gate on violations while still distinguishing them from a scan that never happened.
