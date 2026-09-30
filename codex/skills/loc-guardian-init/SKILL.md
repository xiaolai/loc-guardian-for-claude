---
name: loc-guardian-init
description: "Initialize loc-guardian for this project — set the per-file pure-LOC limit and project-specific extraction rules in .claude/loc-guardian.local.md."
---

# LOC Guardian Init

Initialize loc-guardian for this project by creating `.claude/loc-guardian.local.md`. The path
is shared with the Claude Code plugin, so one config serves both tools.

## Step 1: Check Existing Config

Read `.claude/loc-guardian.local.md` if it exists. If it does, show the current settings and
ask whether the user wants to reconfigure. If the user says no, stop.

## Step 2: Detect Project Context

Check which of these language marker files exist in the project root, with one command:

```bash
ls -1 package.json Cargo.toml pyproject.toml setup.py requirements.txt go.mod Gemfile pom.xml build.gradle mix.exs Package.swift 2>/dev/null
```

Read only the files it lists (typically 1-2). Infer stack and frameworks from the manifest
contents (e.g. React/Vue/Svelte from `package.json` dependencies, Django/Flask from
`requirements.txt`). Do not read files that do not exist, and do not walk the directory tree.

## Step 3: Ask the User

Ask the user these two questions and wait for the answers before writing anything:

1. **Per-file pure LOC limit** — suggest 350 as the default. Options: 200, 350 (recommended),
   500, or another number.

2. **Extraction rules** — based on the detected stack, propose extraction rules as a preview.
   Make them concrete:
   - What to extract (type definitions, constants, utilities, sub-components, etc.)
   - Where to put them (naming convention for the target file)

   Let the user confirm or customize — these are their conventions.

## Step 4: Write Config

Create `.claude/` if needed, then write `.claude/loc-guardian.local.md` with:

- YAML frontmatter containing `max_pure_loc`
- A Markdown body containing the extraction rules exactly as the user confirmed them

## Step 5: Confirm

Show the user what was written, and suggest `$loc-guardian-scan` as the next step.
