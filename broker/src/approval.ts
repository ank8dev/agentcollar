// Phase 3: a human decides about every mandate request.
// Two channels: Telegram (if configured) or the terminal where the server runs.
import { createInterface } from "node:readline/promises";
import { writeAudit } from "./audit.ts";
import { approve, deny, revoke, type Mandate } from "./mandate.ts";

export type Decision = "approve" | "deny" | "revoke";

// The single place where a human decision is applied and written to the audit log.
// Telegram and the terminal both end up here.
export function decide(id: string, decision: Decision, by: string): Mandate | undefined {
  const mandate =
    decision === "approve" ? approve(id) : decision === "deny" ? deny(id) : revoke(id);

  if (mandate !== undefined) {
    writeAudit(mandate.agent, `mandate.${decision}`, decision === "approve", `${decision} by ${by}, mandate ${id}`);
  }
  return mandate;
}

// Human-readable summary, used in the terminal and in Telegram.
export function describe(mandate: Mandate): string {
  return [
    `Агент: ${mandate.agent}`,
    `Задача: ${mandate.task}`,
    `Действия: ${mandate.allowedActions.join(", ")}`,
    `Срок: ${mandate.expiresInSeconds} с после одобрения, лимит ${mandate.limit}`,
    `id: ${mandate.id}`,
  ].join("\n");
}

// Terminal channel. Questions are asked one at a time: if two agents ask at once,
// the second question waits until the first one is answered.
let queue: Promise<void> = Promise.resolve();

export function askInTerminal(mandate: Mandate): void {
  queue = queue.then(async () => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question(`\nНовый запрос мандата:\n${describe(mandate)}\nОдобрить? [y/N] `);
    rl.close();

    const decision = answer.trim().toLowerCase() === "y" ? "approve" : "deny";
    decide(mandate.id, decision, "terminal");
    console.log(decision === "approve" ? "  ✅ одобрен" : "  ❌ отклонён");
  });
}
