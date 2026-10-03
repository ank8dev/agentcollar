// A pretend AI agent. It knows nothing about Gmail passwords or Google tokens:
// it only talks to the broker over HTTP and carries its mandate token.
// Run (while the server is running): npm run agent
import { setTimeout as sleep } from "node:timers/promises";
import { styleText } from "node:util";

const BROKER = process.env.BROKER_URL ?? "http://127.0.0.1:8787";

type Reply = { status: number; data: Record<string, any> };

// One HTTP request to the broker. The token travels in the Authorization header.
async function call(method: string, path: string, token?: string, body?: object): Promise<Reply> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;

  const response = await fetch(BROKER + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, data: (await response.json()) as Record<string, any> };
}

function show(label: string, reply: Reply): void {
  const ok = reply.status < 400;
  const status = styleText(ok ? "green" : "red", String(reply.status));
  const detail = ok ? "" : styleText("dim", reply.data.error);
  console.log(`  ${status}  ${label}  ${detail}`);
}

console.log(styleText(["bold", "cyan"], "== 1. Asking the broker for a mandate =="));
const request = await call("POST", "/mandates", undefined, {
  agent: "digest-agent",
  task: "Read the inbox and prepare reply drafts",
  allowedActions: ["gmail.read", "gmail.draft"],
  expiresInSeconds: 300,
  limit: 10,
});
show("POST /mandates", request);
if (request.status !== 202) process.exit(1);
const token: string = request.data.token;
console.log(`  mandate ${request.data.id}: waiting for the human...`);

console.log(styleText(["bold", "cyan"], "\n== 2. Trying before approval (must be refused) =="));
show("GET /inbox", await call("GET", "/inbox", token));

// Ask every 2 seconds until the human decides (at most 5 minutes).
let status = "pending";
for (let i = 0; i < 150 && status === "pending"; i++) {
  await sleep(2000);
  status = (await call("GET", "/mandate", token)).data.status;
}
if (status !== "approved") {
  console.log(styleText("red", `  mandate ${status === "pending" ? "not decided in 5 minutes" : "denied"}, stopping`));
  process.exit(1);
}
console.log(styleText("green", "  approved!"));

console.log(styleText(["bold", "cyan"], "\n== 3. Working inside the mandate =="));
const inbox = await call("GET", "/inbox", token);
show("GET /inbox", inbox);
const first = inbox.data.messages[0];
console.log(styleText("dim", `     first email: "${first.subject}" from ${first.from}`));

const draft = await call("POST", "/drafts", token, {
  to: first.from,
  subject: `Re: ${first.subject}`,
  body: "Yes, 13:00 works for me.",
});
show("POST /drafts", draft);

console.log(styleText(["bold", "cyan"], "\n== 4. Trying to send (not in the mandate) =="));
show("POST /send", await call("POST", "/send", token, { to: first.from, subject: "Re", body: "Hi" }));

console.log(styleText(["bold", "cyan"], "\n== 5. Without a token =="));
show("GET /inbox", await call("GET", "/inbox"));
