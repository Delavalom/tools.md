#!/usr/bin/env node
// Lists the npm packages a repo depends on, from its package.json files
// (node_modules, build output and VCS dirs are skipped). Workspace packages
// of the repo itself are left out. Prints JSON:
//   {root, packages, manifests, envKeys, toolsMd}
// Only package names leave the machine when generate.mjs sends them on.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const SKIP = new Set(["node_modules", ".git", ".next", ".nuxt", ".svelte-kit", ".turbo", ".vercel", ".output", "dist", "build", "out", "coverage", "vendor", ".venv"]);
const MAX_DEPTH = 4;

function findManifests(dir, depth = 0, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.isFile() && e.name === "package.json") out.push(join(dir, e.name));
    else if (e.isDirectory() && depth < MAX_DEPTH && !SKIP.has(e.name) && !e.name.startsWith(".")) findManifests(join(dir, e.name), depth + 1, out);
  }
  return out;
}

/** KEY names from .env.example-style files: hints for the description, never values. */
function envKeys(root) {
  const keys = new Set();
  for (const name of [".env.example", ".env.sample", ".env.template", ".env.local.example"]) {
    const file = join(root, name);
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const m = line.match(/^\s*(?:export\s+)?([A-Z][A-Z0-9_]{2,})\s*=/);
      if (m) keys.add(m[1]);
    }
  }
  return [...keys].sort();
}

export function scan(rootArg = process.cwd()) {
  const root = resolve(rootArg);
  const manifests = findManifests(root);
  const local = new Set();
  const deps = new Set();
  for (const file of manifests) {
    let pkg;
    try {
      pkg = JSON.parse(readFileSync(file, "utf8"));
    } catch {
      continue;
    }
    if (typeof pkg.name === "string") local.add(pkg.name);
    for (const field of ["dependencies", "devDependencies", "optionalDependencies"]) {
      for (const [name, version] of Object.entries(pkg[field] ?? {})) {
        if (typeof version === "string" && /^(workspace|link|file|portal):/.test(version)) continue;
        deps.add(name);
      }
    }
  }
  const packages = [...deps].filter((n) => !local.has(n)).sort();
  return {
    root,
    packages,
    manifests: manifests.map((f) => relative(root, f)),
    envKeys: envKeys(root),
    toolsMd: existsSync(join(root, "tools.md")),
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  console.log(JSON.stringify(scan(process.argv[2]), null, 2));
}
