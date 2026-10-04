// Your real Gmail, through the Gmail API. Same shape as the fake mailbox, so the broker does not care
// which one it talks to. The broker calls these ONLY after check() said yes.
import { isEmailAddress, type Draft, type Email, type Mailbox } from "../mailbox.ts";
import { refreshAccessToken, type GoogleClient } from "./oauth.ts";

const API = "https://gmail.googleapis.com/gmail/v1/users/me";

// Builds the email in the format Gmail expects ("raw" = base64url of the whole message).
// The subject comes from an agent, so line breaks are removed: otherwise "Hi\r\nBcc: thief@evil"
// would add a hidden recipient (header injection).
export function buildRawEmail(to: string, subject: string, body: string): string {
  if (!isEmailAddress(to)) throw new Error(`"to" must be one email address, got: ${JSON.stringify(to)}`);
  const cleanSubject = subject.replace(/[\r\n]+/g, " ").trim();
  // non-ASCII subjects are encoded (RFC 2047) so every mail client shows them correctly
  const encodedSubject = /^[\x20-\x7e]*$/.test(cleanSubject)
    ? cleanSubject
    : `=?UTF-8?B?${Buffer.from(cleanSubject, "utf8").toString("base64")}?=`;
  const message = [
    `To: ${to}`,
    `Subject: ${encodedSubject}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(body, "utf8").toString("base64"),
  ].join("\r\n");
  return Buffer.from(message, "utf8").toString("base64url");
}

type Header = { name: string; value: string };

export function createGmailMailbox(client: GoogleClient, refreshToken: string): Mailbox {
  // The access token lives only in this process's memory, never on disk.
  let accessToken = "";
  let expiresAt = 0;

  async function token(): Promise<string> {
    if (Date.now() > expiresAt - 60_000) {
      const fresh = await refreshAccessToken(client, refreshToken);
      accessToken = fresh.accessToken;
      expiresAt = fresh.expiresAt;
    }
    return accessToken;
  }

  async function api(method: string, path: string, body?: object): Promise<Record<string, any>> {
    const response = await fetch(API + path, {
      method,
      headers: { authorization: `Bearer ${await token()}`, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = (await response.json()) as Record<string, any>;
    if (!response.ok) throw new Error(`Gmail API: ${data.error?.message ?? response.status}`);
    return data;
  }

  return {
    kind: "gmail",
    async listInbox(): Promise<Email[]> {
      const list = await api("GET", "/messages?labelIds=INBOX&maxResults=10");
      const ids: string[] = (list.messages ?? []).map((m: { id: string }) => m.id);
      return Promise.all(
        ids.map(async (id) => {
          const m = await api("GET", `/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`);
          const headers: Header[] = m.payload?.headers ?? [];
          const header = (name: string) => headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
          return { id, from: header("From"), subject: header("Subject"), body: String(m.snippet ?? "") };
        }),
      );
    },
    async createDraft(to: string, subject: string, body: string): Promise<Draft> {
      const draft = await api("POST", "/drafts", { message: { raw: buildRawEmail(to, subject, body) } });
      return { id: String(draft.id), to, subject, body };
    },
    // AgentCollar asks Google only for read + create drafts, so this connection cannot send.
    // Even a mandate with gmail.send ends here: the email stays a draft for you to send yourself.
    async sendEmail(): Promise<Draft> {
      throw new Error("This Gmail connection cannot send: AgentCollar only has read + create-drafts access. Create a draft instead; the human sends it.");
    },
  };
}
