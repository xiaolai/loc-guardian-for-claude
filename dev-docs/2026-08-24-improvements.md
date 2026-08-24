# Field report — improvements found while scanning a real repository

**Date:** 2026-08-24
**Plugin version at time of scan:** 0.1.5
**Subject repository:** an Electron 43 + TypeScript app, 244 files, 35,237 code lines,
67,156 raw lines, 43.7% comment density, `max_pure_loc: 350`.

This note records what broke and what proved wrong when `/loc-guardian:scan` was run
against a codebase larger than a toy. Findings are ordered by evidence strength, not by
effort. Each one names the file to change.

Confidence labels used below:

- **Observed** — it happened during the run; there is a transcript.
- **Measured** — a command was run and its output checked.
- **Reasoned** — follows from reading the artifacts; not independently demonstrated.

---

## Tier 1 — the plugin did not complete a scan

### 1. The counter routes bulk machine data through a language-model context

**Observed.** The counter agent was dispatched three times and died three times, each at a
different point in its own workflow (after reading config; while processing JSON; at
"Step 4: Check file limits"). Every failure surfaced as
`API Error: Connection lost mid-response`. No verdict line was ever produced, so
`scan.md` step 2 fired each time and the scan terminated.

**What the design does today.** `agents/counter.md` Step 2 issues three
`tokei … -o json` calls in a single message; Step 3 then says "From the JSON output,
extract per-language: `files`, `code`, `comments`, `blanks`, `total`." On the subject
repository those three payloads totalled roughly 109 KB — 51,730 + 28,654 + 28,654 bytes —
and included a 244-entry per-file `reports` array. All of it lands in a haiku context at
once.

**Calibration — read this before "fixing" it.** The three deaths are fact. The
volume-of-JSON explanation is the leading hypothesis, *not* a proven cause: the error
string is an API transport error, not an explicit context-limit error, and the successful
workaround changed approach, model, and wall-clock time simultaneously. Do not record
"context overflow" as the confirmed root cause on this evidence alone. If you want the
cause nailed down, re-run the current counter against this size of repository and capture
whether it fails deterministically.

**Why change it regardless of cause.** Counting lines is arithmetic. Arithmetic should not
be laundered through a language model that can hallucinate a sum, and it should not be
exposed to transport flakiness proportional to payload size. The counter already holds
`Bash`.

**Fix sketch.** Have the counter redirect tokei's JSON to a temp file and reduce it with a
script, printing only the finished tables:

```
tokei <paths> <excludes> -o json > "$TMP/all.json"
tokei <paths> <excludes> <test-excludes> -o json > "$TMP/prod.json"
python3 <reducer> "$TMP"      # emits Tables 1-5, verdict line, loc-data block
```

This path was exercised manually during the failed run and produced the complete report on
the first attempt with zero JSON entering context.

---

### 2. `scan.md` step 2 is a dead end

**Observed.** Step 2 reads: "If the counter agent returns empty output, produces an error,
or does not contain a `VERDICT:` line, inform the user that the LOC count failed and stop
without invoking the optimizer."

That instruction was reached three times in a row. Each time the correct user-facing answer
was one shell command away. The guard is right to protect the *optimizer* from running on
absent data — that part should stay — but "stop" is the wrong terminal state for a
mechanical count.

**Fix sketch.** Retry the counter once. If it fails again, compute the report directly
using the same documented method rather than reporting failure. Keep the
"never invoke the optimizer without a real verdict" rule exactly as it is.

**File:** `commands/scan.md`, step 2.

---

### 3. The third tokei invocation is redundant

**Measured.** `agents/counter.md` Step 2 asks for three runs; commands 2 and 3 differ only
by `-f`. For JSON output `-f` does **not** add per-file data — the `reports` array is
present either way. Comparing `tokei src/shared -o json` against
`tokei src/shared -f -o json`: identical key set, identical `Total`, identical
`reports` membership for every language; the only difference is the *order* of entries
within the `reports` array (42 TypeScript entries, same set, different sequence).

