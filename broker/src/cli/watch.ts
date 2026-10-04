// agentcollar watch — the audit log live: every agent request as it happens, with the 6 checks.
// Read-only: it only watches data/audit.log, no HTTP and no way to change anything.
import { mkdirSync, watch } from "node:fs";
import { basename, dirname } from "node:path";
import { styleText } from "node:util";
import type { AuditEntry } from "../audit-log.ts";
import { auditLogFile } from "../audit.ts";
import { formatEntry, isToday } from "./format.ts";
import { createTail } from "./tail.ts";

const RECENT = 10; // how many past events to show first, for context

function print(entry: AuditEntry): void {
  console.log(formatEntry(entry, { showDate: !isToday(entry.time) }));
}

export async function runWatch(args: string[]): Promise<number> {
  if (args.length > 0) {
    console.error(`agentcollar watch не принимает аргументов: ${args.join(" ")}`);
    return 1;
  }

  console.log(`${styleText("bold", "AgentCollar · watch")}   ${styleText("dim", "Ctrl+C — выход")}`);
  console.log(styleText("dim", "проверки: 1 токен · 2 одобрен · 3 срок · 4 не отозван · 5 действие · 6 лимит"));

  const tail = createTail(auditLogFile);
  const past = tail.readNew().slice(-RECENT);
  if (past.length > 0) {
    console.log(styleText("dim", "— последние события —"));
    past.forEach(print);
  }
  console.log(styleText("dim", "— дальше в реальном времени —"));

  // Watch the FOLDER, not the file: it also works before the log exists, and after it is replaced.
  const folder = dirname(auditLogFile);
  mkdirSync(folder, { recursive: true });
  const watcher = watch(folder, (_event, name) => {
    if (name === null || name === basename(auditLogFile)) tail.readNew().forEach(print);
  });

  return new Promise((resolve) => {
    process.once("SIGINT", () => {
      watcher.close();
      process.stdout.write("\n");
      resolve(0);
    });
  });
}
