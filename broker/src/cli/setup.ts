// agcl setup (= agentcollar setup, npm run setup) — connects the broker to YOUR Telegram bot, without editing files by hand.
// 1) asks for the bot token and checks it with Telegram,
// 2) you press Start in the bot: we take your user id from that message,
// 3) writes ~/.agentcollar/.env readable only by you (600).
import { existsSync, readFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { ensureHome, envFile, homeDir, legacyFiles, migrateLegacy } from "../paths.ts";
import {
  buildEnv,
  getBotUsername,
  newStartCode,
  pollForStart,
  sendText,
  skipOldUpdates,
  writeEnvFile,
  type TelegramUser,
} from "../setup.ts";

const WAIT_MS = 5 * 60 * 1000;

async function ask(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    // If the input ends before an answer (Ctrl+D, closed pipe), fail loudly instead of exiting silently.
    const answer = await new Promise<string>((resolve, reject) => {
      rl.question(question).then(resolve, reject);
      rl.once("close", () => reject(new Error("input ended, nothing was written")));
    });
    return answer.trim();
  } finally {
    rl.close();
  }
}

const yes = (answer: string) => answer.toLowerCase() === "y";

// Reads a line without showing it (for the token). Node has no ready-made "password input",
// so we switch the terminal to raw mode and read key by key, printing nothing.
function askHidden(question: string): Promise<string> {
  const stdin = process.stdin;
  if (!stdin.isTTY) return ask(question); // input is piped, not typed: nothing to hide

  return new Promise((resolve) => {
    process.stdout.write(question);
    stdin.setRawMode(true);
    stdin.setEncoding("utf8");
    stdin.resume();
    let value = "";

    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === "\r" || char === "\n") {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off("data", onData);
          process.stdout.write("\n");
          return resolve(value.trim());
        }
        if (char === "\u0003") process.exit(130); // Ctrl+C
        if (char === "\u007f") value = value.slice(0, -1); // Backspace
        else value += char;
      }
    };
    stdin.on("data", onData);
  });
}

export async function runSetup(): Promise<number> {
  try {
    return await setup();
  } catch (error) {
    console.error(`\n✗ ${(error as Error).message}`);
    return 1;
  }
}

async function setup(): Promise<number> {
  console.log("AgentCollar setup\n");

  // Older versions kept the data inside the code folder (broker/.env, broker/data/audit.log).
  const oldFiles = [legacyFiles.env, legacyFiles.audit].filter((file) => existsSync(file));
  if (oldFiles.length > 0) {
    console.log(`Found data from an older version:\n${oldFiles.map((f) => `  ${f}`).join("\n")}`);
    if (yes(await ask(`Move it to ${homeDir}/ (only you can open that folder)? [y/N] `))) {
      const moved = migrateLegacy();
      console.log(moved.length > 0 ? `✓ Moved: ${moved.join(", ")}\n` : "Files already exist there; the old ones stay where they are.\n");
    }
  }

  if (existsSync(envFile) && !yes(await ask(`${envFile} already exists. Replace the Telegram settings? [y/N] `))) {
    console.log("Nothing changed.");
    return 0;
  }

  // 1. Token
  let token = "";
  let username = "";
  while (username === "") {
    token = await askHidden("Bot token (from @BotFather, hidden while you type): ");
    try {
      username = await getBotUsername(token);
    } catch (error) {
      console.log(`✗ ${(error as Error).message}\n`);
    }
  }
  console.log(`✓ Bot found: @${username}\n`);

  // 2. Start with a one-time code
  const code = newStartCode();
  let offset = await skipOldUpdates(token);
  console.log(`Open this link and press Start:  https://t.me/${username}?start=${code}`);
  console.log("Waiting (up to 5 minutes)...");

  let user: TelegramUser | undefined;
  const deadline = Date.now() + WAIT_MS;
  while (user === undefined && Date.now() < deadline) {
    const round = await pollForStart(token, code, offset);
    user = round.user;
    offset = round.offset;
  }
  await skipOldUpdates(token); // tell Telegram we handled these messages
  if (user === undefined) {
    console.log("Timed out. Run agcl setup again.");
    return 1;
  }

  const who = [user.firstName, user.username ? `@${user.username}` : "", `id ${user.id}`].filter(Boolean).join(", ");
  if (!yes(await ask(`✓ Is this you? ${who} [y/N] `))) {
    console.log("Nothing was written. Run agcl setup again.");
    return 1;
  }

  // 3. ~/.agentcollar/.env, readable only by you
  ensureHome();
  const existing = existsSync(envFile) ? readFileSync(envFile, "utf8") : "";
  writeEnvFile(envFile, buildEnv(existing, { TELEGRAM_BOT_TOKEN: token, TELEGRAM_USER_ID: String(user.id) }));
  await sendText(token, user.id, "✅ AgentCollar is set up. Mandate requests will arrive here.").catch(() => {});

  console.log(`✓ Saved to ${envFile} (mode 600: only your macOS user can read it)`);
  console.log("Next: agcl server (or just agcl)");
  return 0;
}
