import { appendFileSync } from "node:fs";
import { auditLogFile, ensureHome } from "./paths.ts";

// ~/.agentcollar/audit.log (see paths.ts). Re-exported for the modules that read the log.
export { auditLogFile };

// Text that came from outside (agent name, action) could contain a line break
// and fake a second log line. JSON.stringify wraps it in quotes and turns a line
// break into a visible \n, so one event is always exactly one line.
function safe(text: string): string {
  return JSON.stringify(text);
}

// Appends one line per event: every check, and every human decision.
// We only ever add lines, never change or delete them.
// The token is NOT written: it is a secret, and the log is not.
// `code` (only for checks) says which check decided, e.g. "expired": `agentcollar watch` shows it.
export function writeAudit(agent: string, action: string, allowed: boolean, reason: string, code?: string): void {
  ensureHome(); // ~/.agentcollar/ with rights 700

  const time = new Date().toISOString(); // e.g. 2026-10-04T07:00:00.000Z (UTC)
  const verdict = allowed ? "ALLOWED" : "DENIED";
  const fields = [time, safe(agent), safe(action), verdict, safe(reason)];
  if (code !== undefined) fields.push(code); // our own fixed word: needs no quoting

  appendFileSync(auditLogFile, fields.join(" | ") + "\n", { mode: 0o600 }); // 600 when the file is created
}
