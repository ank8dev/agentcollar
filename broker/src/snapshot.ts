// data/mandates.json: what `agentcollar mandates` shows. Mandates live in the server's memory;
// the server writes this snapshot after every change. The CLI only reads it: no HTTP needed.
// The server never READS this file back, so writing into it cannot command the broker.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { auditLogFile } from "./audit.ts";
import { mandates, type Mandate, type MandateStatus } from "./mandate.ts";

// An explicit list of what may leave the server's memory. A list of what to REMOVE would be
// riskier: a secret field added to Mandate later would leak by default. The token is not here.
export type SnapshotMandate = {
  id: string;
  agent: string;
  task: string;
  allowedActions: string[];
  status: MandateStatus;
  revoked: boolean;
  createdAt: number;
  expiresAt: number;
  used: number;
  limit: number;
};

export type Snapshot = {
  pid: number; // the server's process id: the CLI checks whether it still runs
  writtenAt: number;
  mandates: SnapshotMandate[];
};

export const snapshotFile = join(dirname(auditLogFile), "mandates.json");

function toSnapshot(m: Mandate): SnapshotMandate {
  return {
    id: m.id,
    agent: m.agent,
    task: m.task,
    allowedActions: m.allowedActions,
    status: m.status,
    revoked: m.revoked,
    createdAt: m.createdAt,
    expiresAt: m.expiresAt,
    used: m.used,
    limit: m.limit,
  };
}

// Atomic write: the whole file goes to a temp name first, then a rename swaps it in.
// A reader therefore sees either the old file or the new one, never half of it.
export function writeMandatesSnapshot(file: string = snapshotFile): void {
  mkdirSync(dirname(file), { recursive: true });
  const snapshot: Snapshot = { pid: process.pid, writtenAt: Date.now(), mandates: [...mandates.values()].map(toSnapshot) };
  const temp = `${file}.${process.pid}.tmp`;
  writeFileSync(temp, JSON.stringify(snapshot, null, 2), { mode: 0o600 });
  renameSync(temp, file);
}

export function readMandatesSnapshot(file: string = snapshotFile): Snapshot | null {
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as Snapshot;
  } catch {
    return null;
  }
}
