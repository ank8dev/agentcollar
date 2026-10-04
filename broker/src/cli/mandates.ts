// agentcollar mandates — the mandates of the running broker: who, what, state, time and actions left.
import { styleText } from "node:util";
import { oneLine } from "../approval.ts";
import { readMandatesSnapshot, type SnapshotMandate } from "../snapshot.ts";

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

  const rows = [...snapshot.mandates].sort((a, b) => b.createdAt - a.createdAt).map((m) => mandateRow(m));
  const cells = (r: Row) => [r.id, r.agent, r.actions, r.state, r.timeLeft, r.limit];
  const widths = COLUMNS.map((title, i) => Math.max(title.length, ...rows.map((r) => cells(r)[i]!.length)));

  // pad first, color after: color codes are invisible but would break the padding
  console.log(styleText("dim", COLUMNS.map((title, i) => title.padEnd(widths[i]!)).join("  ")));
  for (const row of rows) {
    const line = cells(row).map((cell, i) => cell.padEnd(widths[i]!));
    line[3] = row.live ? styleText("green", line[3]!) : row.state === "waiting" ? styleText("yellow", line[3]!) : line[3]!;
    console.log(row.live || row.state === "waiting" ? line.join("  ") : styleText("dim", line.join("  ")));
  }
  return 0;
}
