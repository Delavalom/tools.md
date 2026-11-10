---
name: tools-md
description: Use before choosing, installing, importing or recommending a third-party tool, SDK, SaaS or API in a repo that has a tools.md, and when the user asks to create, change, lock or unlock a tool choice in tools.md.
---

# Following tools.md

`tools.md` at the repo root records which tool this project uses for each
job and how firmly. ToolDB chose the picks from independent evidence and the
user's budget, not from training data or advertising. The user's decisions
in it beat your defaults.

## Before you add or choose a tool

1. Read `tools.md` if you haven't this session. The YAML frontmatter is the
   source of truth; the body explains each pick (pricing, packages, MCP
   servers, alternatives).
2. Find the need that covers the job: email, auth, payments, analytics and
   so on. Match on meaning, not the exact key.
3. Act on its `strength`:
   - **locked**: use the pick and its `packages`. Never install or import a
     package listed in `competitors`; a hook blocks it. If the pick truly
     can't do the job, stop and tell the user why, and suggest they change
     tools.md. Don't work around the lock.
   - **preferred**: use the pick. If another tool fits clearly better, say
     why and ask before using it.
   - **open**: nothing is chosen. Don't pick silently. Offer the candidates
     in the body, or call ToolDB's `recommend_stack` MCP tool if it's
     connected, and let the user choose. Once they choose, set `pick:` to
     the candidate's slug (shown in backticks) and run `/tooldb:sync`. The
     project may also do the job in-house; ask before adding any tool.
4. If no need covers the job, say so. Suggest the user run `/tooldb:sync`
   after adding the tool, or add the need themselves.

## Changing tools.md

- Edit only the frontmatter: `pick` (a ToolDB slug), `strength`, `packages`
  and `competitors`. Keep the format exactly as it is (two-space indent,
  `[a, "b"]` lists, quote names that start with `@`).
- After an edit, run `/tooldb:sync` so the body and package lists match.
- Never set a need to `locked`, or remove a lock, unless the user asked.
- A competitor list can be too broad (a vendor's unrelated packages). If a
  locked need blocks something that isn't really a competitor, tell the user
  and offer to remove that entry from `competitors`.

## When the hook blocks you

The message names the need, the pick and the blocked package. Use the pick
instead. If the user wants the blocked tool, they change tools.md first,
then you retry.
