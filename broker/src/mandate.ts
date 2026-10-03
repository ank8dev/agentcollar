import { randomBytes } from "node:crypto";

// An action is "app.verb": "gmail.read", "gmail.draft", "gmail.send", later "calendar.create"...
// The broker core never needs to know which apps exist: it only compares strings.
export type Action = string;

// Everything the broker remembers about one mandate.
export type Mandate = {
  token: string;
  agent: string; // who got it, e.g. "morning-digest-agent"
  task: string; // why, in human words
  allowedActions: Action[];
  expiresAt: number; // milliseconds since 1970, same format as Date.now()
  limit: number; // max number of allowed actions
  used: number; // allowed actions so far
  revoked: boolean;
};

// In-memory store: token -> mandate.
// It disappears when the program stops. That is fine for Phase 1.
export const mandates = new Map<string, Mandate>();

export function issueMandate(
  agent: string,
  task: string,
  allowedActions: Action[],
  expiresInSeconds: number,
  limit: number,
): string {
  // 32 random bytes = 256 bits: impossible to guess. As hex text it is 64 characters.
  const token = randomBytes(32).toString("hex");

  mandates.set(token, {
    token,
    agent,
    task,
    allowedActions,
    expiresAt: Date.now() + expiresInSeconds * 1000,
    limit,
    used: 0,
    revoked: false,
  });

  return token;
}

// Kill switch: the human stops a mandate immediately.
// We mark it instead of deleting it, so check() can still say "revoked" (not "unknown")
// and the audit log still knows which agent it belonged to.
// Returns false if there was no such mandate.
export function revoke(token: string): boolean {
  const mandate = mandates.get(token);
  if (mandate === undefined) {
    return false;
  }

  mandate.revoked = true;
  return true;
}
