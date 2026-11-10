import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseToolsMd, serializeToolsMd } from "../plugins/tooldb/scripts/toolsmd.mjs";

const script = (name: string) => fileURLToPath(new URL(`../plugins/tooldb/scripts/${name}`, import.meta.url));
const node = (args: string[], cwd: string) => spawnSync(process.execPath, args, { cwd, encoding: "utf8" });

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "tooldb-plugin-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("scan.mjs", () => {
  it("collects dependencies across workspaces, skipping node_modules and the repo's own packages", () => {
    const write = (path: string, data: unknown) => {
      mkdirSync(join(dir, path, ".."), { recursive: true });
      writeFileSync(join(dir, path), typeof data === "string" ? data : JSON.stringify(data));
    };
    write("package.json", { name: "root", devDependencies: { typescript: "5", "@acme/ui": "workspace:*" } });
    write("apps/web/package.json", { name: "@acme/web", dependencies: { resend: "^4", next: "16", "@acme/ui": "*" } });
    write("packages/ui/package.json", { name: "@acme/ui", dependencies: { react: "19" } });
    write("node_modules/postmark/package.json", { name: "postmark", dependencies: { axios: "1" } });
    write(".env.example", "RESEND_API_KEY=\nexport STRIPE_SECRET_KEY=sk\n# COMMENT=1\n");
    const out = JSON.parse(node([script("scan.mjs"), dir], dir).stdout);
    expect(out.packages).toEqual(["next", "react", "resend", "typescript"]);
    expect(out.envKeys).toEqual(["RESEND_API_KEY", "STRIPE_SECRET_KEY"]);
    expect(out.toolsMd).toBe(false);
  });
});

describe("apply.mjs", () => {
  const draft = () => {
    const path = join(dir, "draft.md");
    writeFileSync(
      path,
      serializeToolsMd({
        generated: "2026-11-09",
        needs: {
          "transactional-email": { pick: "resend", strength: "preferred", packages: ["resend"], competitors: ["postmark"] },
          "banking-cards-payments": { pick: "stripe", strength: "preferred", packages: ["stripe"], competitors: [] },
          analytics: { strength: "open", packages: [], competitors: [] },
        },
        body: "# Tools\n\n<!-- need:transactional-email -->\n## Transactional email: Resend (preferred)\n\n<!-- need:banking-cards-payments -->\n## Banking, cards & payments: Stripe (preferred)\n\n<!-- need:analytics -->\n## Analytics (open)\n",
      }),
    );
    return path;
  };

  it("locks the chosen needs, keeps the headings in step, and links tools.md from CLAUDE.md", () => {
    writeFileSync(join(dir, "CLAUDE.md"), "@AGENTS.md");
    const out = node([script("apply.mjs"), draft(), "--lock", "transactional-email,banking-cards-payments", "--root", dir], dir);
    expect(out.status).toBe(0);
    expect(JSON.parse(out.stdout).linked).toBe("CLAUDE.md");
    const doc = parseToolsMd(readFileSync(join(dir, "tools.md"), "utf8"));
    expect(doc.needs["transactional-email"]!.strength).toBe("locked");
    expect(doc.needs["banking-cards-payments"]!.strength).toBe("locked");
    expect(doc.body).toContain("## Transactional email: Resend (locked)");
    expect(doc.body).toContain("## Banking, cards & payments: Stripe (locked)");
    expect(doc.body).toContain("## Analytics (open)");
    expect(readFileSync(join(dir, "CLAUDE.md"), "utf8")).toBe("@AGENTS.md\n\n@tools.md\n");

    // Running it again does not link twice.
    node([script("apply.mjs"), draft(), "--root", dir], dir);
    expect(readFileSync(join(dir, "CLAUDE.md"), "utf8")).toBe("@AGENTS.md\n\n@tools.md\n");
  });

  it("renames needs (marker and heading too) and takes a chosen pick for an open need", () => {
    const out = node(
      [script("apply.mjs"), draft(), "--rename", "banking-cards-payments=payments,analytics=product-analytics", "--pick", "product-analytics=posthog-com", "--lock", "payments", "--root", dir, "--no-link"],
      dir,
    );
    expect(out.status).toBe(0);
    expect(JSON.parse(out.stdout).next).toMatch(/sync/);
    const doc = parseToolsMd(readFileSync(join(dir, "tools.md"), "utf8"));
    expect(Object.keys(doc.needs)).toEqual(["transactional-email", "payments", "product-analytics"]);
    expect(doc.needs.payments).toMatchObject({ pick: "stripe", strength: "locked" });
    expect(doc.needs["product-analytics"]).toEqual({ pick: "posthog-com", strength: "preferred", packages: [], competitors: [] });
    expect(doc.body).toContain("<!-- need:payments -->\n## Payments: Stripe (locked)");
    expect(doc.body).toContain("<!-- need:product-analytics -->\n## Product analytics (preferred)");
    expect(doc.body).not.toContain("need:banking-cards-payments");

    for (const bad of [["--rename", "nope=x"], ["--rename", "payments=Bad Key"], ["--rename", "analytics=transactional-email"], ["--pick", "nope=x"]]) {
      expect(node([script("apply.mjs"), draft(), ...bad, "--root", dir, "--no-link"], dir).status).toBe(1);
    }
  });

  it("points AGENTS.md at tools.md when there is no CLAUDE.md, and refuses to lock an open need", () => {
    writeFileSync(join(dir, "AGENTS.md"), "# Agents\n");
    expect(JSON.parse(node([script("apply.mjs"), draft(), "--root", dir], dir).stdout).linked).toBe("AGENTS.md");
    expect(readFileSync(join(dir, "AGENTS.md"), "utf8")).toContain("[tools.md](tools.md)");
    const bad = node([script("apply.mjs"), draft(), "--lock", "analytics", "--root", dir], dir);
    expect(bad.status).toBe(1);
    expect(bad.stderr).toMatch(/no pick/);
  });
});
