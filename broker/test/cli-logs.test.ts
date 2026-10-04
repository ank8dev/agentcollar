import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { AuditEntry } from "../src/audit-log.ts";
import { checkMarks, formatEntry } from "../src/cli/format.ts";
import { filterEntries, parseLogsArgs } from "../src/cli/logs.ts";

const entry = (over: Partial<AuditEntry>): AuditEntry => ({
  time: "2026-10-04T13:42:07.000Z",
  agent: "digest-agent",
  action: "gmail.read",
  allowed: true,
  reason: "ok",
  code: "ok",
  ...over,
});

test("check marks: all passed, failed at check 3, human decision, old line without code", () => {
  assert.equal(checkMarks(entry({})), "✓ ✓ ✓ ✓ ✓ ✓");
  assert.equal(checkMarks(entry({ allowed: false, code: "expired" })), "✓ ✓ ✗ · · ·");
  assert.equal(checkMarks(entry({ allowed: false, code: "unknown_token" })), "✗ · · · · ·");
  assert.equal(checkMarks(entry({ action: "mandate.approve", code: null })), "");
  assert.equal(checkMarks(entry({ allowed: false, code: null })), "");
});

test("terminal control characters from the log never reach the screen", () => {
  const line = formatEntry(entry({ agent: "evil\u001b[2J", reason: "x\u001b]0;pwned\u0007" }), { showDate: false });
  assert.equal(line.includes("\u001b"), false);
  assert.equal(line.includes("\u0007"), false);
});

test("filters: --agent, --denied, --today (local date)", () => {
  const now = new Date("2026-10-04T18:00:00");
  const entries = [
    entry({ agent: "a" }),
    entry({ agent: "b", allowed: false, code: "expired" }),
    entry({ agent: "a", time: "2026-09-30T10:00:00.000Z" }),
  ];
  assert.equal(filterEntries(entries, { agent: "a", denied: false, today: false }, now).length, 2);
  assert.deepEqual(filterEntries(entries, { agent: null, denied: true, today: false }, now).map((e) => e.agent), ["b"]);
  assert.equal(filterEntries(entries, { agent: null, denied: false, today: true }, now).length, 2);
  assert.equal(filterEntries(entries, { agent: "a", denied: false, today: true }, now).length, 1);
});

test("parseLogsArgs: flags, and clear errors for unknown flags or a missing value", () => {
  assert.deepEqual(parseLogsArgs(["--agent", "digest-agent", "--denied"]), { agent: "digest-agent", denied: true, today: false });
  assert.throws(() => parseLogsArgs(["--agent"]), /--agent <имя>/);
  assert.throws(() => parseLogsArgs(["--everything"]), /Неизвестный флаг: --everything/);
});

test("agentcollar logs --denied prints only denied lines from the log file", () => {
  const file = join(mkdtempSync(join(tmpdir(), "logs-")), "audit.log");
  writeFileSync(
    file,
    [
      '2026-10-04T13:42:05.000Z | "digest-agent" | "gmail.read" | ALLOWED | "ok" | ok',
      '2026-10-04T13:42:07.000Z | "digest-agent" | "gmail.send" | DENIED | "action \\"gmail.send\\" is not allowed" | action_not_allowed',
      "not a log line",
    ].join("\n") + "\n",
  );
  const bin = join(import.meta.dirname, "..", "bin", "agentcollar.mjs");
  const result = spawnSync(process.execPath, [bin, "logs", "--denied"], {
    encoding: "utf8",
    env: { ...process.env, BROKER_AUDIT_LOG: file, NO_COLOR: "1" },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.includes("gmail.send"));
  assert.ok(result.stdout.includes("✓ ✓ ✓ ✓ ✗ ·"));
  assert.equal(result.stdout.includes("gmail.read"), false);
});
