import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import type { Tool, ToolResult } from "../src/mcp/protocol.ts";
import { createTools } from "../src/mcp/tools.ts";

const TOKEN = "f".repeat(64);
type Request = { method: string; path: string; authorization?: string; body?: Record<string, unknown> };

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

// A pretend broker: answers by "METHOD /path" and records every request.
function fakeBroker(routes: Record<string, { status: number; body: object }>): Request[] {
  const requests: Request[] = [];
  globalThis.fetch = (async (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => {
    const path = new URL(url).pathname;
    requests.push({
      method: init.method,
      path,
      authorization: init.headers.authorization,
      body: init.body ? (JSON.parse(init.body) as Record<string, unknown>) : undefined,
    });
    const route = routes[`${init.method} ${path}`] ?? { status: 404, body: { error: "no endpoint" } };
    return { status: route.status, json: async () => route.body };
  }) as unknown as typeof fetch;
  return requests;
}

const mandateCreated = {
  "POST /mandates": { status: 202, body: { token: TOKEN, id: "a935774d", status: "pending", allowedActions: ["gmail.read"] } },
};

function tools(): Record<string, Tool> {
  const list = createTools({ brokerUrl: "http://127.0.0.1:8787", agentName: () => "claude-code", pollEveryMs: 1 });
  return Object.fromEntries(list.map((tool) => [tool.name, tool]));
}

const textOf = (result: ToolResult) => result.content.map((c) => c.text).join("\n");

test("there are exactly the 5 planned tools", () => {
  assert.deepEqual(Object.keys(tools()).sort(), [
    "gmail_create_draft",
    "gmail_read_inbox",
    "gmail_send",
    "mandate_status",
    "request_mandate",
  ]);
});

test("request_mandate asks the broker and returns the mandateId, never the token", async () => {
  const requests = fakeBroker(mandateCreated);
  const result = await tools().request_mandate!.call({ task: "Summarize", actions: ["gmail.read"], expiresInSeconds: 300, limit: 5 });
  assert.deepEqual(requests[0]?.body, {
    agent: "claude-code",
    task: "Summarize",
    allowedActions: ["gmail.read"],
    expiresInSeconds: 300,
    limit: 5,
  });
  assert.equal(result.isError, undefined);
  assert.ok(textOf(result).includes("a935774d"));
  assert.equal(textOf(result).includes(TOKEN), false);
});

test("later calls send the remembered token to the broker, and the model never sees it", async () => {
  const requests = fakeBroker({
    ...mandateCreated,
    "GET /mandate": { status: 200, body: { id: "a935774d", status: "approved" } },
    "GET /inbox": { status: 200, body: { messages: [{ id: "m1", subject: "Lunch?" }] } },
    "POST /drafts": { status: 201, body: { draft: { id: "d1" } } },
  });
  const t = tools();
  const outputs = [
    await t.request_mandate!.call({ task: "t", actions: ["gmail.read", "gmail.draft"], expiresInSeconds: 300, limit: 5 }),
    await t.mandate_status!.call({ mandateId: "a935774d" }),
    await t.gmail_read_inbox!.call({ mandateId: "a935774d" }),
    await t.gmail_create_draft!.call({ mandateId: "a935774d", to: "anna@example.com", subject: "Re", body: "Yes" }),
  ];
  assert.deepEqual(
    requests.slice(1).map((r) => r.authorization),
    [`Bearer ${TOKEN}`, `Bearer ${TOKEN}`, `Bearer ${TOKEN}`],
  );
  assert.deepEqual(requests[3]?.body, { to: "anna@example.com", subject: "Re", body: "Yes" });
  assert.ok(textOf(outputs[2]!).includes("Lunch?"));
  for (const output of outputs) assert.equal(JSON.stringify(output).includes(TOKEN), false);
});

test("an unknown mandateId is refused without calling the broker", async () => {
  const requests = fakeBroker({});
  const result = await tools().gmail_read_inbox!.call({ mandateId: "deadbeef" });
  assert.equal(result.isError, true);
  assert.match(textOf(result), /request_mandate/);
  assert.equal(requests.length, 0);
});

test("a broker refusal (403) reaches the model as an error with the reason", async () => {
  fakeBroker({ ...mandateCreated, "POST /send": { status: 403, body: { error: 'action "gmail.send" is not allowed' } } });
  const t = tools();
  await t.request_mandate!.call({ task: "t", actions: ["gmail.read"], expiresInSeconds: 300, limit: 5 });
  const result = await t.gmail_send!.call({ mandateId: "a935774d", to: "a@b.c", subject: "s", body: "b" });
  assert.equal(result.isError, true);
  assert.equal(textOf(result), 'Broker refused (403): action "gmail.send" is not allowed');
});

test("broker not running -> a clear error for the model", async () => {
  globalThis.fetch = (async () => {
    throw new TypeError("fetch failed");
  }) as unknown as typeof fetch;
  const result = await tools().request_mandate!.call({ task: "t", actions: ["gmail.read"], expiresInSeconds: 60, limit: 1 });
  assert.equal(result.isError, true);
  assert.match(textOf(result), /agcl server/);
});

test("mandate_status with waitSeconds waits until the human decides, then answers once", async () => {
  let checks = 0;
  const requests = fakeBroker({ ...mandateCreated });
  const t = tools();
  await t.request_mandate!.call({ task: "t", actions: ["gmail.read"], expiresInSeconds: 300, limit: 5 });
  // the broker says "pending" twice, then "approved"
  const realFetch2 = globalThis.fetch;
  globalThis.fetch = (async (url: string, init: { method: string; headers: Record<string, string> }) => {
    if (new URL(url).pathname === "/mandate") {
      checks++;
      const status = checks < 3 ? "pending" : "approved";
      return { status: 200, json: async () => ({ id: "a935774d", status }) };
    }
    return realFetch2(url, init as RequestInit);
  }) as unknown as typeof fetch;

  const result = await t.mandate_status!.call({ mandateId: "a935774d", waitSeconds: 10 });
  assert.equal(result.isError, undefined);
  assert.match(textOf(result), /"approved"/);
  assert.equal(checks, 3);
  assert.equal(requests.length, 1); // only the POST /mandates went to the first fake
});

test("mandate_status without waitSeconds answers immediately, even if pending", async () => {
  fakeBroker({ ...mandateCreated, "GET /mandate": { status: 200, body: { id: "a935774d", status: "pending" } } });
  const t = tools();
  await t.request_mandate!.call({ task: "t", actions: ["gmail.read"], expiresInSeconds: 300, limit: 5 });
  assert.match(textOf(await t.mandate_status!.call({ mandateId: "a935774d" })), /"pending"/);
});

test("mandate_status waiting gives up after waitSeconds and says it is still pending", async () => {
  fakeBroker({ ...mandateCreated, "GET /mandate": { status: 200, body: { id: "a935774d", status: "pending" } } });
  const t = tools();
  await t.request_mandate!.call({ task: "t", actions: ["gmail.read"], expiresInSeconds: 300, limit: 5 });
  const started = Date.now();
  const result = await t.mandate_status!.call({ mandateId: "a935774d", waitSeconds: 0.05 });
  assert.ok(Date.now() - started < 2000);
  assert.match(textOf(result), /"pending"/);
});
