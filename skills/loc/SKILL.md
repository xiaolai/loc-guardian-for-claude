---
name: loc
description: Use when counting lines of code, computing LOC metrics, or formatting LOC reports with tokei.
version: 0.1.0
---

# LOC Metrics Knowledge

## Tokei Conventions

- Tool: `tokei` — installable via `brew` (macOS/Linux), `cargo install tokei` (anywhere Rust is available), `scoop` (Windows), or `apt`/`dnf`/`pacman`. Never present `brew` as the only option.
- Always exclude non-source artifacts: `.venv`, `__pycache__`, `node_modules`, `.git`, `dist`, `build`, `*.lock`, `*-lock.yaml`, `*-lock.json`
- Test directories to exclude for production counts: `tests`, `test`, `spec`, `__tests__`, `__test__`, `__mocks__`, `__fixtures__`, `__snapshots__`, `e2e`, `integration-tests`, `test-utils`, `testdata`, `fixtures`, `mocks`
- **`--exclude` matches a literal path segment, not a substring.** `--exclude fixtures` does NOT exclude `__fixtures__`, and `--exclude mocks` does NOT exclude `__mocks__`. Every dunder convention needs its own entry alongside the bare form — when adding a directory here, add both spellings or the bare one will silently miss the dunder one.
- Test file patterns to exclude: `*_test.*`, `*.test.*`, `*_spec.*`, `*.spec.*`, `test_*.*`
- Language name mapping (user input → tokei type): `js`/`javascript` → `JavaScript`, `ts`/`typescript` → `TypeScript`, `cpp`/`c++` → `C++`, `py`/`python` → `Python`, `rb`/`ruby` → `Ruby`, `sh`/`bash`/`shell` → `Shell`, `rs`/`rust` → `Rust`, `kt`/`kotlin` → `Kotlin`

## Metric Definitions

| Metric | Definition |
|--------|-----------|
| **Pure LOC** | Code lines from production files only (no tests, no blanks, no comments) |
| **Raw LOC** | Total lines (code + comments + blanks) across all files |
| **Test LOC** | (All-files code lines) minus (production-only code lines) |
| **Test:Prod ratio** | Test LOC / Pure LOC, formatted as `N.NN:1` |
| **Comment density** | `comments / (code + comments) * 100`, from all files |
| **Blank line %** | `blanks / total * 100`, from all files |

## Per-File Limit Config

- Default limit: **350** pure LOC per file
- Config source: `.claude/loc-guardian.local.md` YAML frontmatter field `max_pure_loc`
- Boundaries, fixed by test in `scripts/reduce-loc.test.mjs`:
  - **over limit** := `code > limit` — a file of exactly the limit is not over it
  - **warning zone** := `code > 80% of limit` **and** `code <= limit` — a file at exactly
    80% is clean; 281 of 350 warns, 280 does not
  - the two sets are disjoint: an over-limit file is never also counted as a warning

## Who Produces the Report

`scripts/reduce-loc.mjs` computes and formats everything below from tokei's JSON. The formats
are documented here so the output can be recognised and checked — not so an agent can rebuild
them by hand. Counting lines is arithmetic; it belongs in tested code, not in a model.

## Report Format

### Table 1 — By Language

```
| Language | Files | Code | Comments | Blanks | Total |
|----------|------:|-----:|---------:|-------:|------:|
```

With a bold **Total** row at the bottom.

### Table 2 — Breakdown

```
| Metric                        | Value  |
|-------------------------------|--------|
| **Pure LOC** (prod code only) | N      |
| **Raw LOC** (all files)       | N      |
| **Test LOC**                  | N      |
| **Test:Prod ratio**           | N.NN:1 |
| **Comment density**           | N.N%   |
| **Blank line %**              | N.N%   |
```

### Table 3 — Top Production Files

```
| # | File | Code |
|---|------|-----:|
```

Top 10 largest production files by code lines. Paths relative to project root.

### Table 4 — Files Over Limit (only if any)

```
| # | File | Pure LOC | Limit | Over By |
|---|------|--------:|------:|--------:|
```

### Table 5 — Files Approaching Limit (80%+, only if any)

```
| # | File | Pure LOC | Limit | Usage |
|---|------|--------:|------:|------:|
```

## Verdict Line

Always end the report with exactly this format:

```
**VERDICT: N over limit, M warnings | limit: L**
```

Where N = number of over-limit files, M = number of warning-zone files, L = configured limit. Example: `**VERDICT: 3 over limit, 5 warnings | limit: 350**` or `**VERDICT: 0 over limit, 0 warnings | limit: 350**`.

After the verdict, if no config file exists, add: `*Run /loc-guardian:init to configure.*`

## Raw File Data Block

Always append a fenced data block after the verdict for downstream consumption (even if empty).
One JSON object per line:

~~~
```loc-data
{"status":"OVER","path":"path/to/file.ts","loc":482}
{"status":"OVER","path":"path/to/other.py","loc":378}
{"status":"WARN","path":"path/to/growing.ts","loc":310}
```
~~~

This block is the machine-readable list the optimizer consumes, and it is the authoritative
one — the tables above are presentation only.

**It is JSON for a reason.** The earlier whitespace-delimited form `OVER <path> <loc>` was
ambiguous for any path containing a space, and forgeable outright: a file named with an
embedded newline could close the fence early — silently dropping every later entry — and inject
a line that looked like a real verdict. `JSON.stringify` escapes newlines, quotes, pipes and
backticks, so a path survives intact whatever it contains. Consumers must read the `path`
field rather than splitting the line.

## Formatting Rules

- Right-align all numeric columns
- Use thousands separators for numbers >= 10,000
- Keep output to one screen — no lengthy explanations
