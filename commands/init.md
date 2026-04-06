---
name: init
description: "Initialize loc-guardian for this project — set LOC limit and extraction rules."
allowed-tools: Read, Write, Glob, AskUserQuestion
---

Initialize loc-guardian for this project by creating `.claude/loc-guardian.local.md`.

## Step 1: Check Existing Config

Read `.claude/loc-guardian.local.md` if it exists. If it does, show the current settings and ask if the user wants to reconfigure. If the user says no, stop.

## Step 2: Detect Project Context

Use a single Glob call to find which language marker files exist:

```
pattern: "{package.json,Cargo.toml,pyproject.toml,setup.py,requirements.txt,go.mod,Gemfile,pom.xml,build.gradle,mix.exs,Package.swift}"
```

Read only the files Glob finds (typically 1-2). Infer stack and frameworks from the manifest contents (e.g. React/Vue/Svelte from package.json dependencies, Django/Flask from requirements.txt).

Do NOT read files that don't exist. Do NOT try to list directories.

## Step 3: Ask the User

Use AskUserQuestion to ask:

1. **Per-file pure LOC limit** — suggest 350 as default. Options: 200, 350 (Recommended), 500, Other.

2. **Extraction rules** — Based on the detected stack, propose extraction rules. Present as a preview. Rules should be concrete:
   - What to extract (type definitions, constants, utilities, sub-components, etc.)
   - Where to put them (naming convention for the target file)

   Let the user confirm or customize — these are THEIR conventions.

## Step 4: Write Config

Write `.claude/loc-guardian.local.md` with:

- YAML frontmatter containing `max_pure_loc`
- Markdown body containing the extraction rules exactly as the user confirmed them

## Step 5: Confirm

Show the user what was written.
