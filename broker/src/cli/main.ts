// agcl <command> [arguments] — one entry point for the broker. `agentcollar` is the same program:
// both names point to one file, so `agcl watch` == `agentcollar watch`.
// Each command lives in its own file and is loaded only when it is used.
import { styleText } from "node:util";

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
    summary: "подключить своего Telegram-бота (мастер настройки)",
    run: async () => (await import("./setup.ts")).runSetup(),
  },
  server: {
    usage: "agcl server",
    summary: "запустить брокер на 127.0.0.1",
    run: async () => {
      await import("../server.ts");
      return forever();
    },
  },
  watch: {
    usage: "agcl watch",
    summary: "живой экран: запросы агентов в реальном времени и 6 проверок",
    run: async (args, flags) => {
      await (await import("./intro.ts")).maybeIntro(flags.noIntro);
      return (await import("./watch.ts")).runWatch(args);
    },
  },
  mandates: {
    usage: "agcl mandates",
    summary: "мандаты запущенного брокера: статус, сколько осталось времени и действий",
    run: async (args) => (await import("./mandates.ts")).runMandates(args),
  },
  logs: {
    usage: "agcl logs [--agent <имя>] [--denied] [--today]",
    summary: "аудит-лог: кто, что, когда, разрешено или нет",
    run: async (args) => (await import("./logs.ts")).runLogs(args),
  },
  revoke: {
    usage: "agcl revoke <id>",
    summary: "мгновенно отозвать мандат (kill switch)",
    run: async (args) => (await import("./revoke.ts")).runRevoke(args),
  },
  mcp: {
    usage: "agcl mcp",
    summary: "MCP-сервер для Claude Code и других агентов (stdio)",
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
  const width = Math.max(...Object.values(COMMANDS).map((c) => c.usage.length)) + 3;
  const row = (left: string, right: string) => `  ${styleText("cyan", left.padEnd(width))}${right}`;
  return [
    `${styleText("bold", "AgentCollar")} — let agents work, keep the keys.`,
    "",
    row("agcl", "заставка → мастер настройки (если ещё не настроен) → брокер"),
    ...Object.values(COMMANDS).map((c) => row(c.usage, c.summary)),
    "",
    row("--no-intro", "без заставки"),
    row("-h, --help", "эта справка"),
    "",
    styleText("dim", "agcl — короткое имя agentcollar: agcl watch == agentcollar watch"),
    styleText("dim", "Данные: ~/.agentcollar/ (папка доступна только тебе)"),
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
      console.error(`${styleText("red", `Неизвестная команда: ${parsed.name}`)}\n\n${helpText()}`);
      return 1;
    case "run":
      return COMMANDS[parsed.name]!.run(parsed.args, parsed.flags);
  }
}
