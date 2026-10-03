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

// Text written by the agent (its name, the task) is shown to the human, so a bad agent
// could try to fake lines like "Действия: gmail.read" with line breaks, or hide text with
// invisible / right-to-left characters. We squash it into one short, plain line.
export function oneLine(text: string, max: number): string {
  const plain = text
    .replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, " ") // line breaks, control chars
    .replace(/[\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, "") // invisible, direction tricks
    .replace(/\s+/g, " ")
    .trim();
  return plain.length > max ? plain.slice(0, max) + "…" : plain;
}

// Human-readable summary, used in the terminal and in Telegram.
// The facts the broker enforces come FIRST; the agent's own words come last, in quotes.
export function describe(mandate: Mandate): string {
  const lines: string[] = [];
  if (mandate.allowedActions.some((action) => action.endsWith(".send"))) {
    lines.push("⚠️ Агент просит право ОТПРАВЛЯТЬ от твоего имени");
  }
  lines.push(
    `Действия: ${mandate.allowedActions.join(", ")}`,
    `Срок: ${mandate.expiresInSeconds} с после одобрения, лимит ${mandate.limit}`,
    `id: ${mandate.id}`,
    `Агент: ${oneLine(mandate.agent, 64)}`,
    `Задача (слова агента): «${oneLine(mandate.task, 200)}»`,
  );
  return lines.join("\n");
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
