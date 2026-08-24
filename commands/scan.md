---
name: scan
description: "Count LOC, enforce per-file limits, get optimization strategies."
argument-hint: "[language] [path]"
allowed-tools: Task, Bash, Read
---

1. Delegate to the **counter** agent (`subagent_type: "loc-guardian:counter"`, `model: "haiku"`).
   Prompt: `Count lines of code and check limits. Arguments: $ARGUMENTS`

2. **Validate the verdict before trusting anything.** The counter's output is only usable if
   it contains a line matching this pattern exactly:

   ```
   ^\*\*VERDICT: [0-9]+ over limit, [0-9]+ warnings \| limit: [0-9]+\*\*$
   ```

   Check for a line that *matches* the pattern — not for output that merely *contains* the
   text `VERDICT:`. A failure message such as `ERROR: no VERDICT: line was produced` contains
   that substring and would otherwise pass the check, letting a failed scan be reported as a
   successful one.

3. **If no line matches**, the scan did not happen. Run the count directly, once — the
   measurement is a shell command and does not need a model:

   ```bash
   set -u
   PLUGIN=${CLAUDE_PLUGIN_ROOT:?CLAUDE_PLUGIN_ROOT is unset}
   command -v tokei >/dev/null || { echo "tokei is not installed" >&2; exit 127; }
   command -v node  >/dev/null || { echo "node is not installed" >&2; exit 127; }
   D=$(mktemp -d) || exit 1
   [ -n "$D" ] && [ -d "$D" ] || { echo "mktemp failed" >&2; exit 1; }
   trap 'rm -rf "$D"' EXIT INT TERM
   tokei . -o json > "$D/all.json"  || exit 1
   tokei . --exclude tests --exclude test --exclude spec --exclude __tests__ \
           --exclude __mocks__ --exclude __fixtures__ --exclude __snapshots__ \
           --exclude testdata -o json > "$D/prod.json" || exit 1
   node "$PLUGIN/scripts/reduce-loc.mjs" --all "$D/all.json" --prod "$D/prod.json" --limit 350
   ```

   Use the project's configured `max_pure_loc` in place of `350` if
   `.claude/loc-guardian.local.md` sets one. Run this **at most once** — do not re-dispatch the
   counter and do not loop. If it also fails, report its exit status and stderr, and stop.
   Exit 127 means a missing prerequisite; tell the user which one.

4. Relay the counter's output (or the fallback's) verbatim.

5. Read the file counts from the verdict line. **If it reports one or more files over the
   limit**, delegate to the **optimizer** agent
   (`subagent_type: "loc-guardian:optimizer"`, `model: "opus"`). Pass the entire report as the
   optimizer's prompt, prefixed with:
   `Analyze the over-limit and warning files listed below and provide optimization strategies:`

6. Relay the optimizer's output verbatim.

7. **Never invoke the optimizer without a verdict line that matched step 2.** A report with no
   validated verdict means the measurement failed; running an opus agent over a file list that
   was never produced is worse than reporting the failure.

8. If the verdict reports zero files over the limit, do not invoke the optimizer. When it
   reports zero over but one or more warnings, still do not invoke it — say the project is
   within limits and name the warning-zone files from the report.
