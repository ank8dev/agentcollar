// agcl <command> [arguments] — one entry point for the broker. `agentcollar` is the same program:
// both names point to one file, so `agcl watch` == `agentcollar watch`.
// Each command lives in its own file and is loaded only when it is used.
import { styleText } from "node:util";
import { fit, termWidth, wrap } from "./format.ts";

export type Flags = { noIntro: boolean };

type Command = {
  usage: string;
  summary: string;
  run(args: string[], flags: Flags): Promise<number>; // returns the exit code: 0 = success
};

// Runs forever (until Ctrl+C): the server and the MCP server keep the process alive themselves.
const forever = () => new Promise<number>(() => {});

const COMMANDS: Record<string, Command> = {
  setup: {
    usage: "agcl setup",
    summary: "connect your own Telegram bot (setup wizard)",
    run: async () => (await import("./setup.ts")).runSetup(),
  },
  gmail: {
    usage: "agcl gmail connect|status|disconnect",
    summary: "connect your real Gmail (read + drafts; send stays blocked by the broker)",
    run: async (args) => (await import("./gmail.ts")).runGmail(args),
  },
  server: {
    usage: "agcl server",
    summary: "start the broker on 127.0.0.1",
    run: async () => {
      await import("../server.ts");
      return forever();
    },
  },
  watch: {
    usage: "agcl watch",
    summary: "live screen: agent requests as they happen, with the 6 checks",
    run: async (args, flags) => {
      await (await import("./intro.ts")).maybeIntro(flags.noIntro);
      return (await import("./watch.ts")).runWatch(args);
    },
  },
  mandates: {
    usage: "agcl mandates",
    summary: "mandates of the running broker: state, time and actions left",
    run: async (args) => (await import("./mandates.ts")).runMandates(args),
  },
  logs: {
    usage: "agcl logs [--agent <name>] [--denied] [--today]",
    summary: "the audit log: who, what, when, allowed or not",
    run: async (args) => (await import("./logs.ts")).runLogs(args),
  },
  revoke: {
    usage: "agcl revoke <id>",
    summary: "revoke a mandate instantly (kill switch)",
    run: async (args) => (await import("./revoke.ts")).runRevoke(args),
  },
  mcp: {
    usage: "agcl mcp",
    summary: "MCP server for Claude Code and other agents (stdio)",
    run: async () => {
      await import("../mcp/server.ts");
      return forever();
    },
  },
};

export type Parsed =
  | { kind: "default"; flags: Flags }
  | { kind: "help" }
  | { kind: "unknown"; name: string }
  | { kind: "run"; name: string; args: string[]; flags: Flags };

export function parseCommand(argv: string[]): Parsed {
  const flags = { noIntro: argv.includes("--no-intro") };
  const [name, ...args] = argv.filter((word) => word !== "--no-intro");
  if (name === undefined) return { kind: "default", flags };
  if (name === "help" || name === "--help" || name === "-h") return { kind: "help" };
  if (!Object.hasOwn(COMMANDS, name)) return { kind: "unknown", name };
  return { kind: "run", name, args, flags };
}

function helpText(): string {
  const screen = termWidth();
  const width = Math.max(...Object.values(COMMANDS).map((c) => c.usage.length)) + 3;
  // wide window: "usage   summary" on one line; narrow: the summary goes under the usage
  const row = (left: string, right: string) =>
    screen >= width + 40
      ? `  ${styleText("cyan", left.padEnd(width))}${fit(right, screen - width - 2)}`
      : `  ${styleText("cyan", fit(left, screen - 2))}\n${wrap(right, screen - 6).map((line) => `      ${line}`).join("\n")}`;
  return [
    fit(`${styleText("bold", "AgentCollar")} — let agents work, keep the keys.`, screen + 20),
    "",
    row("agcl", "intro → setup wizard (first time only) → broker"),
    ...Object.values(COMMANDS).map((c) => row(c.usage, c.summary)),
    "",
    row("--no-intro", "skip the intro"),
    row("-h, --help", "this help"),
    "",
    styleText("dim", fit("agcl is the short name of agentcollar: agcl watch == agentcollar watch", screen)),
    styleText("dim", fit("Your data: ~/.agentcollar/ (only you can open it)", screen)),
  ].join("\n");
}

export async function runCli(argv: string[]): Promise<number> {
  const parsed = parseCommand(argv);
  switch (parsed.kind) {
    case "default":
      return (await import("./start.ts")).runStart(parsed.flags);
    case "help":
      console.log(helpText());
      return 0;
    case "unknown":
      console.error(`${styleText("red", `Unknown command: ${parsed.name}`)}\n\n${helpText()}`);
      return 1;
    case "run":
      return COMMANDS[parsed.name]!.run(parsed.args, parsed.flags);
  }
}
