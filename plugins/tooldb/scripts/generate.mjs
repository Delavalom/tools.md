#!/usr/bin/env node
// Asks ToolDB for a tools.md and writes it to a draft file (never tools.md
// itself: apply.mjs does that once the user has chosen what to lock).
//
//   node generate.mjs init --project "<one paragraph>" [--budget free|low|flexible] [--root DIR]
//   node generate.mjs sync [--budget ...] [--root DIR]
//
// Sends the project description, the repo's package names and (sync) the
// current tools.md to $TOOLDB_URL/api/v1/toolsmd. Prints JSON:
//   {draft, needs, candidates, drift, unresolved, warnings, scanned}

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scan } from "./scan.mjs";

const DEFAULT_URL = "https://tooldb-web-production.up.railway.app";

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

const mode = process.argv[2];
if (mode !== "init" && mode !== "sync") fail("usage: generate.mjs init --project <text> | sync");

const repo = scan(arg("root"));
const body = { packages: repo.packages.slice(0, 400) };
const project = arg("project") ?? (arg("project-file") ? readFileSync(arg("project-file"), "utf8") : undefined);
if (project) body.project = project.trim().slice(0, 2000);
if (arg("budget")) body.budget = arg("budget");
if (mode === "sync") {
  if (!repo.toolsMd) fail("No tools.md in this repo yet: run /tooldb:init first.");
  body.existing = readFileSync(join(repo.root, "tools.md"), "utf8");
} else if (!body.project) {
  fail("init needs --project: one paragraph on what the project is and who it is for.");
}

const base = (process.env.TOOLDB_URL || DEFAULT_URL).replace(/\/$/, "");
let res;
try {
  res = await fetch(`${base}/api/v1/toolsmd`, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "tooldb-claude-plugin/0.1", ...(process.env.TOOLDB_API_KEY ? { authorization: `Bearer ${process.env.TOOLDB_API_KEY}` } : {}) },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90_000),
  });
} catch (error) {
  fail(`Could not reach ToolDB at ${base}: ${error instanceof Error ? error.message : error}`);
}
const text = await res.text();
if (!res.ok) {
  let detail = text.slice(0, 500);
  try {
    detail = JSON.parse(text).error ?? detail;
  } catch {}
  fail(`ToolDB answered ${res.status}: ${detail}`);
}
const result = JSON.parse(text);

const dir = join(tmpdir(), "tooldb");
mkdirSync(dir, { recursive: true });
const draft = join(dir, `tools-${Date.now()}.md`);
writeFileSync(draft, result.markdown);
console.log(JSON.stringify({ draft, needs: result.needs, candidates: result.candidates ?? {}, drift: result.drift, unresolved: result.unresolved, warnings: result.warnings ?? [], scanned: repo.packages.length }, null, 2));
