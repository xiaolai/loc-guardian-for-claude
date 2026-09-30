# loc-guardian (Codex)

Per-file pure-LOC limits for Codex CLI. Counts code with tokei, flags files over the limit, and
proposes extractions whose savings are measured with tokei rather than estimated.

## Skills

| Skill | Purpose |
|---|---|
| `$loc-guardian-scan` | Entry point. Runs the counter, validates the verdict line, and runs the optimizer only when files are over the limit. |
| `$loc-guardian-init` | Writes `.claude/loc-guardian.local.md`: the limit and the project's extraction rules. |
| `$loc-guardian-counter` | Resolves arguments, runs tokei and `scripts/reduce-loc.mjs`, relays the report unchanged. Not auto-selected; `$loc-guardian-scan` runs it. |
| `$loc-guardian-optimizer` | Reads over-limit files and measures each proposed extraction. Read-only. Not auto-selected. |
| `$loc-guardian-loc` | Reference: tokei conventions, metric definitions, report and verdict format. |
| `$loc-guardian-loc-optimization` | Reference: config format and fallback optimization patterns. |

## How it differs from the Claude Code plugin

- **Same engine, same config.** Both tools run `scripts/reduce-loc.mjs` and read
  `.claude/loc-guardian.local.md`, so a project configured from either tool is configured for
  both.
- **No model pinning.** Claude Code runs the counter on Haiku and the optimizer on Opus. Codex
  skills run on the session model; if subagents are available the scan may hand each step to
  one, otherwise it runs them inline.
- **No tool restriction.** Claude Code limits the counter to Bash and Read. In Codex the limits
  are instructions: the counter and optimizer never edit project files.
- **Plugin root.** Codex has no `${CLAUDE_PLUGIN_ROOT}` in a skill's shell. Each skill that runs
  a script resolves the plugin root as three directories above its own `SKILL.md`
  (`<plugin-root>/codex/skills/<skill>/SKILL.md`) and checks the script exists before running it.
- **No hooks.** The plugin ships none in either tool.

## Prerequisites

`tokei` and Node.js 18+ on `PATH`.
