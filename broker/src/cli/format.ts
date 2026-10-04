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

// The terminal width right now (it changes when you resize the window). COLUMNS: for pipes and tests.
export function termWidth(): number {
  return process.stdout.columns || Number(process.env.COLUMNS) || 100;
}

// Cuts text to `max` visible characters, ending with "…" when something was cut.
export function fit(text: string, max: number): string {
  const chars = [...text];
  if (max <= 0) return "";
  return chars.length <= max ? text : chars.slice(0, max - 1).join("") + "…";
}

const cell = (text: string, width: number) => fit(text, width).padEnd(width);

// Breaks text into lines of at most `width` characters, at spaces.
export function wrap(text: string, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    if (line !== "" && [...line].length + 1 + [...word].length > width) {
      lines.push(line);
      line = "";
    }
    line = line === "" ? fit(word, width) : `${line} ${word}`;
  }
  if (line !== "") lines.push(line);
  return lines;
}

// Agent names, actions and reasons come from agents. Printed raw, a text like "\u001b[2J" would
// be a COMMAND to the terminal (clear screen, change title...). oneLine() strips control characters.
// Layout follows the window width: wide = one roomy line, medium = one tight line, narrow = two lines.
export function formatEntry(entry: AuditEntry, options: { showDate: boolean; width?: number }): string {
  const width = options.width ?? termWidth();
  const iso = localTime(entry.time, options.showDate);
  const time = options.showDate && width < 100 ? iso.slice(5, 16) : iso; // "10-04 15:42" when tight
  const agent = oneLine(entry.agent, 64);
  const action = oneLine(entry.action, 64);
  const reason = oneLine(entry.reason, 300);
  const human = entry.action.startsWith("mandate."); // approve / deny / revoke by a person
  const verdict = entry.allowed ? styleText("green", "ALLOWED") : styleText("red", "DENIED ");
  const dimTime = styleText("dim", time);

  if (width >= 70) {
    const wide = width >= 100;
    const [agentW, actionW] = wide ? [16, 18] : [12, 14];
    const marks = wide ? checkMarks(entry) : checkMarks(entry).replaceAll(" ", "");
    const marksW = wide ? 11 : 6;
    if (human) {
      const humanActionW = Math.max(actionW, 16); // "mandate.approve" fits
      const rest = width - time.length - agentW - humanActionW - 6;
      return `${dimTime}  ${styleText("yellow", `${cell(agent, agentW)}  ${cell(action, humanActionW)}  ${fit(reason, rest)}`)}`;
    }
    const rest = width - time.length - agentW - actionW - 7 - marksW - 10;
    return `${dimTime}  ${cell(agent, agentW)}  ${cell(action, actionW)}  ${verdict}  ${marks.padEnd(marksW)}  ${styleText("dim", fit(reason, rest))}`;
  }

  // narrow window: two short lines
  if (human) {
    return `${dimTime}  ${styleText("yellow", fit(action, width - time.length - 2))}\n  ${styleText("yellow", fit(`${agent} · ${reason}`, width - 2))}`;
  }
  const first = `${dimTime}  ${verdict}  ${fit(action, width - time.length - 11)}`;
  const marks = checkMarks(entry).replaceAll(" ", "");
  const second = `  ${marks}  ${styleText("dim", fit(`${agent} · ${reason}`, width - marks.length - 4))}`;
  return `${first}\n${second}`;
}