So command 3 is one wasted process and roughly 28 KB of wasted payload per scan, returning
data command 2 already carried.

**Fix.** Drop to two tokei calls. Take per-file data from the production JSON.

**File:** `agents/counter.md`, Step 2 and Step 3.

---

## Tier 2 — the gate is wrong in ways that erode trust in it

### 4. Non-source files are enforced against a source-code limit

**Reasoned, with measured support.** With no language filter the counter counts every
language, and Step 4 then checks "every production file's pure LOC" against
`max_pure_loc`. Nothing distinguishes source from data. A long JSON, YAML, or Markdown file
therefore becomes a *file over limit*, and the optimizer is asked to write it an extraction
plan phrased in terms of modules, closures, and state — vocabulary that does not apply.

On the subject repository this did not produce a false positive (all nine over-limit files
were genuine TypeScript), but fixture JSON did reach the production totals — see finding 5.

**Fix sketch.** Keep every language in Table 1. Restrict limit enforcement to source
languages, with the enforced set configurable.

**Files:** `agents/counter.md` Step 4; `skills/loc/SKILL.md` under Per-File Limit Config.

---

### 5. Missing test-directory exclusions

**Measured.** `skills/loc/SKILL.md` lists `__tests__` and `__mocks__` among test
directories but not `__fixtures__`. It lists bare `fixtures`, which does not glob-match the
dunder form. Missing likewise: `__snapshots__`, and Go's `testdata`.

Effect on the subject repository: three `__fixtures__` directories were counted as
production, contributing about 276 lines of fixture JSON to Pure LOC. No verdict moved —
the fixture files are small and none is TypeScript — but the number reported as
"production code" was wrong by that much.

The list is inconsistent on its own terms, since two of the three dunder conventions are
already present.

**Fix.** Add `__fixtures__`, `__snapshots__`, `testdata` to the test-directory list.

**File:** `skills/loc/SKILL.md`, Tokei Conventions.

---

### 6. The optimizer cannot measure the metric the plugin exists to measure

**Observed.** `agents/optimizer.md` frontmatter grants `tools: Read, Grep, Glob`. There is
no Bash, so the optimizer cannot run tokei on a line range. Asked for per-extraction
savings in *pure* LOC, it opened its report by stating that every figure was estimated from
each file's whole-file code-to-raw ratio, adjusted by judgement for dense data tables and
comment-heavy prose.

Its estimates were therefore honest and clearly labelled — and still guesses at precisely
the quantity this plugin exists to measure exactly. The plugin's founding argument is that
raw lines are meaningless and only pure lines count; its recommendations are currently
priced in raw lines times a fudge factor. Every "~85 lines saved" and every
"estimated result: ~316 pure LOC" inherits that.

**Fix.** Grant the optimizer `Bash` and instruct it to price each proposed extraction by
measuring the range, e.g. `sed -n '620,780p' file.ts | tokei -` , so the savings and the
projected post-extraction total are counts rather than estimates. If Bash is deliberately
withheld for safety, then the report format must stop implying precision — but measuring
is the better answer, because "will this get me under the limit?" is the whole question a
user brings to the optimizer.

**File:** `agents/optimizer.md` frontmatter and Step 2.

---

### 7. A single global limit for every file

**Reasoned.** `max_pure_loc` is one number applied to composition roots, leaf modules,
generated files, and vendored code alike.

The subject repository's own config file argues this point at length and then settles for
one number anyway — its stated design goal was "no false positives today and roughly 90
lines of headroom above everything healthy," with the warning that "a gate that is usually
wrong is a gate people learn to ignore." At scan time that limit flagged nine files. Some
of those, notably the Electron main-process entry point, are known composition roots whose
honest ceiling is not the same as a leaf module's.

**Fix sketch.** Support per-glob overrides and an explicit ignore list in the config
frontmatter:

```yaml
max_pure_loc: 350
overrides:
  "src/main/index.ts": 600
ignore:
  - "src/generated/**"
```

**Files:** `commands/init.md` Step 4; `skills/loc-optimization/SKILL.md` config format;
`agents/counter.md` Step 4.

