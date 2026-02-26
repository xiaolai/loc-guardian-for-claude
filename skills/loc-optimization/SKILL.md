---
name: loc-optimization
description: Use when analyzing files that exceed pure LOC limits, or when suggesting code optimization opportunities to reduce file size.
version: 0.1.0
---

# LOC Optimization Knowledge

## Config File: `.claude/loc-guardian.local.md`

The `/loc-guardian:init` command creates this file. Format:

```yaml
---
max_pure_loc: 350
---
```

Followed by a markdown body containing the project's **extraction rules** — user-defined, project-specific patterns for how to split oversized files. Example format:

```markdown
## Extraction Rules

- [What to extract] → `[target file naming convention]`
- [What to extract] → `[target file naming convention]`
```

The actual rules vary by project and are written by the user during init. The agent MUST read this file and use the user's extraction rules verbatim when making suggestions. If the file has no extraction rules in the body, fall back to generic patterns (see below).

## Generic Optimization Patterns (Fallback)

Use these ONLY when the project has no extraction rules configured:

### Eliminate Duplication
- Repeated patterns that differ only in data → data-driven approach
- Copy-pasted blocks with slight variations → parameterized function

### Simplify Conditionals
- Nested if/else → early returns or guard clauses
- Long switch → lookup object/map
- Repeated null checks → optional chaining or nullish coalescing

### Leverage Framework Features
- Manual DOM manipulation → declarative framework patterns
- Hand-rolled state management → built-in hooks/stores
- Imperative iteration → declarative array methods

### Remove Dead Code
- Unused imports, variables, functions
- Commented-out code blocks
- Feature flags for features that shipped long ago
