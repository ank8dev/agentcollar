import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { applyTerminalAnswer, denyStalePending } from "../src/approval.ts";
import { check } from "../src/check.ts";
import { requestMandate } from "../src/mandate.ts";

const TEN_MINUTES = 10 * 60 * 1000;

test("nobody answered in 10 minutes -> the mandate is denied (fail closed)", () => {
  const mandate = requestMandate("agent", "task", ["gmail.read"], 60, 1);
  const denied = denyStalePending(TEN_MINUTES, mandate.createdAt + TEN_MINUTES + 1);
  assert.ok(denied.includes(mandate));
  assert.equal(mandate.status, "denied");
  const result = check(mandate.token, "gmail.read");
  assert.equal(result.allowed, false);
  assert.equal(result.reason, "mandate was denied (by the human, or no answer in time)");
});

test("the timeout is written to the audit log", () => {
  const mandate = requestMandate("agent", "task", ["gmail.read"], 60, 1);
  denyStalePending(TEN_MINUTES, mandate.createdAt + TEN_MINUTES + 1);
  const log = readFileSync(process.env.BROKER_AUDIT_LOG as string, "utf8");
  assert.ok(log.includes(`"deny by timeout, mandate ${mandate.id}"`));
});

test("a fresh pending mandate is left alone", () => {
  const mandate = requestMandate("agent", "task", ["gmail.read"], 60, 1);
  assert.equal(denyStalePending(TEN_MINUTES, mandate.createdAt + 1).includes(mandate), false);
  assert.equal(mandate.status, "pending");
});

test("terminal: 'y' approves a pending mandate", () => {
  const mandate = requestMandate("agent", "task", ["gmail.read"], 60, 1);
  assert.equal(applyTerminalAnswer(mandate, "y"), "  ✅ одобрен");
  assert.equal(mandate.status, "approved");
});

test("terminal: a late 'y' after the timeout says so and changes nothing", () => {
  const mandate = requestMandate("agent", "task", ["gmail.read"], 60, 1);
  denyStalePending(TEN_MINUTES, mandate.createdAt + TEN_MINUTES + 1);
  assert.equal(applyTerminalAnswer(mandate, "y"), "  ⌛ уже решено (время вышло или ответили в Telegram), ответ не применён");
  assert.equal(mandate.status, "denied");
});
