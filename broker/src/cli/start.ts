// `agcl` with no command: the intro, then the setup wizard if Telegram is not set up yet,
// then the broker itself. One word from install to a running broker.
import "../env.ts";
import { existsSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { envFile } from "../paths.ts";
import type { Flags } from "./main.ts";

async function ask(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(question);
  rl.close();
  return answer.trim().toLowerCase();
}

export async function runStart(flags: Flags): Promise<number> {
  await (await import("./intro.ts")).maybeIntro(flags.noIntro);

  // Ask only a person at a terminal; a script or pipe goes straight to the server.
  const configured = (process.env.TELEGRAM_BOT_TOKEN ?? "") !== "";
  if (!configured && process.stdin.isTTY) {
    const answer = await ask("Telegram is not set up yet. Set it up now? [Y/n] (n = approve requests in this terminal) ");
    if (answer === "" || answer === "y") {
      const code = await (await import("./setup.ts")).runSetup();
      if (code !== 0) return code;
      if (existsSync(envFile)) process.loadEnvFile(envFile); // the server reads the new settings
    }
  }

  await import("../server.ts");
  return new Promise<number>(() => {}); // the server runs until Ctrl+C
}
