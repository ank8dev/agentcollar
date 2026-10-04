import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";
import {
  buildEnv,
  findStarter,
  getBotUsername,
  isTokenFormat,
  newStartCode,
  pollForStart,
  skipOldUpdates,
  writeEnvFile,
} from "../src/setup.ts";

const TOKEN = "1234567890:AAH" + "x".repeat(32);

// --- token format ---

test("a real-looking bot token passes the format check", () => {
  assert.equal(isTokenFormat(TOKEN), true);
});

test("tokens with spaces, line breaks or wrong shape are rejected", () => {
  assert.equal(isTokenFormat("abc"), false);
  assert.equal(isTokenFormat(`${TOKEN} `), false);
  // a line break would let someone inject extra lines into .env
  assert.equal(isTokenFormat(`${TOKEN}\nTELEGRAM_USER_ID=666`), false);
});

// --- start code and the Start message ---

test("start codes are 8 easy-to-read characters and differ every time", () => {
  assert.match(newStartCode(), /^[2-9A-HJKMNP-Z]{8}$/);
  assert.notEqual(newStartCode(), newStartCode());
});

const startUpdate = (id: number, text: string, chatType = "private", fromId = 42) => ({
  update_id: id,
  message: { from: { id: fromId, first_name: "Ank", username: "ank" }, chat: { type: chatType }, text },
});

test("finds the user who sent /start with OUR code in a private chat", () => {
  const user = findStarter([startUpdate(1, "/start K7P2M9QX")], "K7P2M9QX");
  assert.deepEqual(user, { id: 42, firstName: "Ank", username: "ank" });
});

test("ignores /start with another code, without a code, or in a group", () => {
  const updates = [
    startUpdate(1, "/start AAAAAAAA", "private", 666),
    startUpdate(2, "/start", "private", 667),
    startUpdate(3, "/start K7P2M9QX", "group", 668),
  ];
  assert.equal(findStarter(updates, "K7P2M9QX"), undefined);
});

test("a stranger's /start does not win over ours", () => {
  const updates = [startUpdate(1, "/start", "private", 666), startUpdate(2, "/start K7P2M9QX")];
  assert.equal(findStarter(updates, "K7P2M9QX")?.id, 42);
});

test("control characters in the Telegram name cannot reach the terminal", () => {
  const update = startUpdate(1, "/start K7P2M9QX");
  update.message.from.first_name = "An\u001b[2Jk";
  assert.equal(findStarter([update], "K7P2M9QX")?.firstName, "An [2Jk");
});

// --- .env file ---

test("builds .env from nothing", () => {
  assert.equal(buildEnv("", { TELEGRAM_BOT_TOKEN: TOKEN, TELEGRAM_USER_ID: "42" }), `TELEGRAM_BOT_TOKEN=${TOKEN}\nTELEGRAM_USER_ID=42\n`);
});

test("replaces old values and keeps every other line", () => {
  const existing = "# my settings\nTELEGRAM_BOT_TOKEN=old\nBROKER_PORT=9000\nTELEGRAM_USER_ID=1\n";
  assert.equal(
    buildEnv(existing, { TELEGRAM_BOT_TOKEN: TOKEN, TELEGRAM_USER_ID: "42" }),
    `# my settings\nTELEGRAM_BOT_TOKEN=${TOKEN}\nBROKER_PORT=9000\nTELEGRAM_USER_ID=42\n`,
  );
});

test("a commented-out line stays a comment; the value is added at the end", () => {
  assert.equal(buildEnv("# TELEGRAM_BOT_TOKEN=old", { TELEGRAM_BOT_TOKEN: TOKEN }), `# TELEGRAM_BOT_TOKEN=old\nTELEGRAM_BOT_TOKEN=${TOKEN}\n`);
});

test("the written .env is readable only by its owner (600), even if it existed with 644", () => {
  const file = join(mkdtempSync(join(tmpdir(), "setup-")), ".env");
  writeFileSync(file, "OLD=1\n");
  chmodSync(file, 0o644);
  writeEnvFile(file, "NEW=1\n");
  assert.equal(statSync(file).mode & 0o777, 0o600);
  assert.equal(readFileSync(file, "utf8"), "NEW=1\n");
});

// --- Telegram calls (with a pretend Telegram) ---

type Call = { method: string; params: Record<string, unknown> };
const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function fakeTelegram(answer: (method: string, params: Record<string, unknown>) => unknown): Call[] {
  const calls: Call[] = [];
  globalThis.fetch = (async (url: string, init: { body: string }) => {
    const method = url.split("/").pop() as string;
    const params = JSON.parse(init.body) as Record<string, unknown>;
    calls.push({ method, params });
    return { json: async () => answer(method, params) };
  }) as unknown as typeof fetch;
  return calls;
}

test("getBotUsername returns the bot's @username", async () => {
  fakeTelegram(() => ({ ok: true, result: { username: "ank_collar_bot" } }));
  assert.equal(await getBotUsername(TOKEN), "ank_collar_bot");
});

test("a token Telegram does not know gives a clear error", async () => {
  fakeTelegram(() => ({ ok: false, error_code: 401, description: "Unauthorized" }));
  await assert.rejects(getBotUsername(TOKEN), /Telegram не узнал этот токен/);
});

test("a badly shaped token is rejected before asking Telegram", async () => {
  const calls = fakeTelegram(() => ({ ok: true, result: { username: "x" } }));
  await assert.rejects(getBotUsername("not-a-token"), /не похоже на токен/);
  assert.equal(calls.length, 0);
});

test("old messages are skipped: we continue after the last one", async () => {
  fakeTelegram(() => ({ ok: true, result: [{ update_id: 41 }] }));
  assert.equal(await skipOldUpdates(TOKEN), 42);
  fakeTelegram(() => ({ ok: true, result: [] }));
  assert.equal(await skipOldUpdates(TOKEN), 0);
});

test("pollForStart returns the user and the next offset", async () => {
  const calls = fakeTelegram(() => ({ ok: true, result: [startUpdate(50, "/start K7P2M9QX")] }));
  const result = await pollForStart(TOKEN, "K7P2M9QX", 50);
  assert.equal(result.user?.id, 42);
  assert.equal(result.offset, 51);
  assert.equal(calls[0]?.params.offset, 50);
});

test("another program polling the same bot (409) gives a clear error", async () => {
  fakeTelegram(() => ({ ok: false, error_code: 409, description: "Conflict: terminated by other getUpdates request" }));
  await assert.rejects(pollForStart(TOKEN, "K7P2M9QX", 0), /agcl server/);
});
