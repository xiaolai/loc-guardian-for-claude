---
name: loc-guardian-counter
description: "Count lines of code and produce the loc-guardian LOC report with per-file limit enforcement, for all languages or one (e.g. python). The counting step of $loc-guardian-scan. Not for suggesting how to shrink over-limit files; that is $loc-guardian-optimizer."
---

# LOC Guardian Counter

You are a code metrics analyst. You do **not** compute anything. Your job is to work out
what to scan, run one command, and relay its output. The arithmetic lives in
`scripts/reduce-loc.mjs`, which is tested — counting lines is arithmetic, and arithmetic
run through a language model can be silently wrong.

Load `$loc-guardian-loc` for the tokei conventions, the language-name mapping, and the report
format. Do not load `$loc-guardian-loc-optimization`; counting needs no optimization knowledge.

## Locate the plugin root

This file lives at `<plugin-root>/codex/skills/loc-guardian-counter/SKILL.md`, and Codex lists
each skill with its file path. The plugin root is the directory **three levels above this
file**. Substitute its absolute path for `<plugin-root>` in the command below; the command
checks the path before using it.

## Step 0: Read Config

Check whether `.claude/loc-guardian.local.md` exists in the project root. The file is shared
with the Claude Code plugin, so a project configured from either tool is configured for both.
If it exists, parse its YAML frontmatter for:

- `max_pure_loc` — the ceiling for an ordinary file. Default: **350**.
- `overrides` — an optional map of glob → ceiling, for files the flat limit is knowingly
  wrong about. A composition root, a window controller and a render loop are each one thing,
  and their honest ceiling is not a leaf module's.
- `ignore` — an optional list of globs exempt from the limit entirely (generated code,
  vendored files).

Both optional keys are passed through as repeated flags:

```yaml
max_pure_loc: 350
overrides:
  'src/main/index.ts': 1500
  'src/renderer/**': 600
ignore:
  - 'src/generated/**'
```

becomes `--override 'src/main/index.ts=1500' --override 'src/renderer/**=600'
--ignore 'src/generated/**'`.

Most specific wins: an exact path beats a glob covering it. The verdict line reports how many
overrides were in force, so a relaxed run cannot be read as a strict one.

Remember whether the file existed — you pass `--no-config` below when it did not.

## Step 1: Parse Arguments

Examine the user's request (may be empty).

- **Language filter**: if it names a language, map it to tokei's type name using the mapping
  in `$loc-guardian-loc` (e.g. `ts` → `TypeScript`).
- **Path arguments**: treat remaining tokens as target paths. If none, use `.`.
- **If empty**: count everything in the current directory.

## Step 2: Validate the Language Filter

Skip this step when no language filter was given.

`tokei -t BogusName` exits **0** and returns an empty result — identical to a valid language
that simply is not present. Left unchecked, a typo reports `0 over limit` and looks like a
clean repository. Validate first:

```bash
tokei -l | sed -n 's/^┃ \([A-Za-z0-9+#._-]*\) .*/\1/p' | grep -qxF 'TypeScript'
```

Exit 0 means the name is valid. If it is not, stop and tell the user the name was not
recognised, suggesting the closest match — do not scan.

## Step 3: Run the Scan

Run this as a **single** shell command, substituting the plugin root, paths, excludes and
limit. Do not split it up: each guard exists because the step after it would otherwise produce
a confident wrong answer.

```bash
set -u
PLUGIN='<plugin-root>'
[ -f "$PLUGIN/scripts/reduce-loc.mjs" ] || { echo "reduce-loc.mjs not found under $PLUGIN" >&2; exit 1; }
command -v tokei >/dev/null || { echo "tokei is not installed" >&2; exit 127; }
command -v node  >/dev/null || { echo "node is not installed" >&2; exit 127; }

D=$(mktemp -d) || exit 1
[ -n "$D" ] && [ -d "$D" ] || { echo "mktemp failed" >&2; exit 1; }
trap 'rm -rf "$D"' EXIT INT TERM

tokei . <artifact_excludes> -o json > "$D/all.json"  || exit 1
tokei . <artifact_excludes> <test_excludes> -o json > "$D/prod.json" || exit 1

node "$PLUGIN/scripts/reduce-loc.mjs" \
  --all "$D/all.json" --prod "$D/prod.json" --limit 350 \
  <one --override 'glob=lines' per config entry, one --ignore 'glob' per ignore entry>
```

Why each line is there:

| Line | Without it |
|------|-----------|
| `[ -f "$PLUGIN/scripts/reduce-loc.mjs" ]` | a wrong plugin root fails later as a confusing `node` error |
| `command -v tokei` | redirection creates the JSON file *before* the shell finds no `tokei`, so the next step reads an empty file |
| `command -v node` | the same failure one step later |
| `mktemp` guard | an empty `$D` writes to `/all.json` |
| `trap` | temp files leak on success, failure and interrupt alike |
| `|| exit 1` on each tokei | commands chained in one shell do **not** stop on failure; the reducer would run on a truncated file |

Add `--no-config` to the final command when no config file exists. Pass `--warn-pct` only if
the project configures a non-default warning threshold.

**Never** add `-f`. For JSON output it adds no per-file data — the `reports` array is present
either way and `-f` only reorders it.

## Step 4: Relay the Report

The script prints the finished report: all tables, the verdict line, and the `loc-data` block.

Relay its stdout **unchanged**. Do not re-format tables, re-sort rows, recompute a total, round
a percentage, summarise, or truncate. You have no numbers of your own to add — every figure in
that output was measured, and any edit you make can only make it less true.

With `--no-config`, the report ends with a hint naming `/loc-guardian:init`, the Claude Code
command. After the report, add one line: `In Codex, run $loc-guardian-init to configure.`

If the command fails, report the exit status and stderr verbatim, and do **not** invent a
verdict line. Exit 127 means a missing prerequisite; exit 1 means the scan did not happen.

## Rules

- No JSON reaches this context. The tokei output goes to disk and the reducer reads it from
  there. This is what keeps the counter's cost flat as the repository grows.
- Shell-quote every path. Repositories exist with spaces and non-ASCII in their paths.
- Do not add optimization suggestions — that is `$loc-guardian-optimizer`.
- Do not edit, move or delete any project file.
