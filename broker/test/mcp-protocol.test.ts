import assert from "node:assert/strict";
import { test } from "node:test";
import { handleMessage, type Tool } from "../src/mcp/protocol.ts";

const echo: Tool = {
  name: "echo",
  description: "Repeats the text",
  inputSchema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] },
  call: async (args) => ({ content: [{ type: "text", text: String(args.text) }] }),
};
const broken: Tool = {
  name: "broken",
  description: "Always throws",
  inputSchema: { type: "object", properties: {} },
  call: async () => {
    throw new Error("secret internal detail");
  },
};

// Sends one JSON-RPC message and returns the parsed reply (or null for "no reply").
async function send(message: unknown, onInitialize?: (name: string) => void) {
  const raw = typeof message === "string" ? message : JSON.stringify(message);
  const reply = await handleMessage(raw, { tools: [echo, broken], onInitialize });
  return reply === null ? null : (JSON.parse(reply) as Record<string, any>);
}

test("initialize: answers with the client's protocol version, our name and tool support", async () => {
  let clientName = "";
  const reply = await send(
    { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", clientInfo: { name: "claude-code" } } },
    (name) => (clientName = name),
  );
  assert.equal(reply?.id, 1);
  assert.equal(reply?.result.protocolVersion, "2025-06-18");
  assert.equal(reply?.result.serverInfo.name, "agentcollar");
  assert.deepEqual(reply?.result.capabilities, { tools: {} });
  assert.equal(clientName, "claude-code");
});

test("initialize: an unknown protocol version gets our newest one", async () => {
  const reply = await send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "1999-01-01" } });
  assert.equal(reply?.result.protocolVersion, "2025-06-18");
});

test("notifications (no id) get no reply", async () => {
  assert.equal(await send({ jsonrpc: "2.0", method: "notifications/initialized" }), null);
  assert.equal(await send(""), null);
});

test("ping answers with an empty result", async () => {
  assert.deepEqual(await send({ jsonrpc: "2.0", id: "p", method: "ping" }), { jsonrpc: "2.0", id: "p", result: {} });
});

test("tools/list shows name, description and schema of every tool, not the code", async () => {
  const reply = await send({ jsonrpc: "2.0", id: 2, method: "tools/list" });
  assert.deepEqual(reply?.result.tools[0], { name: "echo", description: echo.description, inputSchema: echo.inputSchema });
  assert.equal(reply?.result.tools.length, 2);
});

test("tools/call runs the tool and returns its result", async () => {
  const reply = await send({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "echo", arguments: { text: "hi" } } });
  assert.deepEqual(reply?.result, { content: [{ type: "text", text: "hi" }] });
});

test("a tool that throws becomes isError, without leaking the exception text", async () => {
  const reply = await send({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "broken", arguments: {} } });
  assert.equal(reply?.result.isError, true);
  assert.equal(JSON.stringify(reply).includes("secret internal detail"), false);
});

test("unknown tool -> -32602, unknown method -> -32601", async () => {
  const noTool = await send({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "nope", arguments: {} } });
  assert.equal(noTool?.error.code, -32602);
  const noMethod = await send({ jsonrpc: "2.0", id: 6, method: "resources/list" });
  assert.equal(noMethod?.error.code, -32601);
});

test("broken JSON -> -32700 with id null; not JSON-RPC 2.0 -> -32600", async () => {
  assert.deepEqual(await send("{bad"), { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
  assert.equal((await send({ id: 7, method: "ping" }))?.error.code, -32600);
  assert.equal((await send([{ jsonrpc: "2.0", id: 8, method: "ping" }]))?.error.code, -32600);
});
