import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { CheckResult } from "./check.ts";

// broker/data/audit.log, found from this file's folder (broker/src),
// so it lands in the same place no matter where you run the command from.
const dataDir = join(import.meta.dirname, "..", "data");
const logFile = join(dataDir, "audit.log");

// Appends one line per check. We only ever add lines, never change or delete them.
// The token is NOT written: it is a secret, and the log is not.
export function writeAudit(agent: string, action: string, result: CheckResult): void {
  mkdirSync(dataDir, { recursive: true }); // create data/ if it does not exist yet

  const time = new Date().toISOString(); // e.g. 2026-10-04T07:00:00.000Z (UTC)
  const verdict = result.allowed ? "ALLOWED" : "DENIED";
  const line = [time, agent, action, verdict, result.reason].join(" | ");

  appendFileSync(logFile, line + "\n");
}
