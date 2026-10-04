import { writeAudit } from "./audit.ts";
import { mandates, type Action } from "./mandate.ts";

// A short machine-readable name for each outcome.
// The HTTP server turns it into a status code (401, 403, 429...).
export type CheckCode =
  | "ok"
  | "unknown_token"
  | "not_approved"
  | "expired"
  | "revoked"
  | "action_not_allowed"
  | "limit_reached";

// The order of the checks. A failure code tells how far a request got: "expired" = check 3.
export const CHECK_ORDER: CheckCode[] = ["unknown_token", "not_approved", "expired", "revoked", "action_not_allowed", "limit_reached"];

// The answer to "may this agent do this action right now?"
export type CheckResult = {
  allowed: boolean;
  code: CheckCode;
  reason: string; // why, in words: shown to the agent and written to the audit log
};

// The one function the outside world calls: decide, then write it down.
// Every answer goes to the audit log, allowed or denied.
export function check(token: string, action: Action): CheckResult {
  const result = runChecks(token, action);

  // For an unknown token there is no mandate, so no agent name either.
  const agent = mandates.get(token)?.agent ?? "unknown";
  writeAudit(agent, action, result.allowed, result.reason, result.code);

  return result;
}

function deny(code: CheckCode, reason: string): CheckResult {
  return { allowed: false, code, reason };
}

// Runs the checks in order. The first failed check stops everything (early return).
function runChecks(token: string, action: Action): CheckResult {
  // 1. Token is known: we issued it ourselves
  const mandate = mandates.get(token);
  if (mandate === undefined) {
    return deny("unknown_token", "unknown token");
  }

  // 2. A human approved it (Phase 3). Must come before "expired":
  //    a pending mandate has no expiry time yet.
  if (mandate.status === "pending") {
    return deny("not_approved", "mandate is waiting for human approval");
  }
  if (mandate.status === "denied") {
    return deny("not_approved", "mandate was denied (by the human, or no answer in time)");
  }

  // 3. Not expired
  if (Date.now() > mandate.expiresAt) {
    return deny("expired", "mandate expired");
  }

  // 4. Not revoked by the human (kill switch)
  if (mandate.revoked) {
    return deny("revoked", "mandate revoked");
  }

  // 5. This action is on the list
  if (!mandate.allowedActions.includes(action)) {
    return deny("action_not_allowed", `action "${action}" is not allowed`);
  }

  // 6. Limit not reached
  if (mandate.used >= mandate.limit) {
    return deny("limit_reached", `limit of ${mandate.limit} actions reached`);
  }

  // All checks passed. Only allowed actions use up the limit.
  mandate.used += 1;
  return { allowed: true, code: "ok", reason: "ok" };
}
