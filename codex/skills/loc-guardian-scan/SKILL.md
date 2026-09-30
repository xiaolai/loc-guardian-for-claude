---
name: loc-guardian-scan
description: "Count pure LOC, enforce per-file limits, and get measured optimization strategies for over-limit files. Optional arguments: a language (e.g. typescript) and paths. Entry point for loc-guardian in Codex."
---

# LOC Guardian Scan

Orchestrates two steps: count (`$loc-guardian-counter`), then — only when files are over the
limit — optimize (`$loc-guardian-optimizer`). Arguments: `[language] [path...]`, both optional.

## Steps

1. **Count.** Follow `$loc-guardian-counter` with the user's arguments. Its instructions are in
   `../loc-guardian-counter/SKILL.md` relative to this file. If Codex subagents are available,
   you may run it in a subagent and take its output; otherwise run it inline. Either way the
   output is the reducer script's stdout.

2. **Validate the verdict before trusting anything.** The count output is only usable if it
   contains a line matching this pattern exactly:

   ```
   ^\*\*VERDICT: [0-9]+ over limit, [0-9]+ warnings \| limit: [0-9]+( \| [0-9]+ overrides?(, [0-9]+ ignored)?)?\*\*$
   ```

   Check for a line that *matches* the pattern — not for output that merely *contains* the
   text `VERDICT:`. A failure message such as `ERROR: no VERDICT: line was produced` contains
   that substring and would otherwise pass the check, letting a failed scan be reported as a
   successful one.

3. **If no line matches**, the scan did not happen. Re-run Step 3 of `$loc-guardian-counter`
   **once**, exactly as written there (it resolves the plugin root and checks every
   prerequisite). Do not loop. If it also fails, report its exit status and stderr, and stop.
   Exit 127 means a missing prerequisite; tell the user which one.

4. Relay the count output verbatim.

5. Read the file counts from the verdict line. **If it reports one or more files over the
   limit**, follow `$loc-guardian-optimizer` (`../loc-guardian-optimizer/SKILL.md`), giving it
   the entire report prefixed with:
   `Analyze the over-limit and warning files listed below and provide optimization strategies:`
   A subagent is fine if available; the optimizer only reads files and measures ranges.

6. Relay the optimizer's output verbatim.

7. **Never run the optimizer without a verdict line that matched step 2.** A report with no
   validated verdict means the measurement failed; analyzing a file list that was never
   produced is worse than reporting the failure.

8. If the verdict reports zero files over the limit, do not run the optimizer. When it reports
   zero over but one or more warnings, still do not run it — say the project is within limits
   and name the warning-zone files from the report.
