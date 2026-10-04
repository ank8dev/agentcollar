// agentcollar logs [--agent <name>] [--denied] [--today] — the audit log, readable and filtered.
import { readAuditLog, type AuditEntry } from "../audit-log.ts";
import { auditLogFile } from "../audit.ts";
import { formatEntry, isSameLocalDay } from "./format.ts";

export type LogsFilter = { agent: string | null; denied: boolean; today: boolean };

export function parseLogsArgs(args: string[]): LogsFilter {
  const filter: LogsFilter = { agent: null, denied: false, today: false };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--denied") filter.denied = true;
    else if (arg === "--today") filter.today = true;
    else if (arg === "--agent") {
      const name = args[++i];
      if (name === undefined || name.startsWith("--")) throw new Error("После --agent нужно имя: --agent <имя>");
      filter.agent = name;
    } else throw new Error(`Неизвестный флаг: ${arg}. Есть: --agent <имя>, --denied, --today`);
  }
  return filter;
}

export function filterEntries(entries: AuditEntry[], filter: LogsFilter, now: Date = new Date()): AuditEntry[] {
  return entries.filter(
    (entry) =>
      (filter.agent === null || entry.agent === filter.agent) &&
      (!filter.denied || !entry.allowed) &&
      (!filter.today || isSameLocalDay(new Date(entry.time), now)),
  );
}

export async function runLogs(args: string[]): Promise<number> {
  let filter: LogsFilter;
  try {
    filter = parseLogsArgs(args);
  } catch (error) {
    console.error((error as Error).message);
    return 1;
  }

  const entries = filterEntries(readAuditLog(auditLogFile), filter);
  if (entries.length === 0) {
    console.log("Записей нет.");
    return 0;
  }
  for (const entry of entries) console.log(formatEntry(entry, { showDate: !filter.today }));
  return 0;
}
