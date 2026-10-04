import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { revokeMandate } from "../src/revoke.ts";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

// A pretend broker: records the request and answers with the given status and body.
function fakeBroker(status: number, body: object): string[] {
  const urls: string[] = [];
  globalThis.fetch = (async (url: string, init: { method: string }) => {
    urls.push(`${init.method} ${url}`);
    return { ok: status < 400, status, json: async () => body };
  }) as unknown as typeof fetch;
  return urls;
}

test("revokes through the local broker's HTTP kill switch", async () => {
  const urls = fakeBroker(200, { id: "a935774d", revoked: true });
  assert.deepEqual(await revokeMandate("a935774d", 8787), { ok: true, message: "🛑 Мандат a935774d отозван" });
  assert.deepEqual(urls, ["POST http://127.0.0.1:8787/mandates/a935774d/revoke"]);
});

test("an id that is not 8 hex characters is refused without any request", async () => {
  const urls = fakeBroker(200, {});
  const result = await revokeMandate("../../x", 8787);
  assert.equal(result.ok, false);
  assert.match(result.message, /agentcollar revoke <id>/);
  assert.deepEqual(urls, []);
});

test("an unknown mandate gives the broker's reason", async () => {
  fakeBroker(404, { error: "no such mandate" });
  assert.deepEqual(await revokeMandate("deadbeef", 8787), { ok: false, message: "Не получилось: no such mandate" });
});

test("broker not running gives a clear hint", async () => {
  globalThis.fetch = (async () => {
    throw new TypeError("fetch failed");
  }) as unknown as typeof fetch;
  assert.deepEqual(await revokeMandate("deadbeef", 8787), {
    ok: false,
    message: "Брокер не отвечает. Он запущен (npm run server)?",
  });
});
