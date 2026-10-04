// agentcollar mandates — the mandates of the running broker: who, what, state, time and actions left.
import { styleText } from "node:util";
import { oneLine } from "../approval.ts";
import { readMandatesSnapshot, type SnapshotMandate } from "../snapshot.ts";
import { fit, termWidth } from "./format.ts";

export type Row = { id: string; agent: string; actions: string; state: string; timeLeft: string; limit: string; live: boolean };

function duration(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

// The same order as check(): the first thing that ends a mandate decides its name.
export function mandateRow(m: SnapshotMandate, now: number = Date.now()): Row {
  let state = "active";
  if (m.status === "pending") state = "waiting";
  else if (m.status === "denied") state = "denied";
  else if (now > m.expiresAt) state = "expired";
  else if (m.revoked) state = "revoked";
  else if (m.used >= m.limit) state = "limit used up";

  const live = state === "active";
  return {
    id: m.id,
    agent: oneLine(m.agent, 24), // agent text: control characters removed before printing
    actions: m.allowedActions.join(", "),
    state,
    timeLeft: live ? duration(m.expiresAt - now) : "—",
    limit: `${m.used}/${m.limit}`,
    live,
  };
}

// Is the server process still running? Signal 0 checks without touching it.
function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM"; // exists, but belongs to someone else
  }
}

const COLUMNS = ["ID", "AGENT", "ACTIONS", "STATE", "TIME LEFT", "USED"] as const;

function colorState(row: Row, text: string): string {
  if (row.live) return styleText("green", text);
  if (row.state === "waiting") return styleText("yellow", text);
  return text;
}

// A table when it fits the window, otherwise one small "card" (two lines) per mandate.
export function formatMandates(mandates: SnapshotMandate[], now: number = Date.now(), width: number = termWidth()): string {
  const rows = [...mandates].sort((a, b) => b.createdAt - a.createdAt).map((m) => mandateRow(m, now));
  const cells = (r: Row) => [r.id, r.agent, r.actions, r.state, r.timeLeft, r.limit];
  const widths = COLUMNS.map((title, i) => Math.max(title.length, ...rows.map((r) => cells(r)[i]!.length)));
  const tableWidth = widths.reduce((sum, w) => sum + w, 0) + 2 * (widths.length - 1);
  const dimIfEnded = (row: Row, text: string) => (row.live || row.state === "waiting" ? text : styleText("dim", text));

  if (tableWidth <= width) {
    // pad first, color after: color codes are invisible but would break the padding
    const lines = [styleText("dim", COLUMNS.map((title, i) => title.padEnd(widths[i]!)).join("  "))];
    for (const row of rows) {
      const line = cells(row).map((c, i) => c.padEnd(widths[i]!));
      line[3] = colorState(row, line[3]!);
      lines.push(dimIfEnded(row, line.join("  ")));
    }
    return lines.join("\n");
  }

  return rows
    .map((row) => {
      const time = row.timeLeft === "—" ? "" : `  ${row.timeLeft} left`;
      const head = fit(`${row.id}  ${row.state}${time}  ${row.limit} used`, width);
      const colored = head.replace(row.state, colorState(row, row.state));
      return dimIfEnded(row, `${colored}\n  ${fit(`${row.agent} · ${row.actions}`, width - 2)}`);
    })
    .join("\n");
}

export async function runMandates(args: string[]): Promise<number> {
  if (args.length > 0) {
    console.error(`agcl mandates takes no arguments: ${args.join(" ")}`);
    return 1;
  }

  const snapshot = readMandatesSnapshot();
  if (snapshot === null) {
    console.log("The broker has not been started yet. Run: agcl server");
    return 0;
  }
  if (!isRunning(snapshot.pid)) {
    console.log("The broker is not running. Mandates live in its memory, so they are gone once it stops.");
    return 0;
  }
  if (snapshot.mandates.length === 0) {
    console.log("No mandates yet.");
    return 0;
  }
  console.log(formatMandates(snapshot.mandates));
  return 0;
}
