---
name: scan
description: "Count LOC, enforce per-file limits, get optimization strategies."
argument-hint: "[language] [path]"
---

1. Delegate to **counter** agent (`subagent_type: "loc-guardian:counter"`, `model: "haiku"`). Prompt: `Count lines of code and check limits. Arguments: $ARGUMENTS`
2. If the counter agent returns empty output, produces an error, or does not contain a `VERDICT:` line, inform the user that the LOC count failed and stop without invoking the optimizer.
3. Relay counter output verbatim.
4. Check the counter's verdict line. If it shows **any files over limit** (N > 0 in `VERDICT: N over limit`), delegate to **optimizer** agent (`subagent_type: "loc-guardian:optimizer"`, `model: "opus"`). Pass the **entire counter output** as the optimizer's prompt, prefixed with: `Analyze the over-limit and warning files listed below and provide optimization strategies:`
5. Relay optimizer output verbatim.
6. If zero files are over limit, do not invoke the optimizer.
