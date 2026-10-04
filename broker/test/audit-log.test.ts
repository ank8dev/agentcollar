import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { writeAudit } from "../src/audit.ts";
import { auditLogFile } from "../src/paths.ts";
import { parseAuditLine } from "../src/audit-log.ts";
import { check } from "../src/check.ts";
import { approve, requestMandate } from "../src/mandate.ts";

// Test files run in parallel and share one temp log, so "the last line" may belong to another file.
// Each test uses its own agent name and looks for ITS lines only.
const uniqueAgent = () => `audit-test-${randomBytes(4).toString("hex")}`;
const linesOf = (agent: string) => readFileSync(auditLogFile, "utf8").split("\n").filter((l) => l.includes(`"${agent}"`));

test("check() writes which check decided, as a last column", () => {
  const agent = uniqueAgent();
  const mandate = requestMandate(agent, "task", ["gmail.read"], 60, 1);
  approve(mandate.id);
  check(mandate.token, "gmail.send");
  check(mandate.token, "gmail.read");
  const [denied, allowed] = linesOf(agent);
  assert.ok(denied?.endsWith(' | DENIED | "action \\"gmail.send\\" is not allowed" | action_not_allowed'), denied);
  assert.ok(allowed?.endsWith(' | ALLOWED | "ok" | ok'), allowed);
});

test("human decisions have no check column", () => {
  const agent = uniqueAgent();
  writeAudit(agent, "mandate.approve", true, "approve by terminal, mandate a935774d");
  assert.ok(linesOf(agent)[0]?.endsWith('| "mandate.approve" | ALLOWED | "approve by terminal, mandate a935774d"'));
});

test("parses a line with a check code", () => {
  const line = '2026-10-04T15:42:07.123Z | "digest-agent" | "gmail.send" | DENIED | "action \\"gmail.send\\" is not allowed" | action_not_allowed';
  assert.deepEqual(parseAuditLine(line), {
    time: "2026-10-04T15:42:07.123Z",
    agent: "digest-agent",
    action: "gmail.send",
    allowed: false,
    reason: 'action "gmail.send" is not allowed',
    code: "action_not_allowed",
  });
});

test("a ' | ' inside quoted text does not split the line", () => {
  const line = '2026-10-04T15:42:07.123Z | "a | b" | "gmail.read" | DENIED | "x | y" | unknown_token';
  assert.equal(parseAuditLine(line)?.agent, "a | b");
  assert.equal(parseAuditLine(line)?.reason, "x | y");
});

test("parses older lines: human decision (no code) and the very first unquoted format", () => {
  assert.equal(parseAuditLine('2026-10-04T15:42:07.123Z | "a" | "mandate.approve" | ALLOWED | "approve by telegram"')?.code, null);
  assert.deepEqual(parseAuditLine("2026-10-03T23:15:12.534Z | digest-agent | gmail.read | ALLOWED | ok"), {
    time: "2026-10-03T23:15:12.534Z",
    agent: "digest-agent",
    action: "gmail.read",
    allowed: true,
    reason: "ok",
    code: null,
  });
});

test("garbage is skipped, not guessed", () => {
  assert.equal(parseAuditLine(""), null);
  assert.equal(parseAuditLine("hello world"), null);
  assert.equal(parseAuditLine('2026-10-04T15:42:07.123Z | "a" | "b" | MAYBE | "c"'), null);
});
