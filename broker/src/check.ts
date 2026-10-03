import { writeAudit } from "./audit.ts";
import { mandates, type Action } from "./mandate.ts";

// The answer to "may this agent do this action right now?"
export type CheckResult = {
  allowed: boolean;
  reason: string; // why: shown to the agent and written to the audit log
};

// The one function the outside world calls: decide, then write it down.
// Every answer goes to the audit log, allowed or denied.
export function check(token: string, action: Action): CheckResult {
  const result = runChecks(token, action);

  // For an unknown token there is no mandate, so no agent name either.
  const agent = mandates.get(token)?.agent ?? "unknown";
  writeAudit(agent, action, result);

  return result;
}

// Runs the 5 checks in order. The first failed check stops everything (early return).
function runChecks(token: string, action: Action): CheckResult {
  // 1. Token is known: we issued it ourselves
  const mandate = mandates.get(token);
  if (mandate === undefined) {
    return { allowed: false, reason: "unknown token" };
  }

  // 2. Not expired
  if (Date.now() > mandate.expiresAt) {
    return { allowed: false, reason: "mandate expired" };
  }

  // 3. Not revoked by the human (kill switch)
  if (mandate.revoked) {
    return { allowed: false, reason: "mandate revoked" };
  }

  // 4. This action is on the list
  if (!mandate.allowedActions.includes(action)) {
    return { allowed: false, reason: `action "${action}" is not allowed` };
  }

  // 5. Limit not reached
  if (mandate.used >= mandate.limit) {
    return { allowed: false, reason: `limit of ${mandate.limit} actions reached` };
  }

  // All 5 passed. Only allowed actions use up the limit.
  mandate.used += 1;
  return { allowed: true, reason: "ok" };
}
