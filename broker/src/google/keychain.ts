// Secrets in the macOS Keychain (encrypted by macOS, outside the repo and outside ~/.agentcollar/),
// through the built-in `security` tool. Used for the Gmail refresh token.
// Honest limit: other programs running as YOUR macOS user can also ask `security` for it.
// The Keychain protects against leaks through files, backups and git, not against malware you run.
import { execFileSync } from "node:child_process";

export type SecretStore = {
  get(account: string): string | null;
  set(account: string, value: string): void;
  remove(account: string): void;
};

const SERVICE = "agentcollar";

export const keychain: SecretStore = {
  get(account) {
    try {
      return execFileSync("security", ["find-generic-password", "-s", SERVICE, "-a", account, "-w"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trimEnd();
    } catch {
      return null; // not there (or not macOS)
    }
  },
  set(account, value) {
    // -U: update if it already exists
    execFileSync("security", ["add-generic-password", "-U", "-s", SERVICE, "-a", account, "-w", value], { stdio: "ignore" });
  },
  remove(account) {
    try {
      execFileSync("security", ["delete-generic-password", "-s", SERVICE, "-a", account], { stdio: "ignore" });
    } catch {
      // already gone
    }
  },
};

// For tests: the same interface, kept in memory.
export function memoryStore(): SecretStore {
  const values = new Map<string, string>();
  return {
    get: (account) => values.get(account) ?? null,
    set: (account, value) => void values.set(account, value),
    remove: (account) => void values.delete(account),
  };
}
