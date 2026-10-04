import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { test } from "node:test";

const bin = join(import.meta.dirname, "..", "bin", "agentcollar.mjs");

// A clean home with no settings, a free port, and NO Telegram token (never touch a real bot in tests).
function cleanEnv() {
  return {
    ...process.env,
    AGENTCOLLAR_HOME: mkdtempSync(join(tmpdir(), "start-")),
    BROKER_PORT: String(18000 + Math.floor(Math.random() * 2000)),
    TELEGRAM_BOT_TOKEN: "",
    NO_COLOR: "1",
  };
}

test("agcl with no command, not set up, no terminal: starts the broker (terminal approvals)", async () => {
  const env = cleanEnv();
  const child = spawn(process.execPath, [bin], { env, stdio: ["pipe", "pipe", "pipe"] });
  let out = "";
  child.stdout.on("data", (chunk) => (out += chunk));
  child.stderr.on("data", (chunk) => (out += chunk));
  try {
    for (let i = 0; i < 60 && !out.includes("Broker listening"); i++) await new Promise((r) => setTimeout(r, 100));
    assert.ok(out.includes(`Broker listening on http://127.0.0.1:${env.BROKER_PORT}`), out);
    assert.ok(out.includes("Approvals: this terminal"));
  } finally {
    child.kill("SIGKILL");
  }
});

test("agcl mcp answers tools/list on stdout with nothing else mixed in", async () => {
  const child = spawn(process.execPath, [bin, "mcp"], { env: cleanEnv(), stdio: ["pipe", "pipe", "ignore"] });
  try {
    const firstLine = new Promise<string>((resolve) => createInterface({ input: child.stdout }).once("line", resolve));
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) + "\n");
    const reply = JSON.parse(await firstLine) as { id: number; result: { tools: { name: string }[] } };
    assert.equal(reply.id, 1);
    assert.equal(reply.result.tools.length, 5);
  } finally {
    child.kill("SIGKILL");
  }
});
