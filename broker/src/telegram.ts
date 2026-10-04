// Telegram channel for human approval, using the Bot API directly with fetch.
// Long polling: we ask Telegram "anything new?" and it holds the request open
// up to 30 seconds until something happens. No public server or webhook needed.
import { setTimeout as sleep } from "node:timers/promises";
import { decide, describe, type Decision } from "./approval.ts";
import type { Mandate } from "./mandate.ts";

export type TelegramConfig = {
  botToken: string; // secret, from .env
  approverId: number; // the ONLY Telegram user allowed to press the buttons
};

// The small part of Telegram's data that we use.
type CallbackQuery = {
  id: string;
  from: { id: number };
  data?: string;
  message?: { message_id: number; chat: { id: number } };
};
type Update = { update_id: number; callback_query?: CallbackQuery };
type InlineButton = { text: string; callback_data: string };

// One Bot API call. The bot token is part of the URL, so we never print the URL.
async function callApi(config: TelegramConfig, method: string, params: object): Promise<unknown> {
  const response = await fetch(`https://api.telegram.org/bot${config.botToken}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(params),
  });
  const data = (await response.json()) as { ok: boolean; result?: unknown; description?: string };
  if (!data.ok) {
    throw new Error(`Telegram ${method} failed: ${data.description}`);
  }
  return data.result;
}

function buttons(mandate: Mandate): InlineButton[][] {
  if (mandate.status === "pending") {
    return [[
      { text: "✅ Одобрить", callback_data: `approve:${mandate.id}` },
      { text: "❌ Отклонить", callback_data: `deny:${mandate.id}` },
    ]];
  }
  if (mandate.status === "approved" && !mandate.revoked) {
    return [[{ text: "🛑 Отозвать", callback_data: `revoke:${mandate.id}` }]];
  }
  return []; // denied or revoked: nothing left to press
}

function statusLine(mandate: Mandate): string {
  if (mandate.revoked) return "🛑 Отозван";
  if (mandate.status === "approved") return "✅ Одобрен";
  if (mandate.status === "denied") return "❌ Отклонён";
  return "⏳ Ждёт решения";
}

// Which Telegram message shows which mandate, so it can be edited later (e.g. on timeout).
const sentMessages = new Map<string, { chatId: number; messageId: number }>(); // mandate id -> message

// Sent when an agent asks for a mandate. Only the public id goes to Telegram, never the token.
// Plain text (no parse_mode): the agent wrote the task text, so we do not let it format anything.
export async function sendApprovalRequest(config: TelegramConfig, mandate: Mandate): Promise<void> {
  const message = (await callApi(config, "sendMessage", {
    chat_id: config.approverId, // in a private chat, chat id = user id
    text: `🔐 Запрос мандата\n\n${describe(mandate)}\n\n${statusLine(mandate)}`,
    reply_markup: { inline_keyboard: buttons(mandate) },
  })) as { message_id: number };
  sentMessages.set(mandate.id, { chatId: config.approverId, messageId: message.message_id });
}

// The mandate ended outside Telegram: the message must not keep showing live buttons.
async function closeMessage(config: TelegramConfig, mandate: Mandate, finalLine: string): Promise<void> {
  const sent = sentMessages.get(mandate.id);
  if (sent === undefined) return; // this mandate was never shown in Telegram
  sentMessages.delete(mandate.id);
  await callApi(config, "editMessageText", {
    chat_id: sent.chatId,
    message_id: sent.messageId,
    text: `🔐 Запрос мандата\n\n${describe(mandate)}\n\n${finalLine}`,
    reply_markup: { inline_keyboard: [] },
  });
}

// Nobody answered in time.
export async function notifyTimedOut(config: TelegramConfig, mandate: Mandate): Promise<void> {
  await closeMessage(config, mandate, "⌛ Время вышло");
}

// Revoked from the terminal (npm run revoke) or over HTTP.
export async function notifyRevoked(config: TelegramConfig, mandate: Mandate): Promise<void> {
  await closeMessage(config, mandate, "🛑 Отозван");
}

// A button was pressed.
async function handleButton(config: TelegramConfig, query: CallbackQuery): Promise<void> {
  // Anyone can find the bot and press buttons in a forwarded message.
  // Only the approver's presses count.
  if (query.from.id !== config.approverId) {
    console.log(`Telegram: ignored a button press from user ${query.from.id} (not the approver)`);
    await callApi(config, "answerCallbackQuery", { callback_query_id: query.id, text: "Нет доступа" });
    return;
  }

  const [action, id] = (query.data ?? "").split(":");
  const decision = action as Decision;
  const mandate =
    ["approve", "deny", "revoke"].includes(action) && id ? decide(id, decision, "telegram") : undefined;

  // Telegram shows a spinner on the button until we answer.
  await callApi(config, "answerCallbackQuery", {
    callback_query_id: query.id,
    text: mandate ? statusLine(mandate) : "Уже решено или мандат не найден",
  });

  // Update the message: new status line, new buttons (e.g. "Отозвать" after approval).
  if (mandate && query.message) {
    await callApi(config, "editMessageText", {
      chat_id: query.message.chat.id,
      message_id: query.message.message_id,
      text: `🔐 Запрос мандата\n\n${describe(mandate)}\n\n${statusLine(mandate)}`,
      reply_markup: { inline_keyboard: buttons(mandate) },
    });
  }
}

// Runs forever in the background of the server.
export async function startTelegramPolling(config: TelegramConfig): Promise<void> {
  const me = (await callApi(config, "getMe", {})) as { username: string };
  console.log(`Telegram: bot @${me.username} is listening, approver user id ${config.approverId}`);

  let offset = 0; // "give me updates newer than this one"
  while (true) {
    try {
      const updates = (await callApi(config, "getUpdates", {
        offset,
        timeout: 30, // long polling: wait up to 30 s for something new
        allowed_updates: ["callback_query"],
      })) as Update[];

      for (const update of updates) {
        offset = update.update_id + 1; // mark as handled, even if handling fails
        if (update.callback_query) {
          await handleButton(config, update.callback_query);
        }
      }
    } catch (error) {
      console.error(`Telegram: ${(error as Error).message}, retrying in 5 s`);
      await sleep(5000);
    }
  }
}
