# loc-guardian — Developer Notes

## Architecture

Two-agent pipeline orchestrated by a thin command:

```
/loc-guardian:scan
  → counter agent (haiku) — runs tokei, computes metrics, flags violations
  → optimizer agent (opus) — reads over-limit files, suggests extractions
                             (only invoked when violations exist)
```

The counter outputs a structured **verdict line** and **`loc-data` block** that scan.md parses to decide whether to invoke the optimizer. This avoids fragile markdown-table parsing.

## Project Structure

```
.claude-plugin/plugin.json       — Plugin identity & metadata
commands/
  scan.md                        — /loc-guardian:scan — orchestrator (counter → optimizer)
  init.md                        — /loc-guardian:init — per-project config setup (sonnet)
agents/
  counter.md                     — haiku: runs tokei, computes metrics, checks limits
  optimizer.md                   — opus: reads files, provides extraction strategies
skills/
  loc/SKILL.md                   — Tokei conventions, metric definitions, report formats
  loc-optimization/SKILL.md      — Config file format, generic optimization patterns
```

## Skill Separation

- **`loc` skill** — loaded by counter. Contains: tokei conventions, metric definitions, all report table formats (including alert tables), verdict line format, raw data block format.
- **`loc-optimization` skill** — loaded by optimizer only. Contains: config file format, generic fallback optimization patterns (used when no project-specific extraction rules exist).

The counter does NOT load `loc-optimization` — it doesn't need optimization knowledge.

## Config

Per-project config: `.claude/loc-guardian.local.md`
- YAML frontmatter: `max_pure_loc` (default 350)
- Markdown body: user-defined extraction rules (project-specific, language-specific)
- Created by `/loc-guardian:init`, which detects the project stack and proposes rules

## Data Flow: counter → scan → optimizer

1. Counter ends its report with: `**VERDICT: N over limit, M warnings | limit: L**`
2. Counter appends a `loc-data` fenced block with one file per line: `OVER|WARN <path> <pure_loc>`
3. Scan checks the verdict line for N > 0
4. If violations exist, scan passes the **entire counter output** to the optimizer
5. Optimizer parses the `loc-data` block for file paths and LOC counts, then reads each file

## Conventions

- Agent names: short role names (`counter`, `optimizer`), no plugin-name prefix
- Command names: action verbs (`scan`, `init`)
- Skills: topic names (`loc`, `loc-optimization`)
- All references use `loc-guardian:` prefix (e.g. `loc-guardian:counter`, `loc-guardian:loc`)
