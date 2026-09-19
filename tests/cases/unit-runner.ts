import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { CaseFile, Expectation, Step } from "./types.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");

function portalVersion(): string {
  const src = readFileSync(join(ROOT, "js/portal.js"), "utf8");
  const match = src.match(/const VERSION = "([^"]+)"/);
  assert.ok(match, "js/portal.js must declare const VERSION");
  return match[1];
}

function applyExpect(exp: Expectation, caseId: string): void {
  const tag = `${caseId}/${exp.assert}`;
  switch (exp.assert) {
    case "versionMatchesPackage": {
      const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { version: string };
      const stamped = readFileSync(join(ROOT, "VERSION"), "utf8").trim();
      const version = portalVersion();
      assert.equal(version, pkg.version, `${tag}: portal.js vs package.json`);
      assert.equal(version, stamped, `${tag}: portal.js vs VERSION`);
      return;
    }
    case "htmlHasVersionTag": {
      const html = readFileSync(join(ROOT, String(exp.file ?? "index.html")), "utf8");
      assert.match(html, /v__VERSION__/, tag);
      assert.match(html, /data-version/, tag);
      return;
    }
    case "uiUsesVersionLabel": {
      const src = readFileSync(join(ROOT, String(exp.file ?? "js/portal.js")), "utf8");
      assert.match(src, /__VERSION__/, tag);
      return;
    }
    default:
      throw new Error(`${tag}: unknown unit assert "${exp.assert}"`);
  }
}

function runStep(step: Step, c: CaseFile): void {
  const tag = `${c.id}/${step.op}`;
  switch (step.op) {
    case "readVersionSources":
    case "nop":
      return;
    case "expect":
      applyExpect(step as unknown as Expectation, c.id);
      return;
    default:
      throw new Error(`${tag}: unknown unit op "${step.op}"`);
  }
}

export function runUnitCase(c: CaseFile): void {
  for (const step of c.steps) runStep(step, c);
  for (const exp of c.expect) applyExpect(exp, c.id);
}
