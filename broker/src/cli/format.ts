// How one audit entry looks on screen. Shared by `agentcollar logs` and `agentcollar watch`.
import { styleText } from "node:util";
import { oneLine } from "../approval.ts";
import type { AuditEntry } from "../audit-log.ts";
import { CHECK_ORDER } from "../check.ts";

// ✓ passed, ✗ failed here, · not reached. Empty for human decisions and old lines without a code.
export function checkMarks(entry: AuditEntry): string {
  if (entry.code === null) return "";
  const failedAt = entry.code === "ok" ? CHECK_ORDER.length : CHECK_ORDER.indexOf(entry.code);
  return CHECK_ORDER.map((_, i) => (i < failedAt ? "✓" : i === failedAt ? "✗" : "·")).join(" ");
}

const pad = (n: number) => String(n).padStart(2, "0");

export function isSameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function isToday(iso: string, now: Date = new Date()): boolean {
  return isSameLocalDay(new Date(iso), now);
}

// Local time: "15:42:07", or "2026-10-04 15:42:07" when the date matters.
export function localTime(iso: string, showDate: boolean): string {
  const d = new Date(iso);
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  return showDate ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${time}` : time;
}

// Agent names, actions and reasons come from agents. Printed raw, a text like "\u001b[2J" would
// be a COMMAND to the terminal (clear screen, change title...). oneLine() strips control characters.
export function formatEntry(entry: AuditEntry, options: { showDate: boolean }): string {
  const time = styleText("dim", localTime(entry.time, options.showDate));
  const agent = oneLine(entry.agent, 24).padEnd(16);
  const action = oneLine(entry.action, 32);
  const reason = styleText("dim", oneLine(entry.reason, 120));

  if (entry.action.startsWith("mandate.")) {
    // a human decision (approve / deny / revoke) or the relay fallback: one yellow line
    return `${time}  ${styleText("yellow", `${agent}  ${action.padEnd(18)}  ${oneLine(entry.reason, 120)}`)}`;
  }
  const verdict = entry.allowed ? styleText("green", "ALLOWED") : styleText("red", "DENIED ");
  const marks = checkMarks(entry).padEnd(11);
  return `${time}  ${agent}  ${action.padEnd(18)}  ${verdict}  ${marks}  ${reason}`;
}
