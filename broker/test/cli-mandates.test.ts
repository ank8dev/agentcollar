import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { mandateRow } from "../src/cli/mandates.ts";
import type { SnapshotMandate } from "../src/snapshot.ts";

const NOW = Date.parse("2026-10-04T12:00:00.000Z");
const base: SnapshotMandate = {
  id: "a935774d",
  agent: "digest-agent",
  task: "Summarize",
  allowedActions: ["gmail.read", "gmail.draft"],
  status: "approved",
  revoked: false,
  createdAt: NOW - 60_000,
  expiresAt: NOW + 125_000,
  used: 3,
  limit: 10,
};

test("an active mandate: time left as m:ss and the actions left", () => {
  const row = mandateRow(base, NOW);
  assert.equal(row.state, "active");
  assert.equal(row.timeLeft, "2:05");
  assert.equal(row.limit, "3/10");
});

test("every end state has its own name, and no time left", () => {
  assert.equal(mandateRow({ ...base, status: "pending", expiresAt: 0 }, NOW).state, "waiting");
  assert.equal(mandateRow({ ...base, status: "denied" }, NOW).state, "denied");
  assert.equal(mandateRow({ ...base, revoked: true }, NOW).state, "revoked");
  assert.equal(mandateRow({ ...base, expiresAt: NOW - 1 }, NOW).state, "expired");
  assert.equal(mandateRow({ ...base, used: 10 }, NOW).state, "limit used up");
  assert.equal(mandateRow({ ...base, revoked: true }, NOW).timeLeft, "—");
});

test("control characters in agent names are removed", () => {
  assert.equal(mandateRow({ ...base, agent: "evil\u001b[2J" }, NOW).agent.includes("\u001b"), false);
});

function runMandates(snapshot: object | null) {
  const folder = mkdtempSync(join(tmpdir(), "mandates-"));
  if (snapshot !== null) writeFileSync(join(folder, "mandates.json"), JSON.stringify(snapshot));
  const bin = join(import.meta.dirname, "..", "bin", "agentcollar.mjs");
  return spawnSync(process.execPath, [bin, "mandates"], {
    encoding: "utf8",
    env: { ...process.env, AGENTCOLLAR_HOME: folder, NO_COLOR: "1" },
  });
}

test("agentcollar mandates lists the mandates of the running broker", () => {
  const result = runMandates({ pid: process.pid, writtenAt: Date.now(), mandates: [{ ...base, expiresAt: Date.now() + 60_000 }] });
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.includes("a935774d"));
  assert.ok(result.stdout.includes("gmail.read, gmail.draft"));
  assert.ok(result.stdout.includes("3/10"));
});

test("broker not running -> says so instead of showing a stale list", () => {
  const result = runMandates({ pid: 999_999, writtenAt: Date.now(), mandates: [base] });
  assert.equal(result.status, 0);
  assert.ok(result.stdout.includes("The broker is not running"));
  assert.equal(result.stdout.includes("a935774d"), false);
});

test("never started -> a hint", () => {
  assert.ok(runMandates(null).stdout.includes("The broker has not been started yet"));
});