---

### 8. Nothing detects that the config's own evidence has rotted

**Measured.** The subject repository's `.claude/loc-guardian.local.md` states that the
limit "flags exactly two files," names them with counts of 836 and 578, asserts that
"the next file down is 260," and cites `shared/ipc.ts` as 530 raw / 193 code.

Measured on the same day: nine files over the limit; the entry point at 1540 pure, not 578;
`shared/ipc.ts` at 356 pure / 1387 raw, not 193 / 530. One of the two files the note names
by path, `settings/main.ts`, no longer exists — it became `panes.ts`.

The config embeds measured evidence and has no mechanism to notice when that evidence stops
describing the codebase. A limit defended by stale numbers is a limit nobody can audit, and
the drift is invisible precisely because the file reads as authoritative.

**Fix sketch.** Let init record a dated baseline in the frontmatter
(`baseline: {date, files_over, largest}`). Have the counter compare the live result against
it and print one line when they diverge — for example: *"config baseline (2026-03-11) claims
2 over limit; measured 9. Re-run /loc-guardian:init."* Cheap, and it converts a silent lie
into a visible prompt.

**Files:** `commands/init.md` Step 4; `agents/counter.md` Step 5.

---

## Tier 3 — it is not yet a guardian

### 9. No CI or exit-code mode

**Reasoned.** Every path into this plugin is a human typing a slash command inside an
interactive session. There is no way to fail a pre-commit hook or a CI job on a violation,
which means the limit is advisory. The name promises otherwise.

The count itself needs no model at all. A `--check` mode — tokei, reduce, exit non-zero on
any violation, print the `loc-data` block — would make it enforcing, and would run in a
second with no tokens spent.

### 10. No trend

**Reasoned.** "9 over limit" carries no information about direction. The subject repository
moved from a documented 2 to a measured 9 with nothing recording the slope.

A machine-readable `loc-data` block is already emitted on every run. Appending it to a
history file, with a date, buys trend almost free, and would surface drift while it is
still cheap to reverse rather than at the next manual scan.

### 11. The config file is gitignored, so team conventions are untracked

**Measured.** In the subject repository, `.gitignore` ignores all of `.claude/`, and
`git ls-files` confirms `.claude/loc-guardian.local.md` has never been committed.

That file holds a reasoned rationale for the chosen limit and five extraction rules, each
with a worked precedent from the codebase. It is real engineering documentation. It is
currently one `rm -rf` from gone, invisible to anyone who clones the repository, and
unreviewable in any pull request.

The `.local.md` naming actively encourages this outcome: by convention `.local` means
*personal, machine-specific, git-ignored*. Extraction rules are the opposite — shared team
policy that belongs in review.

**Fix sketch.** Split the concerns. `.claude/loc-guardian.md` holds the limit and the
extraction rules and is meant to be committed; an optional `.claude/loc-guardian.local.md`
overrides the limit per developer and stays ignored. Have init write the former by default
and say so.

**Files:** `commands/init.md`; `skills/loc-optimization/SKILL.md`; `README.md`.

---

## Smaller items

- `commands/scan.md` declares no `allowed-tools` while `commands/init.md` does. Pick one
  convention.
- `agents/counter.md` and `README.md` both hardcode `brew install tokei`. tokei also ships
  via cargo, apt, dnf, pacman, and scoop; the message strands every non-macOS user.
- `CLAUDE.md` documents the architecture as "counter (haiku) → optimizer (opus)" without
  noting that the counter's payload scales with repository size. If the Tier 1 fix lands,
  update that section to state that bulk data never enters a context.

---

## Suggested order

1. Tier 1 as a single change — it is the difference between working and not working on a
   repository of this size.
2. Findings 5 and 6 next: both are small, and 6 removes the "estimates, not counts"
   disclaimer from every report the plugin produces.
3. Finding 11 before finding 7 — no point adding richer config syntax to a file that is not
   under version control.
4. Findings 9 and 10 last; they are new surface area rather than corrections.
