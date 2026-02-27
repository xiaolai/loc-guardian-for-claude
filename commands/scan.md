---
description: "Count LOC, enforce per-file limits, get optimization strategies."
argument-hint: "[language] [path]"
---

1. Delegate to **counter** agent (`subagent_type: "loc-guardian:counter"`, `model: "haiku"`). Prompt: `Count lines of code and check limits. Arguments: $ARGUMENTS`
2. Relay counter output verbatim. If the counter output does not contain a valid `VERDICT:` line, relay the output as-is to the user and do not invoke the optimizer.
3. Check the counter's verdict line. If it shows **any files over limit** (N > 0 in `VERDICT: N over limit`), delegate to **optimizer** agent (`subagent_type: "loc-guardian:optimizer"`, `model: "opus"`). Pass the **entire counter output** as the optimizer's prompt, prefixed with: `Analyze the over-limit and warning files listed below and provide optimization strategies:`
4. Relay optimizer output verbatim.
5. If zero files are over limit, do not invoke the optimizer.
