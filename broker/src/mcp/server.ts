// AgentCollar MCP server over stdio. Claude Code (or another agent) starts this file and
// talks to it through stdin/stdout, one JSON message per line.
// Register: claude mcp add agentcollar -- npx tsx <path>/broker/src/mcp/server.ts
// IMPORTANT: stdout belongs to the protocol. Anything else printed there breaks the connection,
// so every log line goes to stderr (console.error).
import "../env.ts";
import { createInterface } from "node:readline";
import { handleMessage } from "./protocol.ts";
import { createTools } from "./tools.ts";

const port = Number(process.env.BROKER_PORT ?? 8787);
let clientName = "mcp-agent"; // replaced by the client's name from "initialize"

const tools = createTools({ brokerUrl: `http://127.0.0.1:${port}`, agentName: () => clientName });

const lines = createInterface({ input: process.stdin });
lines.on("line", (line) => {
  handleMessage(line, { tools, onInitialize: (name) => (clientName = name) })
    .then((reply) => {
      if (reply !== null) process.stdout.write(reply + "\n");
    })
    .catch((error: Error) => console.error(`agentcollar mcp: ${error.message}`));
});

console.error(`agentcollar MCP server ready (stdio), broker at 127.0.0.1:${port}`);
