// Phase 1 demo: the whole mandate flow in the terminal, in memory, no network.
// Run: npm run demo
import { setTimeout as sleep } from "node:timers/promises";
import { styleText } from "node:util";
import { check } from "./check.ts";
import { approve, issueMandate, requestMandate, revoke } from "./mandate.ts";

// --- small printing helpers ---

function title(text: string): void {
  console.log("\n" + styleText(["bold", "cyan"], `== ${text} ==`));
}

// Show only the start of a token: even in a demo we do not print secrets in full.
function short(token: string): string {
  return token.slice(0, 8) + "…";
}

// Asks the broker, then prints the answer in green (allowed) or red (denied).
function attempt(token: string, action: string): void {
  const result = check(token, action);
  const verdict = result.allowed
    ? styleText("green", "ALLOWED")
    : styleText("red", "DENIED ");
  console.log(`  ${verdict}  ${action.padEnd(12)} ${styleText("dim", result.reason)}`);
}

// --- the story ---

title("1. Mandate issued");
const token = issueMandate(
  "digest-agent",
  "Read the inbox and prepare reply drafts",
  ["gmail.read", "gmail.draft"],
  3, // expires in 3 seconds (so the demo is short)
  5, // at most 5 actions
);
console.log(`  agent: digest-agent   allowed: gmail.read, gmail.draft   expires in 3s   limit 5`);
console.log(`  token: ${short(token)}`);

title("2. The agent works inside its mandate");
attempt(token, "gmail.read");
attempt(token, "gmail.draft");

title("3. The agent tries something it may not do");
attempt(token, "gmail.send");

title("4. Time passes...");
console.log(styleText("dim", "  waiting 4 seconds"));
await sleep(4000);

title("5. Mandate expired: everything is denied");
attempt(token, "gmail.read");
attempt(token, "gmail.draft");

title("6. Kill switch");
const second = requestMandate("digest-agent", "Second task", ["gmail.read"], 60, 5);
approve(second.id);
console.log(`  new mandate: ${second.id}   allowed: gmail.read   expires in 60s`);
attempt(second.token, "gmail.read");
revoke(second.id); // the human uses the public id, not the secret token
console.log(styleText(["bold", "yellow"], "  revoke() called by the human"));
attempt(second.token, "gmail.read");

title("Done");
console.log("  Every attempt above is also written to data/audit.log");
