import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { appendFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { createTail } from "../src/cli/tail.ts";

const line = (action: string, reason = "ok") =>
  `2026-10-04T13:42:05.000Z | "digest-agent" | "${action}" | ALLOWED | "${reason}" | ok\n`;

function tempLog(): string {
  return join(mkdtempSync(join(tmpdir(), "watch-")), "audit.log");
}

test("tail reads only what was appended since the last call", () => {
  const file = tempLog();
  writeFileSync(file, line("gmail.read"));
  const tail = createTail(file);
  assert.deepEqual(tail.readNew().map((e) => e.action), ["gmail.read"]);
  assert.deepEqual(tail.readNew(), []);
  appendFileSync(file, line("gmail.draft"));
  assert.deepEqual(tail.readNew().map((e) => e.action), ["gmail.draft"]);
});

test("a half-written line waits until its end arrives", () => {
  const file = tempLog();
  writeFileSync(file, "");
  const tail = createTail(file);
  const full = line("gmail.read");
  appendFileSync(file, full.slice(0, 30));
  assert.deepEqual(tail.readNew(), []);
  appendFileSync(file, full.slice(30));
  assert.deepEqual(tail.readNew().map((e) => e.action), ["gmail.read"]);
});

test("a Cyrillic letter cut in the middle of its bytes is not broken", () => {
  const file = tempLog();
  writeFileSync(file, "");
  const tail = createTail(file);
  const bytes = Buffer.from(line("gmail.read", "отказ"));
  const cut = bytes.indexOf(Buffer.from("т")) + 1; // inside the 2 bytes of "т"
  appendFileSync(file, bytes.subarray(0, cut));
  assert.deepEqual(tail.readNew(), []);
  appendFileSync(file, bytes.subarray(cut));
  assert.equal(tail.readNew()[0]?.reason, "отказ");
});

test("a file that was cut or replaced is read again from the start", () => {
  const file = tempLog();
  writeFileSync(file, line("gmail.read") + line("gmail.draft"));
  const tail = createTail(file);
  tail.readNew();
  writeFileSync(file, line("gmail.send"));
  assert.deepEqual(tail.readNew().map((e) => e.action), ["gmail.send"]);
});

test("a missing file is simply empty", () => {
  assert.deepEqual(createTail(tempLog()).readNew(), []);
});

test("agentcollar watch shows a new event live and exits cleanly on Ctrl+C", async () => {
  const file = tempLog();
  writeFileSync(file, line("gmail.read"));
  const bin = join(import.meta.dirname, "..", "bin", "agentcollar.mjs");
  const child = spawn(process.execPath, [bin, "watch"], { env: { ...process.env, AGENTCOLLAR_HOME: dirname(file), NO_COLOR: "1" } });
  let out = "";
  child.stdout.on("data", (chunk) => (out += chunk));

  const waitFor = async (text: string) => {
    for (let i = 0; i < 60 && !out.includes(text); i++) await new Promise((r) => setTimeout(r, 100));
    assert.ok(out.includes(text), `expected "${text}" in:\n${out}`);
  };

  try {
    await waitFor("в реальном времени");
    assert.ok(out.includes("gmail.read"), "recent events are shown first");
    appendFileSync(file, `2026-10-04T13:42:07.000Z | "digest-agent" | "gmail.send" | DENIED | "action not allowed" | action_not_allowed\n`);
    await waitFor("gmail.send");
    assert.ok(out.includes("✓ ✓ ✓ ✓ ✗ ·"));

    const exited = new Promise<number | null>((resolve) => child.on("exit", resolve));
    child.kill("SIGINT");
    assert.equal(await exited, 0);
  } finally {
    child.kill("SIGKILL"); // never leave a watcher running if an assertion failed
  }
});
