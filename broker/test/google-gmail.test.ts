import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { buildRawEmail, createGmailMailbox } from "../src/google/gmail.ts";

const client = { clientId: "id", clientSecret: "secret" };
const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const decode = (raw: string) => Buffer.from(raw, "base64url").toString("utf8");

test("a raw email has To, Subject and a UTF-8 body", () => {
  const text = decode(buildRawEmail("anna@example.com", "Lunch", "Yes, 13:00 works."));
  assert.match(text, /^To: anna@example\.com\r\n/m);
  assert.match(text, /^Subject: Lunch\r\n/m);
  assert.match(text, /charset="UTF-8"/);
  assert.ok(text.includes(Buffer.from("Yes, 13:00 works.").toString("base64")));
});

test("header injection: a line break in the subject cannot add a Bcc header", () => {
  const text = decode(buildRawEmail("anna@example.com", "Hi\r\nBcc: thief@evil.example", "body"));
  const headers = text.split("\r\n\r\n")[0] ?? "";
  assert.equal(/^Bcc:/im.test(headers), false);
});

test("a recipient that is not one plain address is refused", () => {
  assert.throws(() => buildRawEmail("anna@example.com, thief@evil.example", "s", "b"), /one email address/);
  assert.throws(() => buildRawEmail("anna@example.com\r\nBcc: x@y.z", "s", "b"), /one email address/);
});

test("a non-English subject is encoded so mail clients show it correctly", () => {
  assert.match(decode(buildRawEmail("a@b.co", "Привет", "b")), /^Subject: =\?UTF-8\?B\?/m);
});

type Call = { method: string; url: string; auth?: string; body?: Record<string, unknown> };

function fakeGoogle(): Call[] {
  const calls: Call[] = [];
  globalThis.fetch = (async (url: string, init: { method?: string; headers?: Record<string, string>; body?: string }) => {
    const method = init.method ?? "GET";
    calls.push({
      method,
      url,
      auth: init.headers?.authorization,
      body: init.body && !url.includes("oauth2") ? (JSON.parse(init.body) as Record<string, unknown>) : undefined,
    });
    const u = new URL(url);
    let json: object = {};
    if (u.host === "oauth2.googleapis.com") json = { access_token: "AT", expires_in: 3600 };
    else if (u.pathname.endsWith("/messages") && method === "GET") json = { messages: [{ id: "m1" }, { id: "m2" }] };
    else if (u.pathname.includes("/messages/m")) {
      const id = u.pathname.split("/").pop();
      json = {
        id,
        snippet: `snippet of ${id}`,
        payload: { headers: [{ name: "From", value: `${id}@example.com` }, { name: "Subject", value: `Subject ${id}` }] },
      };
    } else if (u.pathname.endsWith("/drafts")) json = { id: "d1" };
    else if (u.pathname.endsWith("/messages/send")) json = { id: "s1" };
    return { ok: true, status: 200, json: async () => json };
  }) as unknown as typeof fetch;
  return calls;
}

test("listInbox reads the inbox with a fresh access token, and the token is reused", async () => {
  const calls = fakeGoogle();
  const mailbox = createGmailMailbox(client, "RT");
  const inbox = await mailbox.listInbox();
  await mailbox.listInbox();
  assert.deepEqual(inbox[0], { id: "m1", from: "m1@example.com", subject: "Subject m1", body: "snippet of m1" });
  assert.equal(calls.filter((c) => c.url.includes("oauth2")).length, 1, "one token refresh for two calls");
  assert.ok(calls.filter((c) => c.url.includes("gmail")).every((c) => c.auth === "Bearer AT"));
});

test("createDraft creates a Gmail draft (not a sent email)", async () => {
  const calls = fakeGoogle();
  const draft = await createGmailMailbox(client, "RT").createDraft("anna@example.com", "Re: Lunch", "Yes");
  const call = calls.find((c) => c.url.endsWith("/drafts"));
  assert.equal(call?.method, "POST");
  const raw = (call?.body?.message as { raw: string }).raw;
  assert.match(decode(raw), /^To: anna@example\.com/m);
  assert.equal(draft.id, "d1");
  assert.equal(calls.some((c) => c.url.endsWith("/messages/send")), false);
});
