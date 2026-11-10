#!/usr/bin/env node
// PreToolUse hook: enforces the `locked` needs in the project's tools.md.
// Blocks (exit 2, reason on stderr) a Bash command that installs a listed
// competitor, or a Write/Edit/MultiEdit that adds an import of one to a
// JS/TS file. Anything else, and any failure of its own, lets the call
// through: the guard never blocks because it broke.

import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { blockMessage, importedPackages, isSourceFile, lockedCompetitors, packagesAddedByCommand, parseToolsMd } from "./toolsmd.mjs";

/** The package names this tool call would add, or none. */
export function addedPackages(input, readFile = (p) => (existsSync(p) ? readFileSync(p, "utf8") : "")) {
  const tool = input.tool_name;
  const args = input.tool_input ?? {};
  if (tool === "Bash") return packagesAddedByCommand(String(args.command ?? ""));
  const file = String(args.file_path ?? "");
  if (!isSourceFile(file)) return [];
  const added = (after, before) => {
    const had = importedPackages(before);
    return [...importedPackages(after)].filter((p) => !had.has(p));
  };
  if (tool === "Write") return added(String(args.content ?? ""), readFile(isAbsolute(file) ? file : resolve(input.cwd ?? ".", file)));
  if (tool === "Edit") return added(String(args.new_string ?? ""), String(args.old_string ?? ""));
  if (tool === "MultiEdit") return (args.edits ?? []).flatMap((e) => added(String(e.new_string ?? ""), String(e.old_string ?? "")));
  return [];
}

/** null to allow, or the reason to block. */
export function check(input, toolsMdText, readFile) {
  const doc = parseToolsMd(toolsMdText);
  const blocked = lockedCompetitors(doc);
  if (!blocked.size) return null;
  const hits = [...new Set(addedPackages(input, readFile))].filter((p) => blocked.has(p));
  if (!hits.length) return null;
  return hits.map((name) => blockMessage(name, blocked.get(name))).join("\n");
}

async function main() {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  const input = JSON.parse(raw);
  const dir = process.env.CLAUDE_PROJECT_DIR || input.cwd;
  const path = dir && join(dir, "tools.md");
  if (!path || !existsSync(path)) return 0;
  const reason = check(input, readFileSync(path, "utf8"));
  if (!reason) return 0;
  process.stderr.write(`${reason}\n`);
  return 2;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().then(
    (code) => process.exit(code),
    () => process.exit(0),
  );
}
