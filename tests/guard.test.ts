import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { check } from "../plugins/tooldb/scripts/guard.mjs";

const TOOLS_MD = `---
tooldb: 1
needs:
  transactional-email:
    pick: resend
    strength: locked
    packages: [resend]
    competitors: ["@sendgrid/mail", postmark]
  analytics:
    pick: posthog
    strength: preferred
    packages: [posthog-js]
    competitors: [mixpanel-browser]
---
`;

const bash = (command: string) => ({ tool_name: "Bash", tool_input: { command } });

describe("guard check", () => {
  it("blocks installing a locked need's competitor", () => {
    const reason = check(bash("pnpm add @sendgrid/mail"), TOOLS_MD);
    expect(reason).toBe(
      'tools.md locks "transactional-email" to resend (resend); @sendgrid/mail is a listed competitor. Use resend instead. To switch, ask the user to change tools.md first (set the need to preferred, or pick another tool).',
    );
  });

  it("allows the pick, preferred needs' competitors and unknown packages", () => {
    expect(check(bash("pnpm add resend"), TOOLS_MD)).toBeNull();
    expect(check(bash("npm i mixpanel-browser"), TOOLS_MD)).toBeNull();
    expect(check(bash("pnpm add some-new-thing"), TOOLS_MD)).toBeNull();
    expect(check(bash("pnpm test"), TOOLS_MD)).toBeNull();
  });

  it("blocks an edit that adds an import of a competitor, not one that keeps an old import", () => {
    const edit = (old_string: string, new_string: string, file_path = "src/mail.ts") => ({ tool_name: "Edit", tool_input: { file_path, old_string, new_string } });
    expect(check(edit("", 'import sg from "@sendgrid/mail";'), TOOLS_MD)).toMatch(/@sendgrid\/mail is a listed competitor/);
    expect(check(edit('import sg from "@sendgrid/mail";\nconst a = 1;', 'import sg from "@sendgrid/mail";\nconst a = 2;'), TOOLS_MD)).toBeNull();
    expect(check(edit("", 'import sg from "@sendgrid/mail";', "notes.md"), TOOLS_MD)).toBeNull();
    const multi = { tool_name: "MultiEdit", tool_input: { file_path: "a.ts", edits: [{ old_string: "x", new_string: "y" }, { old_string: "", new_string: 'const p = require("postmark")' }] } };
    expect(check(multi, TOOLS_MD)).toMatch(/postmark is a listed competitor/);
  });

  it("compares a Write against the file it replaces", () => {
    const write = { tool_name: "Write", tool_input: { file_path: "/repo/src/mail.ts", content: 'import { Client } from "postmark";\n' } };
    expect(check(write, TOOLS_MD, () => "")).toMatch(/postmark/);
    expect(check(write, TOOLS_MD, () => 'import { Client } from "postmark";\nold();\n')).toBeNull();
  });

  it("does nothing without locked needs", () => {
    expect(check(bash("pnpm add postmark"), TOOLS_MD.replace("strength: locked", "strength: preferred"))).toBeNull();
  });
});

describe("guard hook process", () => {
  const script = fileURLToPath(new URL("../plugins/tooldb/scripts/guard.mjs", import.meta.url));
  const dir = mkdtempSync(join(tmpdir(), "tooldb-guard-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const run = (input: unknown, toolsMd?: string) => {
    if (toolsMd === undefined) rmSync(join(dir, "tools.md"), { force: true });
    else writeFileSync(join(dir, "tools.md"), toolsMd);
    return spawnSync(process.execPath, [script], { input: typeof input === "string" ? input : JSON.stringify(input), env: { ...process.env, CLAUDE_PROJECT_DIR: dir }, encoding: "utf8" });
  };

  it("exits 2 with the reason on stderr when it blocks", () => {
    const out = run(bash("yarn add postmark"), TOOLS_MD);
    expect(out.status).toBe(2);
    expect(out.stderr).toMatch(/postmark is a listed competitor/);
  });

  it("exits 0 when allowed, with no tools.md, on a broken tools.md, and on garbage input", () => {
    expect(run(bash("pnpm add resend"), TOOLS_MD).status).toBe(0);
    expect(run(bash("pnpm add postmark")).status).toBe(0);
    expect(run(bash("pnpm add postmark"), "---\ntooldb: 9\n---\n").status).toBe(0);
    expect(run("not json", TOOLS_MD).status).toBe(0);
  });
});
