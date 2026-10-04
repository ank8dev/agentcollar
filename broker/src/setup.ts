// Logic of the setup wizard (agcl setup), with no terminal input/output,
// so every piece can be tested. The dialog itself is in src/cli/setup.ts.
import { randomInt } from "node:crypto";
import { chmodSync, writeFileSync } from "node:fs";
import { oneLine } from "./approval.ts";

// "123456789:AAH..." — digits, a colon, then letters/digits/_/-. Nothing else:
// no spaces and no line breaks, so the token cannot inject extra lines into .env.
const TOKEN_FORMAT = /^\d{5,}:[A-Za-z0-9_-]{30,}$/;

export function isTokenFormat(token: string): boolean {
  return TOKEN_FORMAT.test(token);
}

// No 0/O and no 1/I/L: easy to read and compare.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

// One-time code for the Start link. Only "/start <this code>" counts, so a stranger
// who presses Start in our bot at the same moment cannot become the approver.
export function newStartCode(): string {
  let code = "";
  for (let i = 0; i < 8; i++) code += ALPHABET[randomInt(ALPHABET.length)];
  return code;
}

export type TelegramUser = { id: number; firstName: string; username?: string };

// The small part of Telegram's update format we need here.
type Update = {
  update_id: number;
  message?: {
    from?: { id: number; first_name?: string; username?: string };
    chat: { type: string };
    text?: string;
  };
};

// The person who sent "/start <code>" in a private chat with the bot, if any.
// Names come from Telegram (anyone can choose them), so they are cleaned before printing.
export function findStarter(updates: Update[], code: string): TelegramUser | undefined {
  for (const update of updates) {
    const message = update.message;
    if (message?.from === undefined || message.chat.type !== "private") continue;
    if ((message.text ?? "").trim() !== `/start ${code}`) continue;

    const user: TelegramUser = { id: message.from.id, firstName: oneLine(message.from.first_name ?? "", 64) };
    if (message.from.username !== undefined) user.username = oneLine(message.from.username, 64);
    return user;
  }
  return undefined;
}

// Replaces "KEY=..." lines for the given keys and keeps every other line as it was
// (comments, BROKER_PORT...). Keys that were not there are added at the end.
export function buildEnv(existing: string, values: Record<string, string>): string {
  const lines = existing === "" ? [] : existing.replace(/\n$/, "").split("\n");
  const missing = new Set(Object.keys(values));

  const updated = lines.map((line) => {
    const key = line.split("=")[0]?.trim() ?? "";
    if (key in values && !line.trimStart().startsWith("#")) {
      missing.delete(key);
      return `${key}=${values[key]}`;
    }
    return line;
  });
  for (const key of missing) updated.push(`${key}=${values[key]}`);

  return updated.join("\n") + "\n";
}

// mode 600: only your macOS user can read the file. writeFileSync's mode only applies
// to NEW files, so chmod also fixes a file that already existed with looser rights.
export function writeEnvFile(file: string, text: string): void {
  writeFileSync(file, text, { mode: 0o600 });
  chmodSync(file, 0o600);
}

// --- Telegram ---

async function call(token: string, method: string, params: object): Promise<unknown> {
  // The token is part of the URL, so we never print the URL.
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(params),
  });
  const data = (await response.json()) as { ok: boolean; result?: unknown; error_code?: number; description?: string };
  if (data.ok) return data.result;

  if (data.error_code === 401) throw new Error("Telegram does not know this token. Copy it again from @BotFather (/mybots → your bot → API Token).");
  if (data.error_code === 409) throw new Error("Another program is already listening to this bot. Stop agcl server, then run agcl setup again.");
  throw new Error(`Telegram ${method}: ${data.description}`);
}

// Checks the token for real (getMe) and returns the bot's @username.
export async function getBotUsername(token: string): Promise<string> {
  if (!isTokenFormat(token)) throw new Error("This does not look like a bot token (it looks like 123456789:AAH...).");
  const me = (await call(token, "getMe", {})) as { username: string };
  return me.username;
}

// Forgets every message sent to the bot so far and returns the offset to continue from.
// (offset -1 = "only the very last update"; Telegram then drops everything before it.)
export async function skipOldUpdates(token: string): Promise<number> {
  const updates = (await call(token, "getUpdates", { offset: -1, timeout: 0 })) as Update[];
  const last = updates[updates.length - 1];
  return last === undefined ? 0 : last.update_id + 1;
}

// One long-polling round (up to 25 s): did OUR /start arrive?
export async function pollForStart(token: string, code: string, offset: number): Promise<{ user?: TelegramUser; offset: number }> {
  const updates = (await call(token, "getUpdates", { offset, timeout: 25, allowed_updates: ["message"] })) as Update[];
  const last = updates[updates.length - 1];
  return { user: findStarter(updates, code), offset: last === undefined ? offset : last.update_id + 1 };
}

export async function sendText(token: string, chatId: number, text: string): Promise<void> {
  await call(token, "sendMessage", { chat_id: chatId, text });
}
