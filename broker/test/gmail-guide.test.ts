import assert from "node:assert/strict";
import { mkdtempSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { GUIDE_STEPS, waitForClientFile } from "../src/cli/gmail-guide.ts";
import { SCOPES } from "../src/google/oauth.ts";

test("the guide walks through the 6 Google Cloud pages, each with a direct link", () => {
  assert.equal(GUIDE_STEPS.length, 6);
  for (const step of GUIDE_STEPS) {
    assert.match(step.url, /^https:\/\/console\.cloud\.google\.com\//);
    assert.ok(step.title.length > 0 && step.todo.length > 0);
  }
  assert.ok(GUIDE_STEPS.some((s) => s.url.includes("gmail.googleapis.com")), "enables the Gmail API");
  assert.ok(GUIDE_STEPS.some((s) => s.todo.includes("Desktop app")), "creates a Desktop app client");
});

test("the scope step lists exactly the scopes AgentCollar asks for, nothing more", () => {
  const scopeStep = GUIDE_STEPS.find((s) => s.copy !== undefined);
  assert.deepEqual(scopeStep?.copy, SCOPES);
});

test("waits for a NEW client_secret file in Downloads, ignoring older ones", async () => {
  const downloads = mkdtempSync(join(tmpdir(), "downloads-"));
  const old = join(downloads, "client_secret_old.json");
  writeFileSync(old, "{}");
  const past = new Date(Date.now() - 60_000);
  utimesSync(old, past, past);

  const since = Date.now();
  setTimeout(() => writeFileSync(join(downloads, "client_secret_new.apps.googleusercontent.com.json"), "{}"), 30);
  const found = await waitForClientFile(downloads, since, 2000, 10);
  assert.equal(found, join(downloads, "client_secret_new.apps.googleusercontent.com.json"));
});

test("gives up after the timeout when nothing arrives", async () => {
  const downloads = mkdtempSync(join(tmpdir(), "downloads-"));
  assert.equal(await waitForClientFile(downloads, Date.now(), 50, 10), null);
});
