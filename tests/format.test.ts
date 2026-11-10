import { describe, expect, it } from "vitest";
import {
  importedPackages,
  isSourceFile,
  lockedCompetitors,
  packageBase,
  packagesAddedByCommand,
  parseToolsMd,
  serializeToolsMd,
  ToolsMdError,
} from "../plugins/tooldb/scripts/toolsmd.mjs";

const SAMPLE = `---
tooldb: 1   # format version
generated: 2026-11-09
budget: low
project: "A newsletter SaaS. Uses \\"quotes\\" # not a comment"
needs:
  transactional-email:
    pick: resend
    strength: locked
    packages: [resend]
    competitors: ["@sendgrid/mail", postmark, mailgun.js]
  authentication:
    pick: clerk
    strength: preferred
    packages: ["@clerk/nextjs"]
  product-analytics:
    strength: open
---
# Tools for this project
`;

describe("parseToolsMd", () => {
  it("reads the sample", () => {
    const doc = parseToolsMd(SAMPLE);
    expect(doc.generated).toBe("2026-11-09");
    expect(doc.budget).toBe("low");
    expect(doc.project).toBe('A newsletter SaaS. Uses "quotes" # not a comment');
    expect(doc.needs["transactional-email"]).toEqual({ pick: "resend", strength: "locked", packages: ["resend"], competitors: ["@sendgrid/mail", "postmark", "mailgun.js"] });
    expect(doc.needs.authentication).toEqual({ pick: "clerk", strength: "preferred", packages: ["@clerk/nextjs"], competitors: [] });
    expect(doc.needs["product-analytics"]).toEqual({ strength: "open", packages: [], competitors: [] });
    expect(doc.body).toBe("# Tools for this project\n");
  });

  it("accepts CRLF and a BOM", () => {
    expect(parseToolsMd(`\uFEFF${SAMPLE.replace(/\n/g, "\r\n")}`).needs.authentication?.pick).toBe("clerk");
  });

  it.each([
    ["no frontmatter", "# hi"],
    ["unclosed", "---\ntooldb: 1\n"],
    ["missing version", "---\nneeds:\n---\n"],
    ["future version", "---\ntooldb: 2\n---\n"],
    ["bad strength", "---\ntooldb: 1\nneeds:\n  x:\n    pick: a\n    strength: maybe\n---\n"],
    ["locked without pick", "---\ntooldb: 1\nneeds:\n  x:\n    strength: locked\n---\n"],
    ["bad key", "---\ntooldb: 1\nneeds:\n  Email Stuff:\n    strength: open\n---\n"],
    ["tabs", "---\ntooldb: 1\nneeds:\n\tx:\n---\n"],
    ["bad indent", "---\ntooldb: 1\nneeds:\n  x:\n      strength: open\n    pick: a\n---\n"],
    ["duplicate", "---\ntooldb: 1\ntooldb: 1\n---\n"],
    ["list not closed", "---\ntooldb: 1\nneeds:\n  x:\n    strength: open\n    packages: [a, b\n---\n"],
    ["bad budget", "---\ntooldb: 1\nbudget: cheap\n---\n"],
  ])("rejects %s", (_name, text) => {
    expect(() => parseToolsMd(text)).toThrow(ToolsMdError);
  });

  it("round-trips the sample through serialize", () => {
    const doc = parseToolsMd(SAMPLE);
    expect(parseToolsMd(serializeToolsMd(doc))).toEqual(doc);
  });

  it("quotes scoped packages and reserved words", () => {
    const text = serializeToolsMd({ needs: { x: { pick: "true", strength: "locked", packages: ["@a/b"], competitors: ["null", "c"] } }, body: "" });
    expect(text).toContain('pick: "true"');
    expect(text).toContain('packages: ["@a/b"]');
    expect(text).toContain('competitors: ["null", c]');
  });
});

describe("lockedCompetitors", () => {
  it("only locked needs block, and never their own packages", () => {
    const doc = parseToolsMd(SAMPLE);
    doc.needs["transactional-email"]!.competitors.push("resend");
    const blocked = lockedCompetitors(doc);
    expect([...blocked.keys()].sort()).toEqual(["@sendgrid/mail", "mailgun.js", "postmark"]);
    expect(blocked.get("postmark")).toEqual({ need: "transactional-email", pick: "resend", packages: ["resend"] });
  });
});

describe("packageBase", () => {
  it.each([
    ["resend", "resend"],
    ["resend@^4.0.0", "resend"],
    ["@sendgrid/mail@8", "@sendgrid/mail"],
    ["@clerk/nextjs/server", "@clerk/nextjs"],
    ["lodash/fp", "lodash"],
    ["'Stripe'", "stripe"],
    ["./local", null],
    ["../x", null],
    ["file:../pkg", null],
    ["github:user/repo", null],
    ["https://x.dev/a.tgz", null],
    ["@scope", null],
  ])("%s -> %s", (spec, expected) => {
    expect(packageBase(spec)).toBe(expected);
  });
});

describe("packagesAddedByCommand", () => {
  it.each([
    ["pnpm add @sendgrid/mail", ["@sendgrid/mail"]],
    ["pnpm add -D postmark@4 resend", ["postmark", "resend"]],
    ["npm install --save mailgun.js", ["mailgun.js"]],
    ["npm i postmark", ["postmark"]],
    ["yarn add postmark", ["postmark"]],
    ["yarn workspace web add postmark", ["postmark"]],
    ["bun add postmark", ["postmark"]],
    ["pnpm --filter web add postmark", ["postmark"]],
    ["pnpm add postmark --filter web", ["postmark"]],
    ["cd app && pnpm add postmark && pnpm test", ["postmark"]],
    ["FOO=1 pnpm add postmark", ["postmark"]],
    ["pnpm add 'postmark' 2>&1 | tail", ["postmark"]],
    ["npx postmark", []],
    ["pnpm dlx postmark", []],
    ["npm run add postmark", []],
    ["pnpm install", []],
    ["echo pnpm", []],
    ["pnpm add ./local-pkg", []],
  ])("%s", (command, expected) => {
    expect(packagesAddedByCommand(command)).toEqual(expected);
  });
});

describe("importedPackages", () => {
  it("finds imports, requires and dynamic imports", () => {
    const source = `
import sg from "@sendgrid/mail";
import { x } from '@clerk/nextjs/server';
import "dotenv/config";
export { y } from "postmark";
const m = require("mailgun.js");
const lazy = await import("resend");
import fs from "node:fs";
import local from "./local";
`;
    expect([...importedPackages(source)].sort()).toEqual(["@clerk/nextjs", "@sendgrid/mail", "dotenv", "mailgun.js", "postmark", "resend"]);
  });

  it("knows source files", () => {
    expect(isSourceFile("src/app/page.tsx")).toBe(true);
    expect(isSourceFile("lib/x.mjs")).toBe(true);
    expect(isSourceFile("README.md")).toBe(false);
  });
});
