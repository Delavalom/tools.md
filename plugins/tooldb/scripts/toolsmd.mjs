// tools.md: read, write and enforce. Shared by the ToolDB server
// (src/lib/toolsmd) and the Claude Code plugin's scripts, so it has no
// dependencies and runs on plain Node. Types: toolsmd.d.mts.
//
// The frontmatter is a strict YAML subset: `key: value` pairs, nested maps by
// indentation (spaces only), bare or double-quoted (JSON-escaped) scalars,
// flow arrays of scalars, and `#` comments. Any valid file is valid YAML.

export const FORMAT_VERSION = 1;
export const STRENGTHS = ["locked", "preferred", "open"];
export const BUDGETS = ["free", "low", "flexible"];
export const MAX_COMPETITORS = 20;
const NEED_KEY = /^[a-z0-9][a-z0-9-]{0,63}$/;
const MAP_KEY = /^[A-Za-z0-9_-]+$/;

export class ToolsMdError extends Error {
  constructor(message) {
    super(message);
    this.name = "ToolsMdError";
  }
}

// ---------------------------------------------------------------------------
// Scalars

/** Reads one scalar starting at `i`: a JSON double-quoted string, or bare text up to a stop character. */
function readScalar(text, i, stops) {
  if (text[i] === '"') {
    let j = i + 1;
    while (j < text.length && text[j] !== '"') j += text[j] === "\\" ? 2 : 1;
    if (j >= text.length) throw new ToolsMdError(`unterminated string: ${text.slice(i)}`);
    try {
      return { value: JSON.parse(text.slice(i, j + 1)), end: j + 1 };
    } catch {
      throw new ToolsMdError(`bad string: ${text.slice(i, j + 1)}`);
    }
  }
  let j = i;
  while (j < text.length && !stops.includes(text[j])) j++;
  return { value: text.slice(i, j).trim(), end: j };
}

function parseValue(raw) {
  const text = raw.trim();
  if (!text.startsWith("[")) {
    const { value, end } = readScalar(text, 0, "");
    if (text.slice(end).trim()) throw new ToolsMdError(`unexpected text after value: ${text}`);
    return value;
  }
  if (!text.endsWith("]")) throw new ToolsMdError(`unterminated list: ${text}`);
  const items = [];
  const inner = text.slice(1, -1);
  let i = 0;
  while (i < inner.length) {
    while (inner[i] === " ") i++;
    if (i >= inner.length) break;
    const { value, end } = readScalar(inner, i, ",");
    if (value !== "") items.push(value);
    i = end;
    while (inner[i] === " ") i++;
    if (i < inner.length && inner[i] !== ",") throw new ToolsMdError(`expected "," in list: ${text}`);
    i++;
  }
  return items;
}

/** Strips a `#` comment that starts the line or follows whitespace, outside quotes. */
function stripComment(line) {
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === "\\") i++;
      else if (c === '"') quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === "#" && (i === 0 || line[i - 1] === " ")) return line.slice(0, i);
  }
  return line;
}

const PLAIN = /^[A-Za-z0-9][A-Za-z0-9._/~-]*$/;
const RESERVED = /^(true|false|yes|no|on|off|null|~)$/i;

function scalar(value) {
  return PLAIN.test(value) && !RESERVED.test(value) ? value : JSON.stringify(value);
}

// ---------------------------------------------------------------------------
// Frontmatter

/** Splits a tools.md into its frontmatter text and body. */
export function splitToolsMd(text) {
  const src = text.replace(/^﻿/, "").replace(/\r\n/g, "\n");
  if (!src.startsWith("---\n")) throw new ToolsMdError("tools.md must start with a --- frontmatter block");
  const close = src.indexOf("\n---", 3);
  if (close < 0) throw new ToolsMdError("frontmatter is not closed with ---");
  const after = src.slice(close + 4);
  if (after && !after.startsWith("\n")) throw new ToolsMdError("frontmatter is not closed with ---");
  return { frontmatter: src.slice(4, close + 1), body: after.replace(/^\n/, "") };
}

/** The frontmatter as nested plain objects. */
export function parseFrontmatter(text) {
  const root = {};
  const stack = [{ indent: 0, map: root }];
  let pending = null; // a `key:` with no value, waiting for its children
  for (const [n, rawLine] of text.split("\n").entries()) {
    const line = stripComment(rawLine).replace(/\s+$/, "");
    if (!line.trim()) continue;
    if (/^\t| \t/.test(line.match(/^\s*/)[0])) throw new ToolsMdError(`line ${n + 1}: indent with spaces, not tabs`);
    const indent = line.length - line.trimStart().length;
    const colon = line.indexOf(":");
    if (colon < 0) throw new ToolsMdError(`line ${n + 1}: expected "key: value"`);
    const key = line.slice(indent, colon).trim();
    if (!MAP_KEY.test(key)) throw new ToolsMdError(`line ${n + 1}: bad key "${key}"`);
    const rest = line.slice(colon + 1);
    if (rest && !rest.startsWith(" ")) throw new ToolsMdError(`line ${n + 1}: expected a space after ":"`);

    if (pending) {
      if (indent > pending.indent) stack.push({ indent, map: pending.map });
      pending = null;
    }
    while (stack.length > 1 && indent < stack[stack.length - 1].indent) stack.pop();
    const top = stack[stack.length - 1];
    if (indent !== top.indent) throw new ToolsMdError(`line ${n + 1}: inconsistent indentation`);
    if (Object.hasOwn(top.map, key)) throw new ToolsMdError(`line ${n + 1}: duplicate key "${key}"`);

    if (rest.trim()) top.map[key] = parseValue(rest);
    else {
      const child = {};
      top.map[key] = child;
      pending = { indent, map: child };
    }
  }
  return root;
}

