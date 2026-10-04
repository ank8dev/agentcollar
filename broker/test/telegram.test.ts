import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { requestMandate } from "../src/mandate.ts";
import { notifyRevoked, notifyTimedOut, sendApprovalRequest } from "../src/telegram.ts";

type Call = { method: string; params: Record<string, unknown> };
const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

// A pretend Telegram Bot API that records calls and gives every message an id.
function fakeTelegram(): Call[] {
  const calls: Call[] = [];
  let nextMessageId = 500;
  globalThis.fetch = (async (url: string, init: { body: string }) => {
    const method = url.split("/").pop() as string;
    calls.push({ method, params: JSON.parse(init.body) as Record<string, unknown> });
    const result = method === "sendMessage" ? { message_id: nextMessageId++ } : true;
    return { json: async () => ({ ok: true, result }) };
  }) as unknown as typeof fetch;
  return calls;
}

const config = { botToken: "test", approverId: 42 };

test("on timeout the Telegram message says so and loses its buttons", async () => {
  const calls = fakeTelegram();
  const mandate = requestMandate("agent", "task", ["gmail.read"], 60, 1);
  await sendApprovalRequest(config, mandate);
  await notifyTimedOut(config, mandate);

  const edit = calls.find((c) => c.method === "editMessageText");
  assert.ok(edit, "the message must be edited");
  assert.equal(edit.params.chat_id, 42);
  assert.equal(edit.params.message_id, 500);
  assert.ok(String(edit.params.text).endsWith("⌛ Timed out: no answer in 10 minutes"));
  assert.deepEqual(edit.params.reply_markup, { inline_keyboard: [] });
});

test("a mandate that was never sent to Telegram is not edited", async () => {
  const calls = fakeTelegram();
  await notifyTimedOut(config, requestMandate("agent", "task", ["gmail.read"], 60, 1));
  assert.equal(calls.length, 0);
});

test("after a revoke from the terminal the Telegram message says so and loses its buttons", async () => {
  const calls = fakeTelegram();
  const mandate = requestMandate("agent", "task", ["gmail.read"], 60, 1);
  await sendApprovalRequest(config, mandate);
  await notifyRevoked(config, mandate);

  const edit = calls.find((c) => c.method === "editMessageText");
  assert.ok(edit, "the message must be edited");
  assert.ok(String(edit.params.text).endsWith("🛑 Revoked"));
  assert.deepEqual(edit.params.reply_markup, { inline_keyboard: [] });
});
