import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { test } from "node:test";
import { parseCommand } from "../src/cli/main.ts";

const bin = join(import.meta.dirname, "..", "bin", "agentcollar.mjs");

function run(...args: string[]) {
  const result = spawnSync(process.execPath, [bin, ...args], { encoding: "utf8", env: { ...process.env, NO_COLOR: "1" } });
  return { code: result.status, out: result.stdout + result.stderr };
}

test("parseCommand: the first word is the command, the rest are its arguments", () => {
  assert.deepEqual(parseCommand(["revoke", "a935774d"]), { kind: "run", name: "revoke", args: ["a935774d"], flags: { noIntro: false } });
});

test("parseCommand: no words -> the default flow (intro, setup if needed, server)", () => {
  assert.deepEqual(parseCommand([]), { kind: "default", flags: { noIntro: false } });
  assert.deepEqual(parseCommand(["--no-intro"]), { kind: "default", flags: { noIntro: true } });
});

test("parseCommand: help, --help or -h -> help", () => {
  assert.deepEqual(parseCommand(["help"]), { kind: "help" });
  assert.deepEqual(parseCommand(["--help"]), { kind: "help" });
  assert.deepEqual(parseCommand(["-h"]), { kind: "help" });
});

test("parseCommand: an unknown command is reported by name", () => {
  assert.deepEqual(parseCommand(["launch"]), { kind: "unknown", name: "launch" });
});

test("parseCommand: --no-intro is a flag anywhere, not an argument", () => {
  assert.deepEqual(parseCommand(["--no-intro", "setup"]), { kind: "run", name: "setup", args: [], flags: { noIntro: true } });
});

test("bin: --help lists every command, says agcl == agentcollar, and exits 0", () => {
  const { code, out } = run("--help");
  assert.equal(code, 0);
  for (const command of ["setup", "gmail", "server", "watch", "mandates", "logs", "revoke", "mcp"]) {
    assert.ok(out.includes(`agcl ${command}`), command);
  }
  assert.ok(out.includes("agcl watch == agentcollar watch"));
});

test("bin: an unknown command says so and exits 1", () => {
  const { code, out } = run("launch");
  assert.equal(code, 1);
  assert.ok(out.includes("Unknown command: launch"));
});

test("bin: revoke without an id shows its usage and exits 1", () => {
  const { code, out } = run("revoke");
  assert.equal(code, 1);
  assert.ok(out.includes("agcl revoke <id>"));
});

test("bin: agcl gmail without a subcommand shows its usage and exits 1", () => {
  const { code, out } = run("gmail");
  assert.equal(code, 1);
  assert.ok(out.includes("agcl gmail connect"));
});
