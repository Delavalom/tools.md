---
description: Refresh tools.md from ToolDB — keeps your picks and locks, updates packages, competitors and pricing, and reports drift
argument-hint: "[free|low|flexible]"
allowed-tools: Bash(node:*), Read, AskUserQuestion
---

Refresh this repo's `tools.md`. Arguments: $ARGUMENTS

1. If there's no `tools.md`, suggest `/tooldb:init` and stop.

2. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/generate.mjs" sync`, adding
   `--budget <b>` only when the argument is `free`, `low` or `flexible`.
   This keeps every pick and strength in the file; ToolDB refreshes the
   package lists, competitors and the prose. No AI planning runs on sync.

3. Read the current `tools.md` and the draft, and summarise what changed:
   new or removed competitors, changed packages, and needs whose prose
   changed (pricing, for example). Keep it short.

4. Report the drift:
   - **competitor-installed**: a package that competes with a pick is in the
     repo. For a locked need that's a conflict; ask whether to remove the
     package or change the decision.
   - **pick-not-installed**: informational.
   - **untracked**: a SaaS/API in the repo that no need covers. Offer to add
     a need for it by editing the frontmatter, then sync again.

5. Ask with AskUserQuestion whether to write the refreshed file (yes / no).
   If an open need's `candidates` now include something the user might
   choose, you can add one question per open need (at most three) with its
   candidates plus "Leave open".
   If yes, run `node "${CLAUDE_PLUGIN_ROOT}/scripts/apply.mjs" <draft>`, adding
   `--pick key=slug,...` for any chosen candidates. Strengths come from the
   draft, so nothing else needs passing. After a new pick, sync once more so
   its packages and competitors fill in. Don't commit unless the user asks.
