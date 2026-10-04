// Which mailbox the broker uses: your real Gmail if `agcl gmail connect` was done, otherwise the fake one.
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { createFakeMailbox } from "../gmail-fake.ts";
import type { Mailbox } from "../mailbox.ts";
import { ensureHome, gmailInfoFile, googleClientFile } from "../paths.ts";
import { createGmailMailbox } from "./gmail.ts";
import { keychain, type SecretStore } from "./keychain.ts";
import { parseClientJson } from "./oauth.ts";

export const REFRESH_TOKEN_ACCOUNT = "gmail-refresh-token";

export type GmailInfo = { email: string; connectedAt: string };

export function readGmailInfo(): GmailInfo | null {
  if (!existsSync(gmailInfoFile)) return null;
  try {
    return JSON.parse(readFileSync(gmailInfoFile, "utf8")) as GmailInfo;
  } catch {
    return null;
  }
}

export function saveConnection(info: GmailInfo, refreshToken: string, store: SecretStore = keychain): void {
  ensureHome();
  store.set(REFRESH_TOKEN_ACCOUNT, refreshToken); // the secret goes to the Keychain…
  writeFileSync(gmailInfoFile, JSON.stringify(info, null, 2), { mode: 0o600 }); // …the file has only the address
}

export function forgetConnection(store: SecretStore = keychain): string | null {
  const token = store.get(REFRESH_TOKEN_ACCOUNT);
  store.remove(REFRESH_TOKEN_ACCOUNT);
  if (existsSync(gmailInfoFile)) unlinkSync(gmailInfoFile);
  return token;
}

export function loadMailbox(store: SecretStore = keychain): Mailbox {
  const refreshToken = store.get(REFRESH_TOKEN_ACCOUNT);
  if (refreshToken === null || !existsSync(googleClientFile)) return createFakeMailbox();
  return createGmailMailbox(parseClientJson(readFileSync(googleClientFile, "utf8")), refreshToken);
}
