// The small part of MCP (Model Context Protocol) we need: tools over JSON-RPC 2.0.
// One message = one line of JSON. A request has an "id" and gets a reply with the same id;
// a notification has no "id" and gets no reply. This file knows nothing about the broker.

export type ToolResult = {
  content: { type: "text"; text: string }[];
  isError?: boolean; // the tool ran but failed (e.g. the broker said 403): the model should read why
};

export type Tool = {
  name: string;
  description: string; // read by the model: when and how to use the tool
  inputSchema: object; // JSON Schema of the arguments
  call(args: Record<string, unknown>): Promise<ToolResult>;
};

export type Context = {
  tools: Tool[];
  onInitialize?: (clientName: string) => void; // e.g. "claude-code", used as the agent name
};

// Newest first. If the client asks for one of these, we answer with it; otherwise with the newest.
export const SUPPORTED_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];

const SERVER_INFO = { name: "agentcollar", version: "0.1.0" };

const INSTRUCTIONS =
  "AgentCollar guards the human's accounts. First call request_mandate with only the actions you need; " +
  "the human approves it in Telegram. Poll mandate_status until it is approved, then pass the mandateId " +
  "to the gmail_* tools. Refusals are final: explain them to the human instead of retrying.";

type Id = string | number | null;

function reply(id: Id, result: unknown): string {
  return JSON.stringify({ jsonrpc: "2.0", id, result });
}

function error(id: Id, code: number, message: string): string {
  return JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } });
}

// Handles one incoming line. Returns the reply line, or null when no reply is due.
export async function handleMessage(line: string, context: Context): Promise<string | null> {
  if (line.trim() === "") return null;

  let message: unknown;
  try {
    message = JSON.parse(line);
  } catch {
    return error(null, -32700, "Parse error");
  }

  if (typeof message !== "object" || message === null || Array.isArray(message)) {
    return error(null, -32600, "Invalid Request");
  }
  const m = message as { jsonrpc?: unknown; id?: unknown; method?: unknown; params?: unknown };
  const id: Id = typeof m.id === "string" || typeof m.id === "number" ? m.id : null;
  if (m.jsonrpc !== "2.0" || typeof m.method !== "string") return error(id, -32600, "Invalid Request");

  if (m.id === undefined) return null; // a notification, e.g. "notifications/initialized"

  const params = (typeof m.params === "object" && m.params !== null ? m.params : {}) as Record<string, unknown>;

  switch (m.method) {
    case "initialize": {
      const requested = params.protocolVersion;
      const version =
        typeof requested === "string" && SUPPORTED_VERSIONS.includes(requested) ? requested : SUPPORTED_VERSIONS[0];
      const clientInfo = params.clientInfo as { name?: unknown } | undefined;
      if (typeof clientInfo?.name === "string") context.onInitialize?.(clientInfo.name);
      return reply(id, { protocolVersion: version, capabilities: { tools: {} }, serverInfo: SERVER_INFO, instructions: INSTRUCTIONS });
    }

    case "ping":
      return reply(id, {});

    case "tools/list":
      return reply(id, {
        tools: context.tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
      });

    case "tools/call": {
      const tool = context.tools.find((t) => t.name === params.name);
      if (tool === undefined) return error(id, -32602, `Unknown tool: ${String(params.name)}`);
      const args = params.arguments ?? {};
      if (typeof args !== "object" || args === null || Array.isArray(args)) {
        return error(id, -32602, "arguments must be an object");
      }
      try {
        return reply(id, await tool.call(args as Record<string, unknown>));
      } catch (e) {
        // Details go to stderr for the human; the model only learns that it failed.
        console.error(`agentcollar mcp: tool ${tool.name} failed: ${(e as Error).message}`);
        return reply(id, { content: [{ type: "text", text: `Tool ${tool.name} failed inside AgentCollar.` }], isError: true });
      }
    }

    default:
      return error(id, -32601, `Method not found: ${m.method}`);
  }
}
