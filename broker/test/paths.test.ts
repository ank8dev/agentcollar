import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { auditLogFile, ensureHome, envFile, homeDir, migrateLegacy, snapshotFile } from "../src/paths.ts";

test("all user data lives in one home folder (AGENTCOLLAR_HOME in tests)", () => {
  assert.equal(homeDir, process.env.AGENTCOLLAR_HOME);
  assert.equal(envFile, join(homeDir, ".env"));
  assert.equal(auditLogFile, join(homeDir, "audit.log"));
  assert.equal(snapshotFile, join(homeDir, "mandates.json"));
});

test("ensureHome creates the folder readable only by its owner (700), even if it existed with 755", () => {
  mkdirSync(homeDir, { recursive: true, mode: 0o755 });
  ensureHome();
  assert.equal(statSync(homeDir).mode & 0o777, 0o700);
});

function legacyFolder() {
  const root = mkdtempSync(join(tmpdir(), "legacy-"));
  mkdirSync(join(root, "data"));
  writeFileSync(join(root, ".env"), "TELEGRAM_BOT_TOKEN=old\n", { mode: 0o644 });
  writeFileSync(join(root, "data", "audit.log"), "old line\n");
  const target = mkdtempSync(join(tmpdir(), "home-"));
  return {
    legacy: { env: join(root, ".env"), audit: join(root, "data", "audit.log") },
    target: { env: join(target, ".env"), audit: join(target, "audit.log") },
  };
}

test("migrateLegacy moves the old .env and audit log, and the moved files are 600", () => {
  const { legacy, target } = legacyFolder();
  const moved = migrateLegacy(legacy, target);
  assert.deepEqual(moved, ["env", "audit"]);
  assert.equal(existsSync(legacy.env), false);
  assert.equal(readFileSync(target.env, "utf8"), "TELEGRAM_BOT_TOKEN=old\n");
  assert.equal(statSync(target.env).mode & 0o777, 0o600);
  assert.equal(readFileSync(target.audit, "utf8"), "old line\n");
});

test("migrateLegacy never overwrites data that is already in the new place", () => {
  const { legacy, target } = legacyFolder();
  writeFileSync(target.env, "TELEGRAM_BOT_TOKEN=new\n");
  const moved = migrateLegacy(legacy, target);
  assert.deepEqual(moved, ["audit"]);
  assert.equal(readFileSync(target.env, "utf8"), "TELEGRAM_BOT_TOKEN=new\n");
  assert.equal(existsSync(legacy.env), true, "the old file stays where it was");
});
