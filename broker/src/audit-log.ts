// Reads data/audit.log back into objects, for `agentcollar logs` and `agentcollar watch`.
// Line format (see audit.ts):  time | "agent" | "action" | ALLOWED|DENIED | "reason" [| code]
import { existsSync, readFileSync } from "node:fs";
import type { CheckCode } from "./check.ts";

export type AuditEntry = {
  time: string; // ISO, UTC
  agent: string;
  action: string;
  allowed: boolean;
  reason: string;
  code: CheckCode | null; // null for human decisions and for lines written before codes existed
};

// A JSON string: quote, then any characters except an unescaped quote, then quote.
// Matching whole strings (not splitting on " | ") keeps a " | " inside the text in one piece.
const QUOTED = String.raw`"(?:[^"\\]|\\.)*"`;
const LINE = new RegExp(String.raw`^(\S+) \| (${QUOTED}) \| (${QUOTED}) \| (ALLOWED|DENIED) \| (${QUOTED})(?: \| ([a-z_]+))?$`);

// The very first lines (before escaping was added in step 4.1) had no quotes at all.
const OLD_LINE = /^(\S+) \| ([^|"]+) \| ([^|"]+) \| (ALLOWED|DENIED) \| ([^|"]*)$/;

export function parseAuditLine(line: string): AuditEntry | null {
  const match = LINE.exec(line);
  if (match !== null) {
    const [, time, agent, action, verdict, reason, code] = match as unknown as string[];
    return {
      time: time!,
      agent: JSON.parse(agent!) as string,
      action: JSON.parse(action!) as string,
      allowed: verdict === "ALLOWED",
      reason: JSON.parse(reason!) as string,
      code: (code as CheckCode | undefined) ?? null,
    };
  }
  const old = OLD_LINE.exec(line);
  if (old !== null) {
    const [, time, agent, action, verdict, reason] = old as unknown as string[];
    return { time: time!, agent: agent!, action: action!, allowed: verdict === "ALLOWED", reason: reason!, code: null };
  }
  return null; // not a log line: skip it rather than guess
}

export function readAuditLog(file: string): AuditEntry[] {
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .split("\n")
    .map(parseAuditLine)
    .filter((entry): entry is AuditEntry => entry !== null);
}