function asList(value, where) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new ToolsMdError(`${where} must be a list like [a, b]`);
  return value;
}

/**
 * Parses a tools.md. Throws ToolsMdError when the file is not a tools.md this
 * version understands.
 * @returns {import("./toolsmd.d.mts").ToolsMd}
 */
export function parseToolsMd(text) {
  const { frontmatter, body } = splitToolsMd(text);
  const fm = parseFrontmatter(frontmatter);
  if (String(fm.tooldb) !== String(FORMAT_VERSION)) {
    throw new ToolsMdError(fm.tooldb === undefined ? "missing `tooldb:` version" : `unsupported tools.md version ${fm.tooldb}`);
  }
  const budget = fm.budget === undefined ? undefined : String(fm.budget);
  if (budget !== undefined && !BUDGETS.includes(budget)) throw new ToolsMdError(`budget must be one of ${BUDGETS.join(", ")}`);
  const rawNeeds = fm.needs ?? {};
  if (typeof rawNeeds !== "object" || Array.isArray(rawNeeds)) throw new ToolsMdError("needs must be a map");
  const needs = {};
  for (const [key, raw] of Object.entries(rawNeeds)) {
    if (!NEED_KEY.test(key)) throw new ToolsMdError(`need "${key}": keys are lowercase kebab-case`);
    if (typeof raw !== "object" || Array.isArray(raw)) throw new ToolsMdError(`need "${key}" must be a map`);
    const strength = String(raw.strength ?? "preferred");
    if (!STRENGTHS.includes(strength)) throw new ToolsMdError(`need "${key}": strength must be one of ${STRENGTHS.join(", ")}`);
    const pick = raw.pick === undefined || raw.pick === "" ? undefined : String(raw.pick);
    if (strength !== "open" && !pick) throw new ToolsMdError(`need "${key}": a ${strength} need has a pick`);
    const name = pick && raw.name !== undefined && raw.name !== "" ? String(raw.name) : undefined;
    needs[key] = {
      ...(pick ? { pick } : {}),
      ...(name ? { name } : {}),
      strength,
      packages: asList(raw.packages, `need "${key}" packages`).map(String),
      competitors: asList(raw.competitors, `need "${key}" competitors`).map(String),
    };
  }
  return {
    version: FORMAT_VERSION,
    ...(fm.generated !== undefined ? { generated: String(fm.generated) } : {}),
    ...(budget ? { budget } : {}),
    ...(fm.project !== undefined ? { project: String(fm.project) } : {}),
    needs,
    body,
  };
}

/** Writes a tools.md. parseToolsMd(serializeToolsMd(doc)) gives back doc. */
export function serializeToolsMd(doc) {
  const lines = [`tooldb: ${FORMAT_VERSION}`];
  if (doc.generated !== undefined) lines.push(`generated: ${scalar(doc.generated)}`);
  if (doc.budget !== undefined) lines.push(`budget: ${scalar(doc.budget)}`);
  if (doc.project !== undefined) lines.push(`project: ${JSON.stringify(doc.project)}`);
  const entries = Object.entries(doc.needs ?? {});
  lines.push("needs:");
  for (const [key, need] of entries) {
    lines.push(`  ${key}:`);
    if (need.pick) lines.push(`    pick: ${scalar(need.pick)}`);
    if (need.pick && need.name) lines.push(`    name: ${scalar(need.name)}`);
    lines.push(`    strength: ${need.strength}`);
    if (need.packages?.length) lines.push(`    packages: [${need.packages.map(scalar).join(", ")}]`);
    if (need.competitors?.length) lines.push(`    competitors: [${need.competitors.map(scalar).join(", ")}]`);
  }
  return `---\n${lines.join("\n")}\n---\n${doc.body ?? ""}`;
}

// ---------------------------------------------------------------------------
// Enforcement helpers (used by the guard hook)

/** Competitor package -> the locked need that rules it out. */
export function lockedCompetitors(doc) {
  const blocked = new Map();
  for (const [need, entry] of Object.entries(doc.needs)) {
    if (entry.strength !== "locked") continue;
    const own = new Set(entry.packages);
    for (const name of entry.competitors) if (!own.has(name) && !blocked.has(name)) blocked.set(name, { need, pick: entry.pick, ...(entry.name ? { name: entry.name } : {}), packages: entry.packages });
  }
  return blocked;
}

