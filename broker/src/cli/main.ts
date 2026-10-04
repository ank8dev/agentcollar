// agentcollar <command> [arguments] — one entry point for managing the broker from the terminal.
// Each command lives in its own file and is loaded only when it is used.
import { styleText } from "node:util";

type Command = {
  usage: string;
  summary: string;
  run(args: string[]): Promise<number>; // returns the exit code: 0 = success
};

const COMMANDS: Record<string, Command> = {
  setup: {
    usage: "agentcollar setup",
    summary: "подключить своего Telegram-бота (мастер настройки)",
    run: async () => (await import("./setup.ts")).runSetup(),
  },
  watch: {
    usage: "agentcollar watch",
    summary: "живой экран: запросы агентов в реальном времени и 6 проверок",
    run: async (args) => (await import("./watch.ts")).runWatch(args),
  },
  logs: {
    usage: "agentcollar logs [--agent <имя>] [--denied] [--today]",
    summary: "аудит-лог: кто, что, когда, разрешено или нет",
    run: async (args) => (await import("./logs.ts")).runLogs(args),
  },
  revoke: {
    usage: "agentcollar revoke <id>",
    summary: "мгновенно отозвать мандат (kill switch)",
    run: async (args) => (await import("./revoke.ts")).runRevoke(args),
  },
};

export type Parsed =
  | { kind: "help" }
  | { kind: "unknown"; name: string }
  | { kind: "run"; name: string; args: string[]; flags: { noIntro: boolean } };

export function parseCommand(argv: string[]): Parsed {
  const noIntro = argv.includes("--no-intro");
  const [name, ...args] = argv.filter((word) => word !== "--no-intro");
  if (name === undefined || name === "help" || name === "--help" || name === "-h") return { kind: "help" };
  if (!Object.hasOwn(COMMANDS, name)) return { kind: "unknown", name };
  return { kind: "run", name, args, flags: { noIntro } };
}

function helpText(): string {
  const width = Math.max(...Object.values(COMMANDS).map((c) => c.usage.length)) + 3;
  return [
    `${styleText("bold", "AgentCollar")} — let agents work, keep the keys.`,
    "",
    "Команды:",
    ...Object.values(COMMANDS).map((c) => `  ${styleText("cyan", c.usage.padEnd(width))}${c.summary}`),
    "",
    `  ${styleText("cyan", "-h, --help".padEnd(width))}эта справка`,
  ].join("\n");
}

export async function runCli(argv: string[]): Promise<number> {
  const parsed = parseCommand(argv);
  if (parsed.kind === "help") {
    console.log(helpText());
    return 0;
  }
  if (parsed.kind === "unknown") {
    console.error(`${styleText("red", `Неизвестная команда: ${parsed.name}`)}\n\n${helpText()}`);
    return 1;
  }
  return COMMANDS[parsed.name]!.run(parsed.args);
}
