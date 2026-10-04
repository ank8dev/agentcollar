import { randomBytes } from "node:crypto";

// An action is "app.verb": "gmail.read", "gmail.draft", "gmail.send", later "calendar.create"...
// The broker core never needs to know which apps exist: it only compares strings.
export type Action = string;

// pending: the agent asked, the human has not answered yet.
// approved: the human said yes, the mandate works (until it expires or is revoked).
// denied: the human said no, the mandate never works.
export type MandateStatus = "pending" | "approved" | "denied";

// Everything the broker remembers about one mandate.
export type Mandate = {
  id: string; // public name, safe to show (Telegram, URLs, logs)
  token: string; // secret, only the agent has it
  agent: string; // who asked, e.g. "digest-agent"
  task: string; // why, in human words
  allowedActions: Action[];
  status: MandateStatus;
  expiresInSeconds: number; // how long it lives once approved
  expiresAt: number; // milliseconds since 1970; 0 until approved (the clock starts on approval)
  limit: number; // max number of allowed actions
  used: number; // allowed actions so far
  revoked: boolean;
  createdAt: number; // when the agent asked (milliseconds); used for the 10-minute pending timeout
};

// In-memory store: token -> mandate.
// It disappears when the program stops. That is fine for now.
export const mandates = new Map<string, Mandate>();

// An agent asks for a mandate. It stays "pending" until a human decides.
export function requestMandate(
  agent: string,
  task: string,
  allowedActions: Action[],
  expiresInSeconds: number,
  limit: number,
): Mandate {
  const mandate: Mandate = {
    id: randomBytes(4).toString("hex"), // 8 characters, easy to read; not a secret
    // 32 random bytes = 256 bits: impossible to guess. As hex text it is 64 characters.
    token: randomBytes(32).toString("hex"),
    agent,
    task,
    allowedActions,
    status: "pending",
    expiresInSeconds,
    expiresAt: 0,
    limit,
    used: 0,
    revoked: false,
    createdAt: Date.now(),
  };
  mandates.set(mandate.token, mandate);
  return mandate;
}

// Shortcut used by the Phase 1 demo: request + approve at once, returns the token.
export function issueMandate(
  agent: string,
  task: string,
  allowedActions: Action[],
  expiresInSeconds: number,
  limit: number,
): string {
  const mandate = requestMandate(agent, task, allowedActions, expiresInSeconds, limit);
  approve(mandate.id);
  return mandate.token;
}

// The human side only knows the public id, never the token.
export function findById(id: string): Mandate | undefined {
  for (const mandate of mandates.values()) {
    if (mandate.id === id) return mandate;
  }
  return undefined;
}

// Pending mandates nobody answered for longer than maxAgeMs (the server uses 10 minutes).
export function findStalePending(maxAgeMs: number, now: number = Date.now()): Mandate[] {
  return [...mandates.values()].filter((mandate) => mandate.status === "pending" && now - mandate.createdAt > maxAgeMs);
}

// Human says yes. Only a pending mandate can be decided, and only once.
export function approve(id: string): Mandate | undefined {
  const mandate = findById(id);
  if (mandate === undefined || mandate.status !== "pending") return undefined;

  mandate.status = "approved";
  mandate.expiresAt = Date.now() + mandate.expiresInSeconds * 1000;
  return mandate;
}

// Human says no.
export function deny(id: string): Mandate | undefined {
  const mandate = findById(id);
  if (mandate === undefined || mandate.status !== "pending") return undefined;

  mandate.status = "denied";
  return mandate;
}

// Kill switch: the human stops a mandate immediately.
// We mark it instead of deleting it, so check() can still say "revoked" (not "unknown")
// and the audit log still knows which agent it belonged to.
// Phase 1 passed the token; now the human side uses the public id.
export function revoke(id: string): Mandate | undefined {
  const mandate = findById(id);
  if (mandate === undefined) return undefined;

  mandate.revoked = true;
  return mandate;
}
