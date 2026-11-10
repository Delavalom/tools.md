# tools.md for Claude Code

`tools.md` is a lockfile for tool choices. It sits next to `AGENTS.md` and
records which tool the project uses for each job (email, auth, payments…)
and how firmly. ToolDB makes the picks from independent evidence and your
budget, not from training data or advertising. Claude follows the file, and
a hook enforces the needs you lock.

| Strength | What Claude does |
| --- | --- |
| `locked` | Uses the pick. Installing or importing a listed competitor is blocked. |
| `preferred` | Uses the pick unless it can justify an alternative to you. |
| `open` | Nothing chosen yet; it asks ToolDB and lets you choose. |

## The file

```yaml
---
tooldb: 1
budget: low
project: "A newsletter SaaS for indie writers."
needs:
  transactional-email:
    pick: resend
    name: Resend
    strength: locked
    packages: [resend]
    competitors: ["@sendgrid/mail", postmark, mailgun.js]
  product-analytics:
    strength: open
---
```

Edit the frontmatter and run `/tooldb:sync`; the body below it is rewritten
from it. Competitor lists are editable: if a lock blocks something that isn't
really a competitor, remove it from the list. The hook only ever blocks names
listed under a locked need, and it allows the call whenever tools.md is
missing or unreadable.

## Install

```
/plugin marketplace add Delavalom/tools.md
/plugin install tooldb@tools.md
```

## Use

- `/tooldb:init [free|low|flexible]` scans your package.json files, writes a
  one-paragraph description of the project, and asks ToolDB for a tools.md.
  Tools you already use become picks. Every other need stays `open`, with
  ToolDB's candidates listed: tools.md records decisions, never guesses. You
  choose candidates for open needs and which needs to lock. It also adds `@tools.md` to
  CLAUDE.md (or a pointer to AGENTS.md).
- `/tooldb:sync` refreshes packages, competitors and prose while keeping your
  picks and locks, and reports drift: installed competitors, picks not
  installed yet, and tools no need covers.

## What is sent to ToolDB

Your code never leaves your machine. The plugin sends only:

- the package names from your `package.json` files (up to 400),
- on init: the one-paragraph project description and the budget you chose,
- on sync: your current `tools.md`.

ToolDB caps its AI planning per day. When the cap is hit, init still works
from your installed packages and leaves the other needs open.

Set `TOOLDB_URL` to use another ToolDB instance. The default is
`https://tooldb-web-production.up.railway.app`.
