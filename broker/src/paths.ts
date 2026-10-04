// Where AgentCollar keeps YOUR data: one folder, ~/.agentcollar/, readable only by you.
// Not inside the code folder: when AgentCollar is installed from npm, the code folder is
// shared and replaced on every update, and a secret there could end up in git.
import { chmodSync, copyFileSync, existsSync, mkdirSync, renameSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

// AGENTCOLLAR_HOME moves everything elsewhere (the tests use a temp folder).
export const homeDir = process.env.AGENTCOLLAR_HOME ?? join(homedir(), ".agentcollar");

export const envFile = join(homeDir, ".env"); // Telegram bot token + your user id
export const auditLogFile = join(homeDir, "audit.log"); // every check and every human decision
export const snapshotFile = join(homeDir, "mandates.json"); // for `agentcollar mandates`

// 700: only your macOS user can open the folder at all. chmod also fixes an existing folder.
export function ensureHome(): void {
  mkdirSync(homeDir, { recursive: true, mode: 0o700 });
  chmodSync(homeDir, 0o700);
}

// Before this version the data lived in the code folder: broker/.env and broker/data/audit.log.
export const legacyFiles = {
  env: join(import.meta.dirname, "..", ".env"),
  audit: join(import.meta.dirname, "..", "data", "audit.log"),
};

type Files = { env: string; audit: string };

// Moves old files to the new place. Never overwrites: if the new place already has a file,
// the old one stays where it is. Returns which files were moved.
export function migrateLegacy(legacy: Files = legacyFiles, target: Files = { env: envFile, audit: auditLogFile }): (keyof Files)[] {
  const moved: (keyof Files)[] = [];
  for (const key of ["env", "audit"] as const) {
    if (!existsSync(legacy[key]) || existsSync(target[key])) continue;
    mkdirSync(dirname(target[key]), { recursive: true, mode: 0o700 });
    try {
      renameSync(legacy[key], target[key]);
    } catch {
      // rename cannot cross disks: copy, then remove the original
      copyFileSync(legacy[key], target[key]);
      unlinkSync(legacy[key]);
    }
    chmodSync(target[key], 0o600);
    moved.push(key);
  }
  return moved;
}
