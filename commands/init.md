---
description: "Initialize loc-guardian for this project — set LOC limit and extraction rules."
model: sonnet
allowed-tools: Read, Write, AskUserQuestion
---

Initialize loc-guardian for this project by creating `.claude/loc-guardian.local.md`.

## Step 1: Check Existing Config

Read `.claude/loc-guardian.local.md` if it exists. If it does, show the current settings and ask if the user wants to reconfigure. If the user says no, stop.

## Step 2: Detect Project Context

Run these in parallel to understand the project:
- Read the project root directory listing to see the file structure
- Check for language markers by reading: `package.json` (JS/TS), `Cargo.toml` (Rust), `pyproject.toml` / `setup.py` / `requirements.txt` (Python), `go.mod` (Go), `Gemfile` (Ruby), `pom.xml` / `build.gradle` (Java/Kotlin), `*.sln` / `*.csproj` (C#), `mix.exs` (Elixir), `Package.swift` (Swift)
- Check for frameworks: look at dependencies in the manifest file (React, Vue, Svelte, Django, Flask, FastAPI, Rails, Spring, and other frameworks detected in the manifest)

## Step 3: Ask the User

Use AskUserQuestion to ask:

1. **Per-file pure LOC limit** — suggest 350 as default. Options: 200, 350 (Recommended), 500, Other.

2. **Extraction rules** — Based on the detected language/framework, propose a set of extraction rules as a starting point. Ask the user to confirm or customize. Present the proposed rules as a preview in the question. The rules should be concrete patterns like:
   - What to extract (type definitions, constants, utilities, sub-components, etc.)
   - Where to put them (naming convention for the target file)

   Tailor the suggestions to the detected stack, but let the user edit freely — these are THEIR conventions.

## Step 4: Write Config

Create `.claude/` directory if it doesn't exist. Only write to `.claude/loc-guardian.local.md`. Write it with:

- YAML frontmatter containing `max_pure_loc`
- Markdown body containing the extraction rules exactly as the user confirmed them

## Step 5: Confirm

Show the user what was written and confirm loc-guardian is configured for this project.