/** "@scope/name@^1", "@scope/name/sub", "name@latest" -> the package name; null for paths, URLs and builtins. */
export function packageBase(spec) {
  const s = spec.trim().replace(/^["']|["']$/g, "");
  if (!s || /^[./~]|^[a-z+]+:|:\/\//i.test(s)) return null;
  if (s.startsWith("@")) {
    const m = s.match(/^(@[a-z0-9][\w.-]*\/[a-z0-9][\w.-]*)/i);
    return m ? m[1].toLowerCase() : null;
  }
  const m = s.match(/^([a-z0-9][\w.-]*)/i);
  return m ? m[1].toLowerCase() : null;
}

const MANAGERS = new Set(["npm", "pnpm", "yarn", "bun"]);
const ADD_COMMANDS = {
  npm: new Set(["install", "i", "add", "in", "isntall"]),
  pnpm: new Set(["add", "install", "i"]),
  yarn: new Set(["add"]),
  bun: new Set(["add", "a", "install", "i"]),
};
/** Flags that take a value, before or after the subcommand. */
const VALUE_FLAGS = new Set(["--filter", "-F", "--dir", "-C", "--prefix", "--cwd", "--workspace", "-w", "--registry", "--tag"]);

function tokenize(segment) {
  const tokens = [];
  const re = /"((?:[^"\\]|\\.)*)"|'([^']*)'|(\S+)/g;
  let m;
  while ((m = re.exec(segment))) tokens.push(m[1] ?? m[2] ?? m[3]);
  return tokens;
}

/** Package names a shell command adds with npm, pnpm, yarn or bun. */
export function packagesAddedByCommand(command) {
  const added = [];
  for (const segment of command.split(/&&|\|\||[;|\n]|\$\(|`/)) {
    const tokens = tokenize(segment);
    let i = tokens.findIndex((t) => MANAGERS.has(t.split("/").pop()));
    if (i < 0) continue;
    const manager = tokens[i].split("/").pop();
    // Up to the subcommand: skip flags (and their values) and `yarn workspace <name>`.
    for (i++; i < tokens.length; i++) {
      const t = tokens[i];
      if (VALUE_FLAGS.has(t) || (manager === "yarn" && t === "workspace")) i++;
      else if (!t.startsWith("-")) break;
    }
    if (!ADD_COMMANDS[manager].has(tokens[i])) continue;
    for (i++; i < tokens.length; i++) {
      const t = tokens[i];
      if (/^\d?>|^</.test(t)) break;
      if (VALUE_FLAGS.has(t)) i++;
      else if (!t.startsWith("-")) {
        const base = packageBase(t);
        if (base) added.push(base);
      }
    }
  }
  return added;
}

const SOURCE_FILE = /\.(?:[cm]?[jt]sx?|vue|svelte|astro)$/i;
const IMPORT_PATTERNS = [
  /\bfrom\s*["']([^"'\n]+)["']/g,
  /\bimport\s*["']([^"'\n]+)["']/g,
  /\bimport\s*\(\s*["']([^"'\n]+)["']\s*\)/g,
  /\brequire\s*\(\s*["']([^"'\n]+)["']\s*\)/g,
];

export function isSourceFile(path) {
  return SOURCE_FILE.test(path);
}

/** Package names a JS/TS source text imports or requires. */
export function importedPackages(source) {
  const found = new Set();
  for (const pattern of IMPORT_PATTERNS) {
    for (const m of source.matchAll(pattern)) {
      if (m[1].startsWith("node:")) continue;
      const base = packageBase(m[1]);
      if (base) found.add(base);
    }
  }
  return found;
}

/** Why a locked need forbids this package. */
export function blockMessage(name, rule) {
  const use = rule.packages.length ? ` (${rule.packages.join(", ")})` : "";
  const tool = rule.name ?? rule.pick;
  return (
    `tools.md locks "${rule.need}" to ${tool}${use}; ${name} is a listed competitor. ` +
    `Use ${tool} instead. To switch, ask the user to change tools.md first (set the need to preferred, or pick another tool).`
  );
}

// Acronyms keep their capitals in headings: llm-gateway -> "LLM gateway".
const ACRONYMS = new Set(["ai", "api", "apis", "cdn", "ci", "cms", "crm", "dns", "etl", "llm", "llms", "mcp", "ml", "ocr", "pdf", "rag", "s3", "sdk", "seo", "sms", "sql", "sso", "tts", "ui", "ux"]);

/** A need key (or name) as a heading: transactional-email -> "Transactional email". */
export function needTitle(keyOrName) {
  const words = keyOrName.replace(/-/g, " ").trim().split(/\s+/).map((w) => (ACRONYMS.has(w) ? w.toUpperCase() : w)).join(" ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}
