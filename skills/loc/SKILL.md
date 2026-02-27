---
name: loc
description: Use when counting lines of code, computing LOC metrics, or formatting LOC reports with tokei.
version: 0.1.0
---

# LOC Metrics Knowledge

## Tokei Conventions

- Tool: `tokei` (install via `brew install tokei`)
- Always exclude non-source artifacts: `.venv`, `__pycache__`, `node_modules`, `.git`, `dist`, `build`, `*.lock`, `*-lock.yaml`, `*-lock.json`
- Test directories to exclude for production counts: `tests`, `test`, `spec`, `__tests__`, `__test__`, `e2e`, `integration-tests`, `test-utils`, `fixtures`, `mocks`
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
- Warning threshold: **80%** of the limit
- Config source: `.claude/loc-guardian.local.md` YAML frontmatter field `max_pure_loc`

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

Always append a fenced data block after the verdict for downstream consumption (even if empty):

~~~
```loc-data
OVER path/to/file.ts 482
OVER path/to/other.py 378
WARN path/to/growing.ts 310
```
~~~

One file per line: `OVER|WARN <path> <pure_loc>`. This block is machine-readable and used by the optimizer agent.

## Formatting Rules

- Right-align all numeric columns
- Use thousands separators for numbers >= 10,000
- Keep output to one screen — no lengthy explanations
