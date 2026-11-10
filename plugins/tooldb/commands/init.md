---
description: Create tools.md for this repo — records the tools you already use per need, lists ToolDB's evidence-ranked candidates for the rest, and lets you choose what to lock
argument-hint: "[free|low|flexible] [what the project is, if not obvious from the repo]"
allowed-tools: Bash(node:*), Read, Glob, Grep, AskUserQuestion
---

Create `tools.md` for this repo with ToolDB. Arguments: $ARGUMENTS

tools.md records decisions, never guesses. Only tools the repo already uses
become picks. Every other need stays `open`, with ToolDB's candidates listed,
until the user chooses one.

1. **Check first.** If `tools.md` already exists, stop and suggest `/tooldb:sync`.

2. **Scan.** Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/scan.mjs"`. It lists the
   repo's npm packages and `.env.example` keys. Nothing leaves the machine yet.

3. **Describe the project** in one paragraph of at most 120 words: what it is,
   who it's for, its stack and hosting, and any constraints (self-hosting,
   region, compliance, things it deliberately builds in-house). Base it on the
   README, the code and the scan, plus anything in the arguments. Don't list
   packages: ToolDB gets those separately. Only the paragraph and the package
   names are sent.

4. **Budget.** Use the argument if it is `free`, `low` or `flexible`.
   Otherwise default to `low` and mention it.

5. **Generate.** Run
   `node "${CLAUDE_PLUGIN_ROOT}/scripts/generate.mjs" init --budget <budget> --project "<paragraph>"`.
   It prints `{draft, needs, candidates, drift, unresolved, warnings}`, and the
   draft is written to a temp file. If it fails, show the error and stop. Show
   any `warnings` word for word before anything else.

6. **Fix unclear need names.** Some keys come from coarse catalog categories,
   so Clerk can arrive as `backend-workflow-infra`. For each key that doesn't
   name the job the pick does in *this* project, choose a short kebab-case key
   that does (`authentication`, `llm-gateway`, `video-transcription`), and
   remember it for `--rename old=new`. Sync searches by the key, so a clear
   key also gives better competitors and candidates later.

7. **Show the result.** Use the renamed keys in a short table with one row per
   need: the key, the pick (or "open"), and the number of competitors. List
   the drift messages below it. If `unresolved` isn't empty, say those
   packages will be looked up on the next sync.

8. **Ask the user (AskUserQuestion), in one call:**
   - **Open needs.** One question per open need, at most three, most
     important first. The options are its `candidates` (name and pricing) plus
     "Leave open". Skip needs the project clearly handles in-house (for
     example, posting through the platform's own API); leave those open. If
     there are more than three open needs, say the rest stay open.
   - **Locks** (multiSelect): which needs with a pick to **lock**, default
     none. Explain in a line: locked means installing or importing a
     competitor is blocked; everything else stays preferred.

9. **Write.** Run
   `node "${CLAUDE_PLUGIN_ROOT}/scripts/apply.mjs" <draft> --rename <old=new,...> --pick <key=slug,...> --lock <key,...>`,
   leaving out any flag with nothing to pass. It writes `tools.md`, then adds
   `@tools.md` to CLAUDE.md or a pointer to AGENTS.md so future sessions read
   it. If the output has `next` (a new pick was chosen), finish the new picks'
   packages and competitors: run
   `node "${CLAUDE_PLUGIN_ROOT}/scripts/generate.mjs" sync`, then
   `node "${CLAUDE_PLUGIN_ROOT}/scripts/apply.mjs" <new draft>`.

10. Finish with one line: where tools.md is, what got picked and locked, how
    many needs are still open, and that `/tooldb:sync` refreshes it. Don't
    commit unless the user asks.
