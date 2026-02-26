# loc-guardian

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

## Setup

1. Install tokei: `brew install tokei`
2. Install the plugin
3. Run `/loc-guardian:init` in your project to set your LOC limit and extraction rules

## How it works

1. **Counter** (haiku) — runs tokei, computes metrics, flags violations
2. **Optimizer** (opus) — reads over-limit files, suggests line-level extractions following your project's rules. Only invoked when there are violations.

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

MIT
