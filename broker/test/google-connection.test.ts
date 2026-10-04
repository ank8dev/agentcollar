import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { test } from "node:test";
import { forgetConnection, loadMailbox, readGmailInfo, REFRESH_TOKEN_ACCOUNT, saveConnection } from "../src/google/connection.ts";
import { memoryStore } from "../src/google/keychain.ts";
import { ensureHome, gmailInfoFile, googleClientFile } from "../src/paths.ts";

test("not connected -> the fake mailbox", () => {
  if (existsSync(googleClientFile)) unlinkSync(googleClientFile);
  assert.equal(loadMailbox(memoryStore()).kind, "fake");
});

test("connected -> real Gmail; the refresh token is in the secret store, never in the info file", () => {
  ensureHome();
  writeFileSync(googleClientFile, JSON.stringify({ installed: { client_id: "id", client_secret: "s" } }));
  const store = memoryStore();
  saveConnection({ email: "me@gmail.com", connectedAt: "2026-10-04T20:00:00Z" }, "REFRESH-SECRET", store);

  assert.equal(store.get(REFRESH_TOKEN_ACCOUNT), "REFRESH-SECRET");
  assert.equal(readFileSync(gmailInfoFile, "utf8").includes("REFRESH-SECRET"), false);
  assert.equal(statSync(gmailInfoFile).mode & 0o777, 0o600);
  assert.equal(readGmailInfo()?.email, "me@gmail.com");
  assert.equal(loadMailbox(store).kind, "gmail");

  assert.equal(forgetConnection(store), "REFRESH-SECRET");
  assert.equal(store.get(REFRESH_TOKEN_ACCOUNT), null);
  assert.equal(readGmailInfo(), null);
  assert.equal(loadMailbox(store).kind, "fake");
  unlinkSync(googleClientFile);
});

test("macOS Keychain: write, read, delete (skipped on other systems)", { skip: process.platform !== "darwin" }, async () => {
  const { keychain } = await import("../src/google/keychain.ts");
  const account = `test-${process.pid}-${Date.now()}`;
  keychain.set(account, "value-1");
  keychain.set(account, "value-2"); // update, not a duplicate
  assert.equal(keychain.get(account), "value-2");
  keychain.remove(account);
  assert.equal(keychain.get(account), null);
});
