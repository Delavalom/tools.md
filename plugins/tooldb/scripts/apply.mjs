#!/usr/bin/env node
// Writes a draft from generate.mjs to <root>/tools.md, with the strengths the
// user chose, and makes sure the agent reads it every session.
//
//   node apply.mjs <draft> [--rename old=new,...] [--pick key=slug,...] [--lock key,key] [--prefer key,key] [--open key,key] [--root DIR] [--no-link]
//
// Applied in that order, so --pick and --lock use the renamed keys. A need
// given a --pick has no packages or competitors yet: run a sync afterwards.
// --no-link skips adding `@tools.md` to CLAUDE.md (or a pointer to AGENTS.md).

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { needTitle, parseToolsMd, serializeToolsMd } from "./toolsmd.mjs";

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const list = (name) => (arg(name) ?? "").split(",").map((s) => s.trim()).filter(Boolean);

const draftPath = process.argv[2];
if (!draftPath || draftPath.startsWith("--")) {
  console.error("usage: apply.mjs <draft> [--lock a,b] [--prefer c] [--open d] [--root DIR] [--no-link]");
  process.exit(1);
}
const root = resolve(arg("root") ?? process.cwd());
const doc = parseToolsMd(readFileSync(draftPath, "utf8"));

const changes = [];
const NEED_KEY = /^[a-z0-9][a-z0-9-]{0,63}$/;
const pairs = (name) => list(name).map((p) => p.split("=").map((s) => s.trim()));
const die = (message) => {
  console.error(message);
  process.exit(1);
};

// Renames keep the need's place in the file, its marker and its heading.
let body = doc.body;
for (const [from, to] of pairs("rename")) {
  if (!doc.needs[from]) die(`No need "${from}" to rename. Needs: ${Object.keys(doc.needs).join(", ")}`);
  if (!to || !NEED_KEY.test(to)) die(`"${to}" is not a need key: lowercase kebab-case, like transactional-email.`);
  if (doc.needs[to]) die(`A need "${to}" already exists.`);
  doc.needs = Object.fromEntries(Object.entries(doc.needs).map(([k, v]) => [k === from ? to : k, v]));
  const marker = `<!-- need:${from} -->\n`;
  const at = body.indexOf(marker);
  if (at >= 0) {
    const start = at + marker.length;
    const end = body.indexOf("\n", start);
    const heading = body.slice(start, end < 0 ? undefined : end);
    const rest = heading.includes(": ") ? heading.slice(heading.indexOf(": ")) : heading.slice(heading.lastIndexOf(" ("));
    body = `${body.slice(0, at)}<!-- need:${to} -->\n## ${needTitle(to)}${rest}${end < 0 ? "" : body.slice(end)}`;
  }
  changes.push(`${from} -> ${to}`);
}
// A pick the user chose from an open need's candidates.
for (const [key, slug] of pairs("pick")) {
  const need = doc.needs[key];
  if (!need) die(`No need "${key}". Needs: ${Object.keys(doc.needs).join(", ")}`);
  if (!slug) die(`--pick needs key=slug, e.g. ${key}=resend-com`);
  doc.needs[key] = { pick: slug, strength: "preferred", packages: [], competitors: [] };
  changes.push(`${key}: pick ${slug}`);
}
for (const [strength, keys] of [["locked", list("lock")], ["preferred", list("prefer")], ["open", list("open")]]) {
  for (const key of keys) {
    const need = doc.needs[key];
    if (!need) die(`No need "${key}" in the draft. Needs: ${Object.keys(doc.needs).join(", ")}`);
    if (strength !== "open" && !need.pick) die(`"${key}" has no pick, so it can only be open.`);
    need.strength = strength;
    if (strength === "open") {
      delete need.pick;
      delete need.name;
    }
    changes.push(`${key}: ${strength}`);
  }
}
// Each body section starts with <!-- need:key --> and a heading ending in its strength: keep them in step.
for (const [key, need] of Object.entries(doc.needs)) {
  const marker = `<!-- need:${key} -->\n`;
  const at = body.indexOf(marker);
  if (at < 0) continue;
  const start = at + marker.length;
  const end = body.indexOf("\n", start);
  const heading = body.slice(start, end < 0 ? undefined : end).replace(/\((locked|preferred|open)\)$/, `(${need.strength})`);
  body = body.slice(0, start) + heading + (end < 0 ? "" : body.slice(end));
}
writeFileSync(join(root, "tools.md"), serializeToolsMd({ ...doc, body }));

let linked = "skipped";
if (!process.argv.includes("--no-link")) {
  const claude = join(root, "CLAUDE.md");
  const agents = join(root, "AGENTS.md");
  const has = (file, re) => existsSync(file) && re.test(readFileSync(file, "utf8"));
  if (has(claude, /^@tools\.md\s*$/m) || has(agents, /tools\.md/)) linked = "already";
  else if (existsSync(claude)) {
    const text = readFileSync(claude, "utf8");
    writeFileSync(claude, `${text}${text.endsWith("\n") ? "" : "\n"}\n@tools.md\n`);
    linked = "CLAUDE.md";
  } else if (existsSync(agents)) {
    const text = readFileSync(agents, "utf8");
    writeFileSync(agents, `${text}${text.endsWith("\n") ? "" : "\n"}\n## Tools\n\nThe tools this project uses, and how firmly, are in [tools.md](tools.md). Read it before adding or choosing a third-party tool.\n`);
    linked = "AGENTS.md";
  } else {
    writeFileSync(claude, "@tools.md\n");
    linked = "CLAUDE.md (created)";
  }
}
const needsSync = pairs("pick").length > 0;
console.log(JSON.stringify({ wrote: join(root, "tools.md"), changes, linked, ...(needsSync ? { next: "run a sync to fill the new picks' packages and competitors" } : {}) }, null, 2));
