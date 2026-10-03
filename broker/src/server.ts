// Phase 2: the broker as a local HTTP server.
// The agent talks to it over HTTP; every Gmail endpoint goes through check() first.
// Run: npm run server
import { existsSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { join } from "node:path";
import { askInTerminal, decide } from "./approval.ts";
import { check, type CheckCode } from "./check.ts";
import { createDraft, listInbox, sendEmail } from "./gmail-fake.ts";
import { mandates, requestMandate, type Mandate } from "./mandate.ts";
import { sendApprovalRequest, startTelegramPolling, type TelegramConfig } from "./telegram.ts";

// --- configuration from broker/.env (secrets live there, never in the code) ---

const envFile = join(import.meta.dirname, "..", ".env");
if (existsSync(envFile)) {
  process.loadEnvFile(envFile); // built into Node: puts the lines of .env into process.env
}

const HOST = "127.0.0.1"; // only programs on THIS computer can connect
const PORT = Number(process.env.BROKER_PORT ?? 8787);

function telegramConfig(): TelegramConfig | undefined {
  const botToken = process.env.TELEGRAM_BOT_TOKEN ?? "";
  if (botToken === "") return undefined; // no bot: approve in the terminal instead

  const approverId = Number(process.env.TELEGRAM_USER_ID);
  if (!Number.isInteger(approverId) || approverId <= 0) {
    // A bot without an approver would let anyone approve. Refuse to start.
    throw new Error("TELEGRAM_BOT_TOKEN is set but TELEGRAM_USER_ID is missing or not a number");
  }
  return { botToken, approverId };
}
const telegram = telegramConfig();

// --- small HTTP helpers ---

// An error that already knows its HTTP status code.
class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function sendJson(res: ServerResponse, status: number, body: object): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

// Reads the request body as JSON. Max 10 KB, so nobody can fill our memory.
async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 10_000) throw new HttpError(413, "request body too large");
    chunks.push(chunk);
  }
  if (size === 0) return {};

  let body: unknown;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "request body is not valid JSON");
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new HttpError(400, "request body must be a JSON object");
  }
  return body as Record<string, unknown>;
}

function requireString(body: Record<string, unknown>, field: string): string {
  const value = body[field];
  if (typeof value !== "string" || value.trim() === "" || value.length > 2000) {
    throw new HttpError(400, `"${field}" must be a non-empty string`);
  }
  return value;
}

function requireNumber(body: Record<string, unknown>, field: string, max: number): number {
  const value = body[field];
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0 || value > max) {
    throw new HttpError(400, `"${field}" must be a whole number from 1 to ${max}`);
  }
  return value;
}

// "Authorization: Bearer <token>" -> "<token>"
function bearerToken(req: IncomingMessage): string {
  const header = req.headers.authorization ?? "";
  return header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
}

// 401 = "who are you?" (no valid token), 403 = "I know you, but no",
// 429 = "too many" (limit reached).
function statusFor(code: CheckCode): number {
  if (code === "unknown_token") return 401;
  if (code === "limit_reached") return 429;
  return 403;
}

// The gate in front of every Gmail endpoint.
function guard(req: IncomingMessage, action: string): void {
  const result = check(bearerToken(req), action);
  if (!result.allowed) {
    throw new HttpError(statusFor(result.code), result.reason);
  }
}

// What the agent may see about its own mandate (never other mandates, never the token).
function publicView(mandate: Mandate): object {
  return {
    id: mandate.id,
    status: mandate.status,
    revoked: mandate.revoked,
    allowedActions: mandate.allowedActions,
    expiresAt: mandate.expiresAt === 0 ? null : new Date(mandate.expiresAt).toISOString(),
    used: mandate.used,
    limit: mandate.limit,
  };
}

// --- the endpoints ---

async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const method = req.method ?? "GET";
  const path = new URL(req.url ?? "/", "http://localhost").pathname;

  // An agent asks for a mandate. It gets the token now, but the token
  // does nothing until a human approves (202 = "accepted, not done yet").
  if (method === "POST" && path === "/mandates") {
    const body = await readJson(req);
    const actions = body.allowedActions;
    if (!Array.isArray(actions) || actions.length === 0 || !actions.every((a) => typeof a === "string")) {
      throw new HttpError(400, `"allowedActions" must be a non-empty list of strings`);
    }
    const mandate = requestMandate(
      requireString(body, "agent"),
      requireString(body, "task"),
      actions,
      requireNumber(body, "expiresInSeconds", 86_400), // at most 1 day
      requireNumber(body, "limit", 1000),
    );

    if (telegram) {
      // If Telegram is down, fall back to the terminal instead of losing the request.
      await sendApprovalRequest(telegram, mandate).catch((error: Error) => {
        console.error(`Telegram: could not send the request (${error.message}), asking in the terminal`);
        askInTerminal(mandate);
      });
    } else {
      askInTerminal(mandate);
    }
    console.log(`Mandate ${mandate.id} requested by ${mandate.agent}, waiting for approval`);
    return sendJson(res, 202, { token: mandate.token, ...publicView(mandate) });
  }

  // The agent asks "what is the state of MY mandate?" (used while waiting for approval).
  if (method === "GET" && path === "/mandate") {
    const mandate = mandates.get(bearerToken(req));
    if (mandate === undefined) throw new HttpError(401, "unknown token");
    return sendJson(res, 200, publicView(mandate));
  }

  // Kill switch over HTTP. Revoking only ever removes access, so it needs no token.
  const revokeMatch = path.match(/^\/mandates\/([0-9a-f]+)\/revoke$/);
  if (method === "POST" && revokeMatch) {
    const mandate = decide(revokeMatch[1], "revoke", "http");
    if (mandate === undefined) throw new HttpError(404, "no such mandate");
    return sendJson(res, 200, publicView(mandate));
  }

  if (method === "GET" && path === "/inbox") {
    guard(req, "gmail.read");
    return sendJson(res, 200, { messages: listInbox() });
  }

  if (method === "POST" && path === "/drafts") {
    guard(req, "gmail.draft");
    const body = await readJson(req);
    const draft = createDraft(requireString(body, "to"), requireString(body, "subject"), requireString(body, "body"));
    return sendJson(res, 201, { draft }); // 201 = "created"
  }

  if (method === "POST" && path === "/send") {
    guard(req, "gmail.send");
    const body = await readJson(req);
    const email = sendEmail(requireString(body, "to"), requireString(body, "subject"), requireString(body, "body"));
    return sendJson(res, 200, { sent: email });
  }

  throw new HttpError(404, `no endpoint ${method} ${path}`);
}

const server = createServer(async (req, res) => {
  try {
    await route(req, res);
  } catch (error) {
    if (error instanceof HttpError) {
      sendJson(res, error.status, { error: error.message });
    } else {
      // Unexpected bug: log details here, tell the agent only "500".
      console.error(error);
      sendJson(res, 500, { error: "internal error" });
    }
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Broker listening on http://${HOST}:${PORT}`);
  console.log(telegram ? "Approvals: Telegram" : "Approvals: this terminal (no TELEGRAM_BOT_TOKEN in .env)");
});

if (telegram) {
  startTelegramPolling(telegram).catch((error: Error) => {
    console.error(`Telegram stopped: ${error.message}`);
    process.exit(1);
  });
}
