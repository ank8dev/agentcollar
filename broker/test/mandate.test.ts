import assert from "node:assert/strict";
import { test } from "node:test";
import { check } from "../src/check.ts";
import { approve, findStalePending, requestMandate } from "../src/mandate.ts";

const TEN_MINUTES = 10 * 60 * 1000;

test("a new mandate remembers when it was requested", () => {
  const before = Date.now();
  const mandate = requestMandate("agent", "task", ["gmail.read"], 60, 1);
  assert.ok(mandate.createdAt >= before && mandate.createdAt <= Date.now());
});

test("a pending mandate becomes stale after 10 minutes, not before", () => {
  const mandate = requestMandate("agent", "task", ["gmail.read"], 60, 1);
  assert.equal(findStalePending(TEN_MINUTES, mandate.createdAt + TEN_MINUTES - 1).includes(mandate), false);
  assert.equal(findStalePending(TEN_MINUTES, mandate.createdAt + TEN_MINUTES + 1).includes(mandate), true);
});

test("an approved mandate is never stale", () => {
  const mandate = requestMandate("agent", "task", ["gmail.read"], 60, 1);
  approve(mandate.id);
  assert.equal(findStalePending(TEN_MINUTES, mandate.createdAt + 10 * TEN_MINUTES).includes(mandate), false);
});

test("check() refuses a pending mandate", () => {
  const mandate = requestMandate("agent", "task", ["gmail.read"], 60, 1);
  assert.equal(check(mandate.token, "gmail.read").code, "not_approved");
});
