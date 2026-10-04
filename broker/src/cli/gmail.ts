// agcl gmail connect | status | disconnect — connect YOUR Gmail (read + drafts).
// The refresh token goes to the macOS Keychain; the access token only ever lives in memory.
import { execFile } from "node:child_process";
import { copyFileSync, chmodSync, existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { styleText } from "node:util";
import { forgetConnection, readGmailInfo, REFRESH_TOKEN_ACCOUNT, saveConnection } from "../google/connection.ts";
import { keychain } from "../google/keychain.ts";
import { authorizeInBrowser, exchangeCode, parseClientJson, refreshAccessToken, revokeToken, type GoogleClient } from "../google/oauth.ts";
import { ensureHome, googleClientFile } from "../paths.ts";

async function ask(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(question);
  rl.close();
  return answer.trim().toLowerCase();
}

// The newest client_secret_*.json in ~/Downloads, where Google Cloud puts it.
function findDownloadedClient(): string | null {
  const downloads = join(homedir(), "Downloads");
  if (!existsSync(downloads)) return null;
  const files = readdirSync(downloads)
    .filter((name) => name.startsWith("client_secret") && name.endsWith(".json"))
    .map((name) => join(downloads, name))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  return files[0] ?? null;
}

function loadClient(): GoogleClient {
  if (!existsSync(googleClientFile)) throw new Error("No Google client yet. Run: agcl gmail connect");
  return parseClientJson(readFileSync(googleClientFile, "utf8"));
}

async function connect(args: string[]): Promise<number> {
  // 1. The Desktop-app client file from Google Cloud
  let file = args[0] ?? null;
  if (file === null) {
    const found = findDownloadedClient();
    if (found !== null && (await ask(`Use ${found}? [Y/n] `)) !== "n") file = found;
  }
  if (file === null) {
    if (existsSync(googleClientFile)) file = googleClientFile;
    else {
      console.error("Give the client file from Google Cloud: agcl gmail connect ~/Downloads/client_secret_….json");
      return 1;
    }
  }
  const client = parseClientJson(readFileSync(file, "utf8")); // fails early if it is the wrong file
  ensureHome();
  if (file !== googleClientFile) {
    copyFileSync(file, googleClientFile);
    chmodSync(googleClientFile, 0o600);
  }

  // 2. Sign in with Google in the browser
  console.log("Opening Google in your browser. Allow: read your email + create drafts.");
  const { code, verifier, redirectUri } = await authorizeInBrowser(client, (url) => {
    console.log(styleText("dim", `If the browser did not open: ${url}`));
    execFile("open", [url], () => {});
  });
  const tokens = await exchangeCode(client, code, verifier, redirectUri);

  // 3. Which Gmail is this?
  const profile = (await (
    await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", { headers: { authorization: `Bearer ${tokens.accessToken}` } })
  ).json()) as { emailAddress?: string };
  const email = profile.emailAddress ?? "unknown";

  saveConnection({ email, connectedAt: new Date().toISOString() }, tokens.refreshToken);
  console.log(`\n${styleText("green", "✓")} Gmail connected: ${styleText("bold", email)}`);
  console.log("  Read + create drafts. This connection cannot send at all: Google itself blocks it.");
  console.log("  Refresh token: macOS Keychain. Access token: memory only.");
  console.log(styleText("yellow", "  Testing mode: Google ends this sign-in after 7 days. Then run agcl gmail connect again."));
  if (file !== googleClientFile) console.log(styleText("dim", `  You can delete ${file} now (a copy is in ${googleClientFile}).`));
  console.log("  Restart the broker to use it: agcl server");
  return 0;
}

async function status(): Promise<number> {
  const info = readGmailInfo();
  const refreshToken = keychain.get(REFRESH_TOKEN_ACCOUNT);
  if (info === null || refreshToken === null) {
    console.log("Gmail: not connected (the broker uses a fake inbox). Connect: agcl gmail connect");
    return 0;
  }
  try {
    await refreshAccessToken(loadClient(), refreshToken);
    console.log(`${styleText("green", "✓")} Gmail: ${info.email}, connected ${info.connectedAt.slice(0, 10)}, access works.`);
    return 0;
  } catch (error) {
    console.log(`${styleText("red", "✗")} Gmail: ${info.email}: ${(error as Error).message}`);
    return 1;
  }
}

async function disconnect(): Promise<number> {
  const token = forgetConnection();
  if (token !== null) await revokeToken(token); // also tell Google to cancel the access
  console.log("Gmail disconnected: the Keychain entry is deleted and Google access is revoked.");
  return 0;
}

export async function runGmail(args: string[]): Promise<number> {
  const [sub, ...rest] = args;
  try {
    if (sub === "connect") return await connect(rest);
    if (sub === "status") return await status();
    if (sub === "disconnect") return await disconnect();
  } catch (error) {
    console.error(`${styleText("red", "✗")} ${(error as Error).message}`);
    return 1;
  }
  console.error("Usage: agcl gmail connect [client_secret.json] | agcl gmail status | agcl gmail disconnect");
  return 1;
}
