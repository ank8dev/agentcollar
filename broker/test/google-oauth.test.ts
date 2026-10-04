import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { afterEach, test } from "node:test";
import {
  authorizeInBrowser,
  buildAuthUrl,
  exchangeCode,
  newPkce,
  parseClientJson,
  refreshAccessToken,
  SCOPES,
} from "../src/google/oauth.ts";

const client = { clientId: "123.apps.googleusercontent.com", clientSecret: "secret" };
const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function fakeGoogle(answer: (url: string, body: URLSearchParams) => { status: number; json: object }) {
  const calls: { url: string; body: URLSearchParams }[] = [];
  globalThis.fetch = (async (url: string, init: { body: string }) => {
    const body = new URLSearchParams(init.body);
    calls.push({ url, body });
    const reply = answer(url, body);
    return { ok: reply.status < 400, status: reply.status, json: async () => reply.json };
  }) as unknown as typeof fetch;
  return calls;
}

test("reads a Desktop-app client file and refuses a Web-app one", () => {
  assert.deepEqual(parseClientJson(JSON.stringify({ installed: { client_id: "a", client_secret: "b" } })), {
    clientId: "a",
    clientSecret: "b",
  });
  assert.throws(() => parseClientJson(JSON.stringify({ web: { client_id: "a", client_secret: "b" } })), /Desktop app/);
  assert.throws(() => parseClientJson("not json"), /client_secret/);
});

test("asks Google only for read + compose (drafts); never full mail access", () => {
  assert.deepEqual(SCOPES, ["https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/gmail.compose"]);
});

test("PKCE: the challenge is the base64url SHA-256 of the verifier", () => {
  const { verifier, challenge } = newPkce();
  assert.match(verifier, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(challenge, createHash("sha256").update(verifier).digest("base64url"));
});

test("the consent URL asks for offline access with PKCE and a state", () => {
  const url = new URL(buildAuthUrl(client, "http://127.0.0.1:5555/callback", "CHAL", "STATE"));
  assert.equal(url.origin + url.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
  assert.equal(url.searchParams.get("client_id"), client.clientId);
  assert.equal(url.searchParams.get("redirect_uri"), "http://127.0.0.1:5555/callback");
  assert.equal(url.searchParams.get("code_challenge"), "CHAL");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("state"), "STATE");
  assert.equal(url.searchParams.get("access_type"), "offline");
  assert.equal(url.searchParams.get("scope"), SCOPES.join(" "));
});

test("exchangeCode sends the code with the PKCE verifier and returns both tokens", async () => {
  const calls = fakeGoogle(() => ({ status: 200, json: { access_token: "AT", refresh_token: "RT", expires_in: 3599 } }));
  const tokens = await exchangeCode(client, "CODE", "VERIFIER", "http://127.0.0.1:5555/callback");
  assert.equal(tokens.refreshToken, "RT");
  assert.equal(tokens.accessToken, "AT");
  assert.equal(calls[0]?.url, "https://oauth2.googleapis.com/token");
  assert.equal(calls[0]?.body.get("code_verifier"), "VERIFIER");
  assert.equal(calls[0]?.body.get("grant_type"), "authorization_code");
});

test("an expired refresh token (Testing mode, 7 days) says how to reconnect", async () => {
  fakeGoogle(() => ({ status: 400, json: { error: "invalid_grant" } }));
  await assert.rejects(refreshAccessToken(client, "OLD"), /agcl gmail connect/);
});

test("the browser login: the right state gives the code, and the tab gets a page", async () => {
  let opened = "";
  const done = authorizeInBrowser(client, (url) => (opened = url));
  for (let i = 0; i < 50 && opened === ""; i++) await new Promise((r) => setTimeout(r, 10));
  const auth = new URL(opened);
  const redirect = auth.searchParams.get("redirect_uri") as string;
  assert.match(redirect, /^http:\/\/127\.0\.0\.1:\d+\/callback$/);

  const wrong = await realFetch(`${redirect}?code=X&state=wrong`);
  assert.equal(wrong.status, 400);
  const page = await realFetch(`${redirect}?code=THE_CODE&state=${auth.searchParams.get("state")}`);
  assert.equal(page.status, 200);
  const result = await done;
  assert.equal(result.code, "THE_CODE");
  assert.equal(result.redirectUri, redirect);
  assert.match(result.verifier, /^[A-Za-z0-9_-]{43}$/);
});
