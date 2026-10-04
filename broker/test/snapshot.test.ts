import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { check } from "../src/check.ts";
import { approve, onMandatesChanged, requestMandate, revoke } from "../src/mandate.ts";
import { readMandatesSnapshot, writeMandatesSnapshot } from "../src/snapshot.ts";

test("every change of a mandate is announced: request, approve, a used action, revoke", () => {
  let changes = 0;
  onMandatesChanged(() => changes++);
  const mandate = requestMandate("agent", "task", ["gmail.read"], 60, 5);
  approve(mandate.id);
  check(mandate.token, "gmail.read"); // used: 0 -> 1
  revoke(mandate.id);
  onMandatesChanged(() => {});
  assert.equal(changes, 4);
});

test("the snapshot has every mandate but no token, and only the owner can read it", () => {
  const file = join(mkdtempSync(join(tmpdir(), "snapshot-")), "mandates.json");
  const mandate = requestMandate("snap-agent", "task", ["gmail.read"], 60, 5);
  writeMandatesSnapshot(file);

  const text = readFileSync(file, "utf8");
  assert.equal(text.includes(mandate.token), false, "the token must never be in the snapshot");
  assert.equal(statSync(file).mode & 0o777, 0o600);
  const snapshot = readMandatesSnapshot(file);
  assert.equal(snapshot?.pid, process.pid);
  const row = snapshot?.mandates.find((m) => m.id === mandate.id);
  assert.equal(row?.agent, "snap-agent");
  assert.equal(Object.hasOwn(row ?? {}, "token"), false);
});

test("the snapshot is written atomically: no temp file is left behind", () => {
  const folder = mkdtempSync(join(tmpdir(), "snapshot-"));
  writeMandatesSnapshot(join(folder, "mandates.json"));
  assert.deepEqual(readdirSync(folder), ["mandates.json"]);
});

test("no snapshot yet -> null", () => {
  const file = join(mkdtempSync(join(tmpdir(), "snapshot-")), "mandates.json");
  assert.equal(existsSync(file), false);
  assert.equal(readMandatesSnapshot(file), null);
});
