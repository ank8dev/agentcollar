import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { test } from "node:test";
import type { AuditEntry } from "../src/audit-log.ts";
import { formatEntry } from "../src/cli/format.ts";
import { formatMandates } from "../src/cli/mandates.ts";
import { introTimeline, introSize } from "../src/cli/intro.ts";
import type { SnapshotMandate } from "../src/snapshot.ts";

const strip = (s: string) => s.replace(/\u001b\[[0-9;]*m/g, "");
const widest = (text: string) => Math.max(...strip(text).split("\n").map((l) => [...l].length));

const denied: AuditEntry = {
  time: "2026-10-04T13:42:07.000Z",
  agent: "claude-code",
  action: "gmail.send",
  allowed: false,
  reason: 'action "gmail.send" is not allowed by this mandate, ask the human for a new one',
  code: "action_not_allowed",
};

for (const width of [120, 80, 60, 44]) {
  test(`an audit line fits a ${width}-column window and keeps the key facts`, () => {
    const text = formatEntry(denied, { showDate: false, width });
    assert.ok(widest(text) <= width, `${widest(text)} > ${width}:\n${text}`);
    assert.ok(text.includes("gmail.send"));
    assert.ok(text.includes("DENIED"));
    assert.ok(/✓.?✓.?✓.?✓.?✗.?·/.test(strip(text)), "the 6 check marks are still there");
  });
}

const NOW = Date.parse("2026-10-04T12:00:00.000Z");
const mandate: SnapshotMandate = {
  id: "a935774d",
  agent: "claude-code",
  task: "Summarize",
  allowedActions: ["gmail.read", "gmail.draft"],
  status: "approved",
  revoked: false,
  createdAt: NOW - 1000,
  expiresAt: NOW + 125_000,
  used: 3,
  limit: 10,
};

for (const width of [120, 60, 40]) {
  test(`the mandates list fits a ${width}-column window`, () => {
    const text = formatMandates([mandate, { ...mandate, id: "b1b2c3d4", status: "pending", expiresAt: 0 }], NOW, width);
    assert.ok(widest(text) <= width, `${widest(text)} > ${width}:\n${text}`);
    assert.ok(text.includes("a935774d") && text.includes("active") && text.includes("3/10"));
  });
}

test("the intro picks a size that fits the window, or none", () => {
  assert.equal(introSize(100, 40), "big");
  assert.equal(introSize(50, 14), "small");
  assert.equal(introSize(30, 40), "none");
  assert.equal(introSize(100, 8), "none");
});

for (const [size, width] of [
  ["big", 60],
  ["small", 44],
] as const) {
  test(`every ${size} intro frame fits ${width} columns`, () => {
    for (const frame of introTimeline(size, width)) {
      assert.ok(widest(frame.lines.join("\n")) <= width, frame.lines.join("\n"));
    }
  });
}

test("help fits a 60-column window", () => {
  const bin = join(import.meta.dirname, "..", "bin", "agentcollar.mjs");
  const out = spawnSync(process.execPath, [bin, "--help"], { encoding: "utf8", env: { ...process.env, COLUMNS: "60", NO_COLOR: "1" } }).stdout;
  assert.ok(widest(out) <= 60, out);
  assert.ok(out.includes("agcl watch"));
});
