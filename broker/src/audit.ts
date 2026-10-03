import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

// broker/data/audit.log, found from this file's folder (broker/src),
// so it lands in the same place no matter where you run the command from.
const dataDir = join(import.meta.dirname, "..", "data");
const logFile = join(dataDir, "audit.log");

// Text that came from outside (agent name, action) could contain a line break
// and fake a second log line. JSON.stringify wraps it in quotes and turns a line
// break into a visible \n, so one event is always exactly one line.
function safe(text: string): string {
  return JSON.stringify(text);
}

// Appends one line per event: every check, and every human decision.
// We only ever add lines, never change or delete them.
// The token is NOT written: it is a secret, and the log is not.
export function writeAudit(agent: string, action: string, allowed: boolean, reason: string): void {
  mkdirSync(dataDir, { recursive: true }); // create data/ if it does not exist yet

  const time = new Date().toISOString(); // e.g. 2026-10-04T07:00:00.000Z (UTC)
  const verdict = allowed ? "ALLOWED" : "DENIED";
  const line = [time, safe(agent), safe(action), verdict, safe(reason)].join(" | ");

  appendFileSync(logFile, line + "\n");
}
