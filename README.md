# loc-guardian

[![Validated by NLPM](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/xiaolai/loc-guardian-for-claude/main/nlpm-badge.json)](https://github.com/xiaolai/loc-guardian-for-claude/blob/main/nlpm-badge.json)

Enforce per-file pure LOC limits with automated optimization strategies.

## What it does

- Counts lines of code using [tokei](https://github.com/XAMPPRocky/tokei) — fast, accurate, multi-language
- Separates **pure LOC** (production code only, excluding tests/blanks/comments) from raw LOC
- Flags files exceeding a configurable per-file limit (default: 350 pure LOC)
- Provides **opus-powered optimization strategies** for over-limit files — reading each file and suggesting concrete extractions based on your project's conventions

## Commands

| Command | Description |
|---------|-------------|
| `/loc-guardian:init` | Configure LOC limit and extraction rules for your project |
| `/loc-guardian:scan` | Count LOC, check limits, get optimization strategies |
| `/loc-guardian:scan python` | Count only Python files |
| `/loc-guardian:scan src/` | Count only files under `src/` |

Part of the [xiaolai plugin marketplace](https://github.com/xiaolai/claude-plugin-marketplace).

## Installation

### Prerequisites

**Node.js 18+** — the counting and formatting run in a small dependency-free script, so the
numbers come from tested code rather than from a model's arithmetic. Check with `node --version`.
(Claude Code's native builds do not bundle Node, so this may need installing separately.)

And [tokei](https://github.com/XAMPPRocky/tokei):

| Platform | Command |
|---|---|
| macOS / Linux (Homebrew) | `brew install tokei` |
| Any platform with Rust | `cargo install tokei` |
| Debian / Ubuntu | `apt install tokei` |
| Fedora | `dnf install tokei` |
| Arch | `pacman -S tokei` |
| Windows | `scoop install tokei` |

### Install the plugin

Add the marketplace (once):

```
/plugin marketplace add xiaolai/claude-plugin-marketplace
```

Then install:

```
/plugin install loc-guardian@xiaolai
```

> **Install fails with "Plugin not found in marketplace 'xiaolai'"?** Your local marketplace clone is stale. Run `claude plugin marketplace update xiaolai` and retry — `plugin install` does not auto-refresh.

| Scope | Command | Effect |
|-------|---------|--------|
| **User** (default) | `/plugin install loc-guardian@xiaolai` | Available in all your projects |
| **Project** | `/plugin install loc-guardian@xiaolai --scope project` | Shared with team via `.claude/settings.json` |
| **Local** | `/plugin install loc-guardian@xiaolai --scope local` | Only you, only this repo |

### Setup

Run `/loc-guardian:init` in your project to set your LOC limit and extraction rules

## How it works

1. **Counter** (haiku) — works out what to scan, runs tokei, relays the report. tokei's JSON
   goes to a temp file and never enters a model context, so cost stays flat as the repository
   grows: on a 4,864-file tree, 2,660 KB of JSON became a 55 KB report.
2. **`scripts/reduce-loc.mjs`** — computes every metric and formats every table. Counting lines
   is arithmetic, so it lives in tested code (`node scripts/reduce-loc.test.mjs`).
3. **Optimizer** (opus) — reads each over-limit file and *measures* the pure LOC each proposed
   extraction would save, rather than estimating it from a whole-file ratio. Only invoked when
   files are over the limit.

## Using it in CI or a hook

The scan is a plain shell pipeline; no model is needed to enforce the limit:

```bash
D=$(mktemp -d) && trap 'rm -rf "$D"' EXIT
tokei . -o json > "$D/all.json"
tokei . --exclude tests --exclude __tests__ --exclude __fixtures__ -o json > "$D/prod.json"
node scripts/reduce-loc.mjs --all "$D/all.json" --prod "$D/prod.json" --limit 350 --check
```

| Exit | Meaning |
|-----:|---------|
| `0` | scan valid, nothing over the limit |
| `1` | the scan did not happen (bad arguments, unreadable or malformed input) |
| `2` | scan valid, at least one file over the limit — only with `--check` |

`1` and `2` are deliberately distinct: a broken scan must never look like a clean one.

## Configuration

`/loc-guardian:init` creates `.claude/loc-guardian.local.md` in your project:

```yaml
---
max_pure_loc: 350
---
```

```markdown
## Extraction Rules

- [What to extract] → `[target file pattern]`
- [What to extract] → `[target file pattern]`
```

The extraction rules are yours — tailored to your language, framework, and conventions.

## License

ISC
