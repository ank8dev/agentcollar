// Google sign-in for a desktop program (OAuth 2.0 "installed app" flow with PKCE):
// we open Google's consent page in your browser, Google sends the browser back to a tiny
// server on 127.0.0.1 with a one-time code, and we swap that code for tokens.
import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";

export type GoogleClient = { clientId: string; clientSecret: string };
export type Tokens = { accessToken: string; refreshToken: string; expiresAt: number };

// Read + drafts only. Google has no "drafts but never send" permission: gmail.compose also allows
// sending. That is exactly why the BROKER blocks gmail.send unless you approved it in a mandate.
export const SCOPES = ["https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/gmail.compose"];

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

// The JSON file you download from Google Cloud → Clients → Desktop app.
export function parseClientJson(text: string): GoogleClient {
  let data: { installed?: { client_id?: string; client_secret?: string }; web?: unknown };
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("This is not a Google client_secret JSON file.");
  }
  if (data.web !== undefined) throw new Error("This client is a Web app. Create a client of type Desktop app instead.");
  const installed = data.installed;
  if (typeof installed?.client_id !== "string" || typeof installed.client_secret !== "string") {
    throw new Error("This is not a Google client_secret JSON file (no installed.client_id).");
  }
  return { clientId: installed.client_id, clientSecret: installed.client_secret };
}

// PKCE: we keep a random secret (verifier) and send Google only its hash (challenge).
// A stolen code is useless without the verifier, which never leaves this process.
export function newPkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
}

export function buildAuthUrl(client: GoogleClient, redirectUri: string, challenge: string, state: string): string {
  const url = new URL(AUTH_URL);
  url.search = new URLSearchParams({
    client_id: client.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES.join(" "),
    code_challenge: challenge,
    code_challenge_method: "S256",
    state, // a random value: proves the answer belongs to OUR request
    access_type: "offline", // we want a refresh token
    prompt: "consent", // always show what is being granted (and always return a refresh token)
  }).toString();
  return url.toString();
}

async function postToken(params: Record<string, string>): Promise<Record<string, unknown>> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
  });
  const data = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    if (data.error === "invalid_grant") {
      throw new Error(
        "Google no longer accepts this sign-in (in Testing mode it expires after 7 days). Run: agcl gmail connect",
      );
    }
    throw new Error(`Google sign-in failed: ${String(data.error_description ?? data.error ?? response.status)}`);
  }
  return data;
}

export async function exchangeCode(client: GoogleClient, code: string, verifier: string, redirectUri: string): Promise<Tokens> {
  const data = await postToken({
    client_id: client.clientId,
    client_secret: client.clientSecret,
    code,
    code_verifier: verifier,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });
  if (typeof data.refresh_token !== "string") throw new Error("Google did not return a refresh token. Run agcl gmail connect again.");
  return {
    accessToken: String(data.access_token),
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + Number(data.expires_in ?? 3600) * 1000,
  };
}

// The access token lives about an hour and only in memory; the refresh token gets a new one.
export async function refreshAccessToken(client: GoogleClient, refreshToken: string): Promise<{ accessToken: string; expiresAt: number }> {
  const data = await postToken({
    client_id: client.clientId,
    client_secret: client.clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  return { accessToken: String(data.access_token), expiresAt: Date.now() + Number(data.expires_in ?? 3600) * 1000 };
}

export async function revokeToken(token: string): Promise<void> {
  await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: "POST" }).catch(() => {});
}

// Starts the loopback server, opens the consent page, waits (up to 5 minutes) for Google's redirect.
export function authorizeInBrowser(
  client: GoogleClient,
  openUrl: (url: string) => void,
  timeoutMs = 5 * 60 * 1000,
): Promise<{ code: string; verifier: string; redirectUri: string }> {
  const { verifier, challenge } = newPkce();
  const state = randomBytes(16).toString("hex");

  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      if (url.pathname !== "/callback") {
        res.writeHead(404).end();
        return;
      }
      if (url.searchParams.get("state") !== state) {
        res.writeHead(400, { "content-type": "text/plain" }).end("This sign-in answer does not belong to AgentCollar's request.");
        return;
      }
      const code = url.searchParams.get("code");
      if (code === null) {
        res.writeHead(400, { "content-type": "text/plain" }).end(`Google sign-in was cancelled: ${url.searchParams.get("error") ?? "no code"}`);
        finish(() => reject(new Error("Google sign-in was cancelled.")));
        return;
      }
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(
        "<!doctype html><title>AgentCollar</title><body style=\"font-family:system-ui;padding:3rem\">" +
          "<h1>AgentCollar is connected to Gmail.</h1><p>You can close this tab and go back to the terminal.</p>",
      );
      finish(() => resolve({ code, verifier, redirectUri }));
    });

    let redirectUri = "";
    const timer = setTimeout(() => finish(() => reject(new Error("No answer from Google in 5 minutes."))), timeoutMs);
    function finish(then: () => void): void {
      clearTimeout(timer);
      server.close();
      then();
    }

    // port 0 = any free port; 127.0.0.1 = reachable only from this computer
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address !== null ? address.port : 0;
      redirectUri = `http://127.0.0.1:${port}/callback`;
      openUrl(buildAuthUrl(client, redirectUri, challenge, state));
    });
  });
}
