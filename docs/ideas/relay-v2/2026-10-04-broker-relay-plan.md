> **Идея на будущее, не в планах. Вернёмся, если проект вырастет.**
> (2026-10-04: AgentCollar решено делать open-source и только локальным: каждый запускает брокер со своим ботом, без общего сервера.)

# AgentCollar Relay v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let any user link their local AgentCollar broker to one official Telegram bot (via a relay server) in about a minute, and approve mandates there — while tokens and mail never leave their computer.

**Architecture:** A new `relay/` package (WebSocket server + Telegram long polling + SQLite table of pairings) and a new `relay-client` in `broker/`. The broker opens an outbound WebSocket, authenticates with an Ed25519 challenge, sends approval requests, receives decisions and feeds them into the existing `decide()`. Relay logic lives in a transport-free `hub.ts`, so it is tested with a fake Telegram and fake connections.

**Tech Stack:** TypeScript (strict), Node 22 built-ins (`node:crypto` Ed25519, `node:sqlite`, global `WebSocket` client, `fetch`, `node:test`), `tsx`; one new runtime dependency in `relay/` only: `ws` (+ `@types/ws`).

**Spec:** `docs/superpowers/specs/2026-10-04-broker-relay-design.md`

## Global Constraints

- Node 22 built-ins only, except `ws` and `@types/ws` in `relay/` (approved). No other new dependencies anywhere.
- TypeScript `strict: true`; imports use the `.ts` extension; run with `tsx`; tests with `tsx --test` (`node:test` + `node:assert/strict`).
- Code, comments, file names, commit messages: English. Text shown to the human (Telegram, CLI output): Russian.
- Fail closed: no error path may approve anything; when the relay cannot reach the human, the broker falls back to the terminal.
- Relay stores on disk ONLY the `brokers` table (`broker_id`, `public_key`, `name`, `telegram_user_id`, `created_at`). Pairing codes, sent messages, undelivered decisions: memory only.
- Never send mandate tokens, Google tokens, mail, audit log or private keys to the relay. Never print or log the bot token.
- Telegram messages are plain text (no `parse_mode`); text written by agents/brokers goes through `oneLine()` and is shown after the facts, in quotes.
- Time limits: pairing code 10 min, undelivered decision 10 min, pending mandate 10 min.
- Rate limits: 30 `approval_request` per minute per broker; 5 `/start` attempts per minute per Telegram user; 10 registrations per hour per IP.
- Broker HTTP stays on `127.0.0.1` with the existing browser protection; pairing is NOT available over HTTP (a local agent must not be able to re-pair the broker).
- `broker/data/` and `relay/data/` are git-ignored; `.env` files are never committed.

## Review Focus

1. Relay database lost or broker deleted on the relay → broker sends `hello` with a now-unknown id → it must re-register on the next attempt, not retry forever. (Test in Task 10.)
2. `npm run pair` and `npm run server` connected at the same time with the same identity → both stay connected, both receive `paired`, decisions reach the server. (Tests in Tasks 5 and 6.)
3. Broker restarted (memory wiped) while an old Telegram request is still open → pressing «Одобрить» must not hang: the message becomes «мандат больше не существует» (`gone`). (Tests in Tasks 6 and 10.)
4. Pairing code typed by hand as `7f3k-92qd` (lowercase, dash, spaces) → still accepted. (Test in Task 3.)
5. Two quick presses (approve, then deny) → the second one changes nothing; the Telegram message shows the real final status. (Test in Task 10.)

---

## File Structure

```
relay/                         NEW package
├── .gitignore                 node_modules/, data/, .env
├── .env.example               RELAY_BOT_TOKEN, RELAY_HOST, RELAY_PORT
├── package.json               scripts: start, test, typecheck; deps: ws
├── tsconfig.json
├── src/
│   ├── protocol.ts            message types + parseBrokerMessage() (untrusted input check)
│   ├── crypto.ts              newNonce(), verifySignature() (Ed25519)
│   ├── store.ts               SQLite brokers table
│   ├── rate-limit.ts          createRateLimiter()
│   ├── pairing.ts             one-time pairing codes in memory
│   ├── format.ts              Telegram text + buttons for a request
│   ├── hub.ts                 all relay logic, no network code
│   ├── telegram-api.ts        real Telegram Bot API via fetch
│   ├── updates.ts             Telegram update -> hub call
│   └── server.ts              wires ws server + Telegram polling + hub
└── test/                      one test file per src unit (+ helpers.ts)

broker/                        EXISTING package
├── .env.example               + AGENTCOLLAR_RELAY_URL
├── package.json               + test, pair, unpair, revoke scripts
├── tsconfig.json              + include test/
├── src/
│   ├── audit.ts               + BROKER_AUDIT_LOG override (tests never touch the real log)
│   ├── mandate.ts             + createdAt, findStalePending()
│   ├── identity.ts            NEW: Ed25519 keys + brokerId in data/identity.json
│   ├── relay-client.ts        NEW: WebSocket client to the relay
│   ├── env.ts                 NEW: loads broker/.env (shared by server and CLIs)
│   ├── server.ts              + relay channel, pending timeout, revoke notifies relay
│   └── cli/
│       ├── pair.ts            NEW: npm run pair
│       ├── unpair.ts          NEW: npm run unpair
│       └── revoke.ts          NEW: npm run revoke -- <id>
└── test/
    ├── mandate.test.ts
    ├── identity.test.ts
    └── relay-client.test.ts
```

Note on the spec §4.3 «oneLine/describe переиспользуются»: the relay is deployed on a server without the `broker/` folder, so `relay/src/format.ts` has its own copy of `oneLine()` with the same rules. The broker imports only *types* from `relay/src/protocol.ts` (`import type`, erased at runtime).

---

### Task 1: Relay package and message protocol

**Files:**
- Create: `relay/package.json`, `relay/tsconfig.json`, `relay/.gitignore`, `relay/.env.example`
- Create: `relay/src/protocol.ts`
- Test: `relay/test/protocol.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (all exported from `relay/src/protocol.ts`):
  - `type Decision = "approve" | "deny" | "revoke"`
  - `type MandateUpdateStatus = "approved" | "denied" | "revoked" | "timed_out" | "gone"`
  - `type ApprovalRequest = { mandateId: string; agent: string; task: string; actions: string[]; expiresInSeconds: number; limit: number }`
  - `type BrokerToRelay` (union, see code), `type RelayToBroker` (union, see code)
  - `function parseBrokerMessage(raw: string): BrokerToRelay | null`

- [ ] **Step 1: Create the package files**

`relay/package.json`:
```json
{
  "name": "agentcollar-relay",
  "version": "0.1.0",
  "description": "AgentCollar relay: connects local brokers to the official Telegram bot",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "tsx src/server.ts",
    "test": "tsx --test test/*.test.ts",
    "typecheck": "tsc --noEmit"
  }
}
```

`relay/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noEmit": true,
    "allowImportingTsExtensions": true,
    "types": ["node"]
  },
  "include": ["src", "test"]
}
```

`relay/.gitignore`:
```
# Installed packages: recreated by `npm install`, never committed
node_modules/

# Local runtime data (relay.db with the brokers table)
data/

# Secrets: the official bot token lives only in .env on the relay server
.env
.env.*
!.env.example
```

`relay/.env.example`:
```
# Copy to .env and fill in:  cp .env.example .env   (.env is never committed)

# Token of the official AgentCollar bot (from @BotFather).
# Only the relay may use this token: no broker should poll the same bot.
RELAY_BOT_TOKEN=

# Where the relay listens. For local development keep 127.0.0.1.
# RELAY_HOST=127.0.0.1
# RELAY_PORT=8788
```

- [ ] **Step 2: Install dependencies**

Run (from `relay/`): `npm install ws && npm install --save-dev typescript tsx @types/node @types/ws`
Expected: `added ... packages`, `found 0 vulnerabilities`.

- [ ] **Step 3: Write the failing test** — `relay/test/protocol.test.ts`

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { parseBrokerMessage } from "../src/protocol.ts";

const request = {
  type: "approval_request",
  mandateId: "a935774d",
  agent: "digest-agent",
  task: "Summarize the inbox",
  actions: ["gmail.read", "gmail.draft"],
  expiresInSeconds: 300,
  limit: 10,
};

test("accepts a valid approval_request", () => {
  assert.deepEqual(parseBrokerMessage(JSON.stringify(request)), request);
});

test("accepts register, hello, auth, pair_start, unpair", () => {
  assert.deepEqual(parseBrokerMessage('{"type":"register","publicKey":"AAAA","name":"MacBook"}'), {
    type: "register",
    publicKey: "AAAA",
    name: "MacBook",
  });
  assert.deepEqual(parseBrokerMessage('{"type":"hello","brokerId":"0a1b2c3d4e5f"}'), { type: "hello", brokerId: "0a1b2c3d4e5f" });
  assert.deepEqual(parseBrokerMessage('{"type":"auth","signature":"c2ln"}'), { type: "auth", signature: "c2ln" });
  assert.deepEqual(parseBrokerMessage('{"type":"pair_start"}'), { type: "pair_start" });
  assert.deepEqual(parseBrokerMessage('{"type":"unpair"}'), { type: "unpair" });
});

test("rejects broken JSON, non-objects and unknown types", () => {
  assert.equal(parseBrokerMessage("{bad"), null);
  assert.equal(parseBrokerMessage("null"), null);
  assert.equal(parseBrokerMessage("42"), null);
  assert.equal(parseBrokerMessage('{"type":"launch_rockets"}'), null);
});

test("rejects an action with a line break (approval spoofing)", () => {
  const spoofed = { ...request, actions: ["gmail.read\nДействия: gmail.read"] };
  assert.equal(parseBrokerMessage(JSON.stringify(spoofed)), null);
});

test("rejects ids that are not short hex", () => {
  assert.equal(parseBrokerMessage(JSON.stringify({ ...request, mandateId: "../../etc" })), null);
  assert.equal(parseBrokerMessage('{"type":"hello","brokerId":"ZZZ"}'), null);
});

test("rejects oversized messages and out-of-range numbers", () => {
  assert.equal(parseBrokerMessage(JSON.stringify({ ...request, task: "x".repeat(20_000) })), null);
  assert.equal(parseBrokerMessage(JSON.stringify({ ...request, limit: 0 })), null);
  assert.equal(parseBrokerMessage(JSON.stringify({ ...request, expiresInSeconds: 999_999 })), null);
});

test("accepts mandate_update only with a known status", () => {
  assert.deepEqual(parseBrokerMessage('{"type":"mandate_update","mandateId":"a935774d","status":"gone"}'), {
    type: "mandate_update",
    mandateId: "a935774d",
    status: "gone",
  });
  assert.equal(parseBrokerMessage('{"type":"mandate_update","mandateId":"a935774d","status":"hacked"}'), null);
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run (from `relay/`): `npm test`
Expected: FAIL — `Cannot find module '../src/protocol.ts'`.

- [ ] **Step 5: Implement** — `relay/src/protocol.ts`

```ts
// Messages between a local broker and the relay, over one WebSocket.
// Every message is a JSON object with a "type" field.
// The relay treats everything a broker sends as untrusted: anyone on the internet can connect.

export type Decision = "approve" | "deny" | "revoke";

// "gone": the broker no longer knows this mandate (it was restarted, memory wiped).
export type MandateUpdateStatus = "approved" | "denied" | "revoked" | "timed_out" | "gone";

export type ApprovalRequest = {
  mandateId: string;
  agent: string;
  task: string;
  actions: string[];
  expiresInSeconds: number;
  limit: number;
};

export type BrokerToRelay =
  | { type: "register"; publicKey: string; name: string }
  | { type: "hello"; brokerId: string }
  | { type: "auth"; signature: string }
  | { type: "pair_start" }
  | { type: "unpair" }
  | ({ type: "approval_request" } & ApprovalRequest)
  | { type: "mandate_update"; mandateId: string; status: MandateUpdateStatus };

export type RelayToBroker =
  | { type: "challenge"; nonce: string }
  | { type: "ready"; brokerId: string; paired: boolean }
  | { type: "pair_code"; code: string; link: string; expiresAt: number }
  | { type: "paired"; telegramName: string }
  | { type: "unpaired" }
  | { type: "decision"; mandateId: string; decision: Decision }
  | { type: "human_unreachable"; mandateId: string }
  | { type: "error"; message: string };

const ID = /^[0-9a-f]{8,32}$/;
const ACTION = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/;
const STATUSES: string[] = ["approved", "denied", "revoked", "timed_out", "gone"];

function isText(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max;
}

function isId(value: unknown): value is string {
  return typeof value === "string" && ID.test(value);
}

function isWhole(value: unknown, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 && value <= max;
}

// Turns raw text from a broker into a typed message, or null if anything is off.
export function parseBrokerMessage(raw: string): BrokerToRelay | null {
  if (raw.length > 10_000) return null;

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) return null;
  const m = data as Record<string, unknown>;

  switch (m.type) {
    case "register":
      return isText(m.publicKey, 200) && isText(m.name, 64)
        ? { type: "register", publicKey: m.publicKey, name: m.name }
        : null;
    case "hello":
      return isId(m.brokerId) ? { type: "hello", brokerId: m.brokerId } : null;
    case "auth":
      return isText(m.signature, 200) ? { type: "auth", signature: m.signature } : null;
    case "pair_start":
      return { type: "pair_start" };
    case "unpair":
      return { type: "unpair" };
    case "approval_request": {
      const { mandateId, agent, task, actions, expiresInSeconds, limit } = m;
      if (
        !isId(mandateId) ||
        !isText(agent, 2000) ||
        !isText(task, 2000) ||
        !Array.isArray(actions) ||
        actions.length === 0 ||
        actions.length > 20 ||
        !actions.every((a) => typeof a === "string" && ACTION.test(a)) ||
        !isWhole(expiresInSeconds, 86_400) ||
        !isWhole(limit, 1000)
      ) {
        return null;
      }
      return { type: "approval_request", mandateId, agent, task, actions, expiresInSeconds, limit };
    }
    case "mandate_update":
      return isId(m.mandateId) && typeof m.status === "string" && STATUSES.includes(m.status)
        ? { type: "mandate_update", mandateId: m.mandateId, status: m.status as MandateUpdateStatus }
        : null;
    default:
      return null;
  }
}
```

- [ ] **Step 6: Run tests and typecheck**

Run (from `relay/`): `npm test && npm run typecheck`
Expected: all 7 tests pass (`# pass 7`, `# fail 0`), typecheck prints nothing after the header.

- [ ] **Step 7: Commit**

```bash
cd /Users/ank/Documents/AgentCollar
git add relay/.gitignore relay/.env.example relay/package.json relay/package-lock.json relay/tsconfig.json relay/src/protocol.ts relay/test/protocol.test.ts
git commit -m "Relay step 1: package skeleton and broker<->relay message protocol with strict parsing of untrusted broker messages"
```

---

### Task 2: Relay signatures and the brokers table

**Files:**
- Create: `relay/src/crypto.ts`, `relay/src/store.ts`
- Test: `relay/test/crypto.test.ts`, `relay/test/store.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `crypto.ts`: `newNonce(): string` (base64 of 32 random bytes); `verifySignature(publicKey: string, nonce: string, signature: string): boolean` — `publicKey` is base64 of an Ed25519 SPKI DER key, `nonce` and `signature` are base64.
  - `store.ts`: `type BrokerRecord = { brokerId: string; publicKey: string; name: string; telegramUserId: number | null }`; `type Store = { addBroker(publicKey: string, name: string): BrokerRecord; getBroker(brokerId: string): BrokerRecord | undefined; setTelegramUser(brokerId: string, telegramUserId: number | null): void; brokersOfTelegramUser(telegramUserId: number): BrokerRecord[] }`; `openStore(path: string): Store` (`":memory:"` for tests). `brokerId` = 12 hex characters.

- [ ] **Step 1: Write the failing tests**

`relay/test/crypto.test.ts`:
```ts
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { test } from "node:test";
import { newNonce, verifySignature } from "../src/crypto.ts";

function ed25519() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    publicKey: publicKey.export({ format: "der", type: "spki" }).toString("base64"),
    sign: (nonce: string) => sign(null, Buffer.from(nonce, "base64"), privateKey).toString("base64"),
  };
}

test("nonce is 32 random bytes and never repeats", () => {
  assert.equal(Buffer.from(newNonce(), "base64").length, 32);
  assert.notEqual(newNonce(), newNonce());
});

test("a correct signature verifies", () => {
  const keys = ed25519();
  const nonce = newNonce();
  assert.equal(verifySignature(keys.publicKey, nonce, keys.sign(nonce)), true);
});

test("a signature over a different nonce does not verify", () => {
  const keys = ed25519();
  assert.equal(verifySignature(keys.publicKey, newNonce(), keys.sign(newNonce())), false);
});

test("a signature by another key does not verify", () => {
  const owner = ed25519();
  const attacker = ed25519();
  const nonce = newNonce();
  assert.equal(verifySignature(owner.publicKey, nonce, attacker.sign(nonce)), false);
});

test("garbage keys and non-Ed25519 keys are rejected without throwing", () => {
  const nonce = newNonce();
  assert.equal(verifySignature("bm90LWEta2V5", nonce, "c2ln"), false);
  const ec = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const ecKey = ec.publicKey.export({ format: "der", type: "spki" }).toString("base64");
  assert.equal(verifySignature(ecKey, nonce, "c2ln"), false);
});
```

`relay/test/store.test.ts`:
```ts
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { openStore } from "../src/store.ts";

test("adds a broker with a 12-character id and finds it again", () => {
  const store = openStore(":memory:");
  const added = store.addBroker("PUBKEY", "MacBook");
  assert.match(added.brokerId, /^[0-9a-f]{12}$/);
  assert.deepEqual(store.getBroker(added.brokerId), {
    brokerId: added.brokerId,
    publicKey: "PUBKEY",
    name: "MacBook",
    telegramUserId: null,
  });
  assert.equal(store.getBroker("000000000000"), undefined);
});

test("links and unlinks a Telegram user", () => {
  const store = openStore(":memory:");
  const a = store.addBroker("A", "MacBook");
  const b = store.addBroker("B", "Work Mac");
  store.setTelegramUser(a.brokerId, 42);
  store.setTelegramUser(b.brokerId, 42);
  assert.equal(store.getBroker(a.brokerId)?.telegramUserId, 42);
  assert.deepEqual(store.brokersOfTelegramUser(42).map((r) => r.name).sort(), ["MacBook", "Work Mac"]);
  store.setTelegramUser(a.brokerId, null);
  assert.equal(store.getBroker(a.brokerId)?.telegramUserId, null);
  assert.deepEqual(store.brokersOfTelegramUser(42).map((r) => r.name), ["Work Mac"]);
});

test("a name with quotes is stored as data, not as SQL", () => {
  const store = openStore(":memory:");
  const evil = store.addBroker("K", `x'); DROP TABLE brokers; --`);
  assert.equal(store.getBroker(evil.brokerId)?.name, `x'); DROP TABLE brokers; --`);
});

test("pairings survive a restart (file database)", () => {
  const file = join(mkdtempSync(join(tmpdir(), "relay-")), "relay.db");
  const first = openStore(file);
  const added = first.addBroker("K", "MacBook");
  first.setTelegramUser(added.brokerId, 7);
  const second = openStore(file);
  assert.equal(second.getBroker(added.brokerId)?.telegramUserId, 7);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from `relay/`): `npm test`
Expected: FAIL — `Cannot find module '../src/crypto.ts'` / `'../src/store.ts'`.

- [ ] **Step 3: Implement** — `relay/src/crypto.ts`

```ts
import { createPublicKey, randomBytes, verify } from "node:crypto";

// A fresh random challenge for every connection: a recorded old answer is useless.
export function newNonce(): string {
  return randomBytes(32).toString("base64");
}

// publicKey: base64 of the broker's Ed25519 public key (SPKI DER), sent once in "register".
// True only if `signature` was made over `nonce` by the matching private key.
export function verifySignature(publicKey: string, nonce: string, signature: string): boolean {
  try {
    const key = createPublicKey({ key: Buffer.from(publicKey, "base64"), format: "der", type: "spki" });
    if (key.asymmetricKeyType !== "ed25519") return false;
    return verify(null, Buffer.from(nonce, "base64"), key, Buffer.from(signature, "base64"));
  } catch {
    return false; // not a key at all
  }
}
```

- [ ] **Step 4: Implement** — `relay/src/store.ts`

```ts
import { randomBytes } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

export type BrokerRecord = {
  brokerId: string;
  publicKey: string;
  name: string;
  telegramUserId: number | null; // null = not paired
};

export type Store = {
  addBroker(publicKey: string, name: string): BrokerRecord;
  getBroker(brokerId: string): BrokerRecord | undefined;
  setTelegramUser(brokerId: string, telegramUserId: number | null): void;
  brokersOfTelegramUser(telegramUserId: number): BrokerRecord[];
};

// The ONLY thing the relay keeps on disk. Use ":memory:" in tests.
// Every query uses "?" placeholders: values are passed separately from the SQL text,
// so a broker name like "x'); DROP TABLE..." stays plain data (no SQL injection).
export function openStore(path: string): Store {
  const db = new DatabaseSync(path);
  db.exec(`CREATE TABLE IF NOT EXISTS brokers (
    broker_id TEXT PRIMARY KEY,
    public_key TEXT NOT NULL,
    name TEXT NOT NULL,
    telegram_user_id INTEGER,
    created_at TEXT NOT NULL
  )`);

  function toRecord(row: Record<string, unknown>): BrokerRecord {
    return {
      brokerId: String(row.broker_id),
      publicKey: String(row.public_key),
      name: String(row.name),
      telegramUserId: row.telegram_user_id === null ? null : Number(row.telegram_user_id),
    };
  }

  return {
    addBroker(publicKey, name) {
      const brokerId = randomBytes(6).toString("hex"); // 12 characters
      db.prepare("INSERT INTO brokers VALUES (?, ?, ?, NULL, ?)").run(brokerId, publicKey, name, new Date().toISOString());
      return { brokerId, publicKey, name, telegramUserId: null };
    },
    getBroker(brokerId) {
      const row = db.prepare("SELECT * FROM brokers WHERE broker_id = ?").get(brokerId);
      return row === undefined ? undefined : toRecord(row);
    },
    setTelegramUser(brokerId, telegramUserId) {
      db.prepare("UPDATE brokers SET telegram_user_id = ? WHERE broker_id = ?").run(telegramUserId, brokerId);
    },
    brokersOfTelegramUser(telegramUserId) {
      return db.prepare("SELECT * FROM brokers WHERE telegram_user_id = ?").all(telegramUserId).map(toRecord);
    },
  };
}
```

- [ ] **Step 5: Run tests and typecheck**

Run (from `relay/`): `npm test && npm run typecheck`
Expected: all tests pass (`# fail 0`). Node prints `ExperimentalWarning: SQLite is an experimental feature` — expected (spec §8).

- [ ] **Step 6: Commit**

```bash
cd /Users/ank/Documents/AgentCollar
git add relay/src/crypto.ts relay/src/store.ts relay/test/crypto.test.ts relay/test/store.test.ts
git commit -m "Relay step 2: Ed25519 challenge verification and the SQLite brokers table (the only data the relay keeps on disk)"
```

---

### Task 3: Rate limits, pairing codes, Telegram message format

**Files:**
- Create: `relay/src/rate-limit.ts`, `relay/src/pairing.ts`, `relay/src/format.ts`
- Test: `relay/test/rate-limit.test.ts`, `relay/test/pairing.test.ts`, `relay/test/format.test.ts`

**Interfaces:**
- Consumes: `ApprovalRequest`, `MandateUpdateStatus` from `relay/src/protocol.ts` (Task 1).
- Produces:
  - `rate-limit.ts`: `type RateLimiter = { allow(key: string): boolean }`; `createRateLimiter(max: number, windowMs: number, now?: () => number): RateLimiter`
  - `pairing.ts`: `PAIRING_TTL_MS = 600_000`; `type PairingCodes = { create(brokerId: string): { code: string; expiresAt: number }; consume(code: string): string | undefined }`; `createPairingCodes(now?: () => number): PairingCodes`
  - `format.ts`: `type InlineButton = { text: string; callback_data: string }`; `type RequestState = "pending" | MandateUpdateStatus | "undelivered"`; `oneLine(text: string, max: number): string`; `formatRequest(request: ApprovalRequest, brokerName: string, state: RequestState): string`; `buttonsFor(brokerId: string, mandateId: string, state: RequestState): InlineButton[][]`

- [ ] **Step 1: Write the failing tests**

`relay/test/rate-limit.test.ts`:
```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { createRateLimiter } from "../src/rate-limit.ts";

test("allows max events per window, then refuses", () => {
  let time = 0;
  const limiter = createRateLimiter(3, 60_000, () => time);
  assert.deepEqual([1, 2, 3, 4].map(() => limiter.allow("a")), [true, true, true, false]);
  time += 60_001;
  assert.equal(limiter.allow("a"), true);
});

test("keys are counted separately", () => {
  const limiter = createRateLimiter(1, 60_000, () => 0);
  assert.equal(limiter.allow("a"), true);
  assert.equal(limiter.allow("b"), true);
  assert.equal(limiter.allow("a"), false);
});
```

`relay/test/pairing.test.ts`:
```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { createPairingCodes, PAIRING_TTL_MS } from "../src/pairing.ts";

test("a code is 8 easy-to-read characters and works once", () => {
  const codes = createPairingCodes(() => 0);
  const { code, expiresAt } = codes.create("broker1");
  assert.match(code, /^[2-9A-HJKMNP-Z]{8}$/);
  assert.equal(expiresAt, PAIRING_TTL_MS);
  assert.equal(codes.consume(code), "broker1");
  assert.equal(codes.consume(code), undefined);
});

test("an expired code does not work", () => {
  let time = 0;
  const codes = createPairingCodes(() => time);
  const { code } = codes.create("broker1");
  time = PAIRING_TTL_MS + 1;
  assert.equal(codes.consume(code), undefined);
});

test("a new code for the same broker cancels the old one", () => {
  const codes = createPairingCodes(() => 0);
  const first = codes.create("broker1").code;
  const second = codes.create("broker1").code;
  assert.equal(codes.consume(first), undefined);
  assert.equal(codes.consume(second), "broker1");
});

test("lowercase, dashes and spaces typed by a human are accepted", () => {
  const codes = createPairingCodes(() => 0);
  const { code } = codes.create("broker1");
  const typed = ` ${code.slice(0, 4).toLowerCase()}-${code.slice(4)} `;
  assert.equal(codes.consume(typed), "broker1");
});

test("an unknown code does not work", () => {
  assert.equal(createPairingCodes(() => 0).consume("AAAAAAAA"), undefined);
});
```

`relay/test/format.test.ts`:
```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { buttonsFor, formatRequest } from "../src/format.ts";

const request = {
  mandateId: "a935774d",
  agent: "digest-agent",
  task: "Summarize inbox",
  actions: ["gmail.read", "gmail.draft"],
  expiresInSeconds: 300,
  limit: 10,
};

test("facts come first, the agent's words last and in quotes", () => {
  const text = formatRequest(request, "MacBook", "pending");
  const lines = text.split("\n");
  assert.ok(lines.indexOf("Действия: gmail.read, gmail.draft") < lines.indexOf("Задача (слова агента): «Summarize inbox»"));
  assert.ok(text.includes("Брокер: MacBook"));
  assert.ok(text.endsWith("⏳ Ждёт решения"));
});

test("line breaks and invisible characters in agent text cannot fake lines", () => {
  const spoof = { ...request, agent: "helper‮", task: "Hi\n\nДействия: gmail.read\nСрок: 1 с" };
  const lines = formatRequest(spoof, "Mac\nBook", "pending").split("\n");
  assert.equal(lines.filter((l) => l.startsWith("Действия:")).length, 1);
  assert.ok(lines.includes("Агент: helper"));
  assert.ok(lines.includes("Брокер: Mac Book"));
});

test("asking to send is flagged", () => {
  const text = formatRequest({ ...request, actions: ["gmail.send"] }, "MacBook", "pending");
  assert.ok(text.includes("⚠️ Агент просит право ОТПРАВЛЯТЬ от твоего имени"));
});

test("each state has its own status line", () => {
  assert.ok(formatRequest(request, "M", "approved").endsWith("✅ Одобрен"));
  assert.ok(formatRequest(request, "M", "timed_out").endsWith("⌛ Время вышло"));
  assert.ok(formatRequest(request, "M", "undelivered").endsWith("⚠️ Брокер не в сети, решение не доставлено"));
  assert.ok(formatRequest(request, "M", "gone").endsWith("🗑 Брокер перезапускался, этого мандата больше нет"));
});

test("buttons: approve/deny while pending, revoke after approval, nothing after the end", () => {
  assert.deepEqual(
    buttonsFor("0a1b2c3d4e5f", "a935774d", "pending").flat().map((b) => b.callback_data),
    ["approve:0a1b2c3d4e5f:a935774d", "deny:0a1b2c3d4e5f:a935774d"],
  );
  assert.deepEqual(buttonsFor("0a1b2c3d4e5f", "a935774d", "approved").flat().map((b) => b.callback_data), [
    "revoke:0a1b2c3d4e5f:a935774d",
  ]);
  for (const state of ["denied", "revoked", "timed_out", "gone", "undelivered"] as const) {
    assert.deepEqual(buttonsFor("0a1b2c3d4e5f", "a935774d", state), []);
  }
});

test("callback data fits Telegram's 64-byte limit", () => {
  for (const button of buttonsFor("0a1b2c3d4e5f6a7b", "a935774d", "pending").flat()) {
    assert.ok(Buffer.byteLength(button.callback_data) <= 64);
  }
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from `relay/`): `npm test`
Expected: FAIL — cannot find `rate-limit.ts`, `pairing.ts`, `format.ts`.

- [ ] **Step 3: Implement** — `relay/src/rate-limit.ts`

```ts
// "At most `max` events per `windowMs` for each key" (key = broker id, Telegram user, IP).
// Sliding window kept in memory: a relay restart resets it, which is fine.
export type RateLimiter = { allow(key: string): boolean };

export function createRateLimiter(max: number, windowMs: number, now: () => number = Date.now): RateLimiter {
  const hits = new Map<string, number[]>();
  return {
    allow(key) {
      const cutoff = now() - windowMs;
      const recent = (hits.get(key) ?? []).filter((time) => time > cutoff);
      const allowed = recent.length < max;
      if (allowed) recent.push(now());
      hits.set(key, recent);
      return allowed;
    },
  };
}
```

- [ ] **Step 4: Implement** — `relay/src/pairing.ts`

```ts
import { randomInt } from "node:crypto";

// No 0/O and no 1/I/L: easy to read from a screen and type by hand.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const PAIRING_TTL_MS = 10 * 60 * 1000;

export type PairingCodes = {
  create(brokerId: string): { code: string; expiresAt: number };
  consume(code: string): string | undefined; // the brokerId; the code stops working
};

// One-time codes in memory. A code seen later (screenshot, shoulder) is already useless.
export function createPairingCodes(now: () => number = Date.now): PairingCodes {
  const codes = new Map<string, { brokerId: string; expiresAt: number }>();

  return {
    create(brokerId) {
      // Forget this broker's previous code and every expired one.
      for (const [code, entry] of codes) {
        if (entry.brokerId === brokerId || entry.expiresAt < now()) codes.delete(code);
      }
      let code = "";
      for (let i = 0; i < 8; i++) code += ALPHABET[randomInt(ALPHABET.length)];
      const expiresAt = now() + PAIRING_TTL_MS;
      codes.set(code, { brokerId, expiresAt });
      return { code, expiresAt };
    },
    consume(code) {
      const normalized = code.toUpperCase().replace(/[^0-9A-Z]/g, ""); // "7f3k-92qd " -> "7F3K92QD"
      const entry = codes.get(normalized);
      codes.delete(normalized);
      if (entry === undefined || entry.expiresAt < now()) return undefined;
      return entry.brokerId;
    },
  };
}
```

- [ ] **Step 5: Implement** — `relay/src/format.ts`

```ts
import type { ApprovalRequest, MandateUpdateStatus } from "./protocol.ts";

export type InlineButton = { text: string; callback_data: string };

// "undelivered": the human decided, but the broker stayed offline for 10 minutes.
export type RequestState = "pending" | MandateUpdateStatus | "undelivered";

const STATUS_LINE: Record<RequestState, string> = {
  pending: "⏳ Ждёт решения",
  approved: "✅ Одобрен",
  denied: "❌ Отклонён",
  revoked: "🛑 Отозван",
  timed_out: "⌛ Время вышло",
  gone: "🗑 Брокер перезапускался, этого мандата больше нет",
  undelivered: "⚠️ Брокер не в сети, решение не доставлено",
};

// Same rules as broker/src/approval.ts (the relay is deployed without the broker folder).
// Text written by an agent or a broker is squashed into one short plain line, so it cannot
// fake lines like "Действия: ..." or hide text with invisible / right-to-left characters.
export function oneLine(text: string, max: number): string {
  const plain = text
    .replace(/[\u0000-\u001f\u007f-\u009f  ]/g, " ")
    .replace(/[​-‏‪-‮⁦-⁩﻿]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return plain.length > max ? plain.slice(0, max) + "…" : plain;
}

// Facts the broker enforces come FIRST; the agent's own words come last, in quotes.
export function formatRequest(request: ApprovalRequest, brokerName: string, state: RequestState): string {
  const lines = ["🔐 Запрос мандата", ""];
  if (request.actions.some((action) => action.endsWith(".send"))) {
    lines.push("⚠️ Агент просит право ОТПРАВЛЯТЬ от твоего имени");
  }
  lines.push(
    `Брокер: ${oneLine(brokerName, 64)}`,
    `Действия: ${request.actions.join(", ")}`,
    `Срок: ${request.expiresInSeconds} с после одобрения, лимит ${request.limit}`,
    `id: ${request.mandateId}`,
    `Агент: ${oneLine(request.agent, 64)}`,
    `Задача (слова агента): «${oneLine(request.task, 200)}»`,
    "",
    STATUS_LINE[state],
  );
  return lines.join("\n");
}

// callback_data = "<decision>:<brokerId>:<mandateId>" — at most ~45 bytes (Telegram allows 64).
export function buttonsFor(brokerId: string, mandateId: string, state: RequestState): InlineButton[][] {
  if (state === "pending") {
    return [[
      { text: "✅ Одобрить", callback_data: `approve:${brokerId}:${mandateId}` },
      { text: "❌ Отклонить", callback_data: `deny:${brokerId}:${mandateId}` },
    ]];
  }
  if (state === "approved") {
    return [[{ text: "🛑 Отозвать", callback_data: `revoke:${brokerId}:${mandateId}` }]];
  }
  return [];
}
```

- [ ] **Step 6: Run tests and typecheck**

Run (from `relay/`): `npm test && npm run typecheck`
Expected: all tests pass (`# fail 0`).

- [ ] **Step 7: Commit**

```bash
cd /Users/ank/Documents/AgentCollar
git add relay/src/rate-limit.ts relay/src/pairing.ts relay/src/format.ts relay/test/rate-limit.test.ts relay/test/pairing.test.ts relay/test/format.test.ts
git commit -m "Relay step 3: rate limiter, one-time pairing codes, spoof-proof Telegram message format"
```

---

### Task 4: Hub — broker authentication and sessions

**Files:**
- Create: `relay/src/hub.ts`
- Create: `relay/test/helpers.ts`
- Test: `relay/test/hub-auth.test.ts`

**Interfaces:**
- Consumes: `parseBrokerMessage`, `RelayToBroker`, `Decision`, `ApprovalRequest`, `MandateUpdateStatus` (Task 1); `newNonce`, `verifySignature`, `openStore`, `Store`, `BrokerRecord` (Task 2); `createRateLimiter`, `createPairingCodes`, `InlineButton`, `formatRequest`, `buttonsFor`, `oneLine` (Task 3).
- Produces (from `relay/src/hub.ts`, extended in Tasks 5–6):
  - `type TelegramApi = { sendMessage(chatId: number, text: string, buttons?: InlineButton[][]): Promise<number>; editMessage(chatId: number, messageId: number, text: string, buttons?: InlineButton[][]): Promise<void>; answerButton(queryId: string, text: string): Promise<void> }` — `sendMessage` resolves to Telegram's `message_id`.
  - `type Connection = { send(message: RelayToBroker): void; close(): void }`
  - `type HubSession = { onMessage(raw: string): Promise<void>; onClose(): void }`
  - `type ButtonPress = { queryId: string; fromId: number; data: string }`
  - `type HubOptions = { store: Store; telegram: TelegramApi; botUsername: string; now?: () => number; log?: (text: string) => void }`
  - `createHub(options: HubOptions)` returning (after Task 6) `{ connect(connection: Connection, ip: string): HubSession; handleStart(fromId: number, fromName: string, code: string): Promise<void>; handleUnpairCommand(fromId: number): Promise<void>; handleButton(press: ButtonPress): Promise<void>; sweep(): Promise<void> }`; `type Hub = ReturnType<typeof createHub>`
  - `UNDELIVERED_TTL_MS = 600_000`
  - `relay/test/helpers.ts`: `setup()`, `newKeys()`, `registerBroker()`, `reconnect()`, `pairBroker()` (see code).

- [ ] **Step 1: Write test helpers** — `relay/test/helpers.ts`

```ts
import { generateKeyPairSync, sign } from "node:crypto";
import type { InlineButton } from "../src/format.ts";
import { createHub, type Hub, type TelegramApi } from "../src/hub.ts";
import type { RelayToBroker } from "../src/protocol.ts";
import { openStore } from "../src/store.ts";

export type TelegramCall = {
  method: "sendMessage" | "editMessage" | "answerButton";
  chatId?: number;
  messageId?: number;
  text: string;
  buttons?: InlineButton[][];
};

// A pretend Telegram that records every call.
export function fakeTelegram() {
  const calls: TelegramCall[] = [];
  let nextMessageId = 100;
  let blocked = false;
  const api: TelegramApi = {
    async sendMessage(chatId, text, buttons) {
      if (blocked) throw new Error("Telegram sendMessage failed: Forbidden: bot was blocked by the user");
      calls.push({ method: "sendMessage", chatId, text, buttons });
      return nextMessageId++;
    },
    async editMessage(chatId, messageId, text, buttons) {
      calls.push({ method: "editMessage", chatId, messageId, text, buttons });
    },
    async answerButton(_queryId, text) {
      calls.push({ method: "answerButton", text });
    },
  };
  return { api, calls, block: () => (blocked = true) };
}

export function setup() {
  let time = 1_000_000;
  const telegram = fakeTelegram();
  const store = openStore(":memory:");
  const hub = createHub({ store, telegram: telegram.api, botUsername: "AgentCollarBot", now: () => time });
  return { hub, store, telegram, advance: (ms: number) => (time += ms) };
}

export function newKeys() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    publicKey: publicKey.export({ format: "der", type: "spki" }).toString("base64"),
    sign: (nonce: string) => sign(null, Buffer.from(nonce, "base64"), privateKey).toString("base64"),
  };
}

export function fakeConnection() {
  const received: RelayToBroker[] = [];
  let closed = false;
  return {
    connection: { send: (m: RelayToBroker) => void received.push(m), close: () => void (closed = true) },
    received,
    isClosed: () => closed,
    last: () => received[received.length - 1],
  };
}

export type TestBroker = Awaited<ReturnType<typeof registerBroker>>;

// Registers a new broker (register -> challenge -> auth -> ready).
export async function registerBroker(hub: Hub, keys = newKeys(), name = "MacBook", ip = "1.2.3.4") {
  const fake = fakeConnection();
  const session = hub.connect(fake.connection, ip);
  await session.onMessage(JSON.stringify({ type: "register", publicKey: keys.publicKey, name }));
  const challenge = fake.last() as { type: "challenge"; nonce: string };
  await session.onMessage(JSON.stringify({ type: "auth", signature: keys.sign(challenge.nonce) }));
  const ready = fake.last() as { type: "ready"; brokerId: string; paired: boolean };
  return { ...fake, session, keys, brokerId: ready.brokerId };
}

// A second connection of an already registered broker (hello -> challenge -> auth -> ready).
export async function reconnect(hub: Hub, broker: { brokerId: string; keys: ReturnType<typeof newKeys> }) {
  const fake = fakeConnection();
  const session = hub.connect(fake.connection, "1.2.3.4");
  await session.onMessage(JSON.stringify({ type: "hello", brokerId: broker.brokerId }));
  const challenge = fake.last() as { type: "challenge"; nonce: string };
  await session.onMessage(JSON.stringify({ type: "auth", signature: broker.keys.sign(challenge.nonce) }));
  return { ...fake, session, keys: broker.keys, brokerId: broker.brokerId };
}

// Full pairing: the broker asks for a code, the human sends /start <code> to the bot.
export async function pairBroker(hub: Hub, broker: TestBroker, telegramUserId = 42) {
  await broker.session.onMessage(JSON.stringify({ type: "pair_start" }));
  const { code } = broker.last() as { type: "pair_code"; code: string };
  await hub.handleStart(telegramUserId, "Ank", code);
}
```

- [ ] **Step 2: Write the failing test** — `relay/test/hub-auth.test.ts`

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { fakeConnection, newKeys, reconnect, registerBroker, setup } from "./helpers.ts";

test("register + correct signature -> ready, broker stored, not paired", async () => {
  const { hub, store } = setup();
  const broker = await registerBroker(hub);
  assert.deepEqual(broker.last(), { type: "ready", brokerId: broker.brokerId, paired: false });
  assert.match(broker.brokerId, /^[0-9a-f]{12}$/);
  assert.equal(store.getBroker(broker.brokerId)?.name, "MacBook");
  assert.equal(broker.isClosed(), false);
});

test("hello + correct signature -> ready for a known broker", async () => {
  const { hub } = setup();
  const broker = await registerBroker(hub);
  const again = await reconnect(hub, broker);
  assert.deepEqual(again.last(), { type: "ready", brokerId: broker.brokerId, paired: false });
});

test("register with a wrong signature -> closed, nothing stored", async () => {
  const { hub, store } = setup();
  const keys = newKeys();
  const fake = fakeConnection();
  const session = hub.connect(fake.connection, "1.2.3.4");
  await session.onMessage(JSON.stringify({ type: "register", publicKey: keys.publicKey, name: "MacBook" }));
  await session.onMessage(JSON.stringify({ type: "auth", signature: newKeys().sign("AAAA") }));
  assert.deepEqual(fake.last(), { type: "error", message: "bad signature" });
  assert.equal(fake.isClosed(), true);
  assert.deepEqual(store.brokersOfTelegramUser(0), []);
});

test("someone who knows a brokerId but not its key cannot log in", async () => {
  const { hub } = setup();
  const broker = await registerBroker(hub);
  const attacker = await reconnect(hub, { brokerId: broker.brokerId, keys: newKeys() });
  assert.deepEqual(attacker.last(), { type: "error", message: "bad signature" });
  assert.equal(attacker.isClosed(), true);
});

test("hello with an unknown broker -> closed with 'unknown broker'", async () => {
  const { hub } = setup();
  const fake = fakeConnection();
  await hub.connect(fake.connection, "1.2.3.4").onMessage(JSON.stringify({ type: "hello", brokerId: "0a1b2c3d4e5f" }));
  assert.deepEqual(fake.last(), { type: "error", message: "unknown broker" });
  assert.equal(fake.isClosed(), true);
});

test("anything before authentication -> closed", async () => {
  const { hub } = setup();
  const fake = fakeConnection();
  await hub.connect(fake.connection, "1.2.3.4").onMessage(JSON.stringify({ type: "pair_start" }));
  assert.equal(fake.isClosed(), true);
});

test("invalid JSON -> closed", async () => {
  const { hub } = setup();
  const fake = fakeConnection();
  await hub.connect(fake.connection, "1.2.3.4").onMessage("{bad");
  assert.deepEqual(fake.last(), { type: "error", message: "invalid message" });
  assert.equal(fake.isClosed(), true);
});

test("the 11th registration from one IP in an hour is refused", async () => {
  const { hub } = setup();
  for (let i = 0; i < 10; i++) await registerBroker(hub, newKeys(), "M", "9.9.9.9");
  const fake = fakeConnection();
  await hub.connect(fake.connection, "9.9.9.9").onMessage(JSON.stringify({ type: "register", publicKey: newKeys().publicKey, name: "M" }));
  assert.deepEqual(fake.last(), { type: "error", message: "too many registrations" });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run (from `relay/`): `npm test`
Expected: FAIL — `Cannot find module '../src/hub.ts'`.

- [ ] **Step 4: Implement** — `relay/src/hub.ts` (authentication part; Tasks 5–6 replace the whole file)

```ts
// All relay logic, with no network code: WebSocket and Telegram are passed in.
// That is why it can be tested with a fake Telegram and fake connections.
import { newNonce, verifySignature } from "./crypto.ts";
import type { InlineButton } from "./format.ts";
import { parseBrokerMessage, type RelayToBroker } from "./protocol.ts";
import { createRateLimiter } from "./rate-limit.ts";
import type { Store } from "./store.ts";

// What the hub needs from Telegram. The real one is in telegram-api.ts; tests use a fake.
export type TelegramApi = {
  sendMessage(chatId: number, text: string, buttons?: InlineButton[][]): Promise<number>; // message_id
  editMessage(chatId: number, messageId: number, text: string, buttons?: InlineButton[][]): Promise<void>;
  answerButton(queryId: string, text: string): Promise<void>;
};

// One WebSocket connection, as the hub sees it.
export type Connection = { send(message: RelayToBroker): void; close(): void };

export type HubSession = { onMessage(raw: string): Promise<void>; onClose(): void };

export type HubOptions = {
  store: Store;
  telegram: TelegramApi;
  botUsername: string;
  now?: () => number;
  log?: (text: string) => void;
};

type Session = {
  state: "new" | "challenged" | "ready";
  nonce: string;
  brokerId: string | null; // known after "hello", or after "register" + "auth"
  registration: { publicKey: string; name: string } | null; // "register" waiting for "auth"
};

export function createHub(options: HubOptions) {
  const { store } = options;
  const now = options.now ?? Date.now;

  const online = new Map<string, Set<Connection>>(); // brokerId -> live connections
  const registerLimit = createRateLimiter(10, 60 * 60 * 1000, now); // per IP

  function connect(connection: Connection, ip: string): HubSession {
    const session: Session = { state: "new", nonce: "", brokerId: null, registration: null };

    function fail(message: string): void {
      connection.send({ type: "error", message });
      connection.close();
    }

    async function onMessage(raw: string): Promise<void> {
      const message = parseBrokerMessage(raw);
      if (message === null) return fail("invalid message");

      // Step 1: who are you? ("hello" for known brokers, "register" for new ones)
      if (session.state === "new") {
        if (message.type === "hello") {
          if (store.getBroker(message.brokerId) === undefined) return fail("unknown broker");
          session.brokerId = message.brokerId;
        } else if (message.type === "register") {
          if (!registerLimit.allow(ip)) return fail("too many registrations");
          session.registration = { publicKey: message.publicKey, name: message.name };
        } else {
          return fail("say hello first");
        }
        session.nonce = newNonce();
        session.state = "challenged";
        return connection.send({ type: "challenge", nonce: session.nonce });
      }

      // Step 2: prove it — sign the random nonce with your private key.
      if (session.state === "challenged") {
        if (message.type !== "auth") return fail("expected auth");
        const publicKey = session.registration?.publicKey ?? store.getBroker(session.brokerId ?? "")?.publicKey ?? "";
        if (!verifySignature(publicKey, session.nonce, message.signature)) return fail("bad signature");

        // A new broker is stored only AFTER it proved it owns the key.
        if (session.registration !== null) {
          session.brokerId = store.addBroker(publicKey, session.registration.name).brokerId;
          session.registration = null;
        }
        const brokerId = session.brokerId as string;
        session.state = "ready";
        if (!online.has(brokerId)) online.set(brokerId, new Set());
        online.get(brokerId)?.add(connection);
        connection.send({ type: "ready", brokerId, paired: store.getBroker(brokerId)?.telegramUserId !== null });
        return;
      }

      // Step 3: authenticated messages (Tasks 5 and 6 add them here).
      return fail("unexpected message");
    }

    function onClose(): void {
      if (session.brokerId !== null) online.get(session.brokerId)?.delete(connection);
    }

    return { onMessage, onClose };
  }

  return { connect };
}

export type Hub = ReturnType<typeof createHub>;
```

Note: `helpers.ts` calls `hub.handleStart` (used from Task 5). Until then `npm run typecheck` reports that property as missing — run only `npm test` in this task (tsx does not type-check). Typecheck passes again after Task 5.

- [ ] **Step 5: Run tests**

Run (from `relay/`): `npm test`
Expected: all tests pass (`# fail 0`).

- [ ] **Step 6: Commit**

```bash
cd /Users/ank/Documents/AgentCollar
git add relay/src/hub.ts relay/test/helpers.ts relay/test/hub-auth.test.ts
git commit -m "Relay step 4: hub authenticates brokers with an Ed25519 challenge; new brokers are stored only after proving key ownership"
```

---

### Task 5: Hub — pairing and unpairing

**Files:**
- Modify: `relay/src/hub.ts` (replace the whole file with the code below)
- Test: `relay/test/hub-pairing.test.ts`

**Interfaces:**
- Consumes: everything listed in Task 4.
- Produces: `hub.handleStart(fromId, fromName, code)`, `hub.handleUnpairCommand(fromId)`; broker messages `pair_start` → `pair_code`, `unpair` → `unpaired`; relay → broker `paired` (to ALL live connections of that broker).

- [ ] **Step 1: Write the failing test** — `relay/test/hub-pairing.test.ts`

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { pairBroker, reconnect, registerBroker, setup } from "./helpers.ts";

test("pair_start returns an 8-character code and a t.me link", async () => {
  const { hub } = setup();
  const broker = await registerBroker(hub);
  await broker.session.onMessage(JSON.stringify({ type: "pair_start" }));
  const reply = broker.last() as { type: string; code: string; link: string; expiresAt: number };
  assert.equal(reply.type, "pair_code");
  assert.match(reply.code, /^[2-9A-HJKMNP-Z]{8}$/);
  assert.equal(reply.link, `https://t.me/AgentCollarBot?start=${reply.code}`);
});

test("/start <code> links the Telegram user and tells both sides", async () => {
  const { hub, store, telegram } = setup();
  const broker = await registerBroker(hub);
  await pairBroker(hub, broker, 42);
  assert.equal(store.getBroker(broker.brokerId)?.telegramUserId, 42);
  assert.deepEqual(broker.last(), { type: "paired", telegramName: "Ank" });
  const message = telegram.calls.at(-1);
  assert.equal(message?.chatId, 42);
  assert.ok(message?.text.includes("✅ Брокер «MacBook» привязан"));
});

test("a wrong, reused or expired code does not link", async () => {
  const { hub, store, telegram, advance } = setup();
  const broker = await registerBroker(hub);

  await hub.handleStart(42, "Ank", "AAAAAAAA");
  assert.ok(telegram.calls.at(-1)?.text.includes("Код неверный или истёк"));

  await broker.session.onMessage(JSON.stringify({ type: "pair_start" }));
  const { code } = broker.last() as { code: string };
  advance(10 * 60 * 1000 + 1);
  await hub.handleStart(42, "Ank", code);
  assert.ok(telegram.calls.at(-1)?.text.includes("Код неверный или истёк"));
  assert.equal(store.getBroker(broker.brokerId)?.telegramUserId, null);
});

test("re-pairing to another account warns the old account", async () => {
  const { hub, store, telegram } = setup();
  const broker = await registerBroker(hub);
  await pairBroker(hub, broker, 42);
  await pairBroker(hub, broker, 77);
  assert.equal(store.getBroker(broker.brokerId)?.telegramUserId, 77);
  const warning = telegram.calls.find((c) => c.chatId === 42 && c.text.includes("перепривязан"));
  assert.ok(warning);
});

test("the 6th /start attempt in a minute is refused even with a valid code", async () => {
  const { hub, store, telegram } = setup();
  const broker = await registerBroker(hub);
  for (let i = 0; i < 5; i++) await hub.handleStart(42, "Ank", "AAAAAAAA");
  await broker.session.onMessage(JSON.stringify({ type: "pair_start" }));
  const { code } = broker.last() as { code: string };
  await hub.handleStart(42, "Ank", code);
  assert.ok(telegram.calls.at(-1)?.text.includes("Слишком много попыток"));
  assert.equal(store.getBroker(broker.brokerId)?.telegramUserId, null);
});

test("/start without a code explains what to do", async () => {
  const { hub, telegram } = setup();
  await hub.handleStart(42, "Ank", "");
  assert.ok(telegram.calls.at(-1)?.text.includes("npm run pair"));
});

test("/unpair in Telegram unlinks every broker of that user", async () => {
  const { hub, store, telegram } = setup();
  const broker = await registerBroker(hub);
  await pairBroker(hub, broker, 42);
  await hub.handleUnpairCommand(42);
  assert.equal(store.getBroker(broker.brokerId)?.telegramUserId, null);
  assert.deepEqual(broker.last(), { type: "unpaired" });
  assert.ok(telegram.calls.at(-1)?.text.includes("Отвязано брокеров: 1"));
});

test("unpair from the broker side unlinks and tells the human", async () => {
  const { hub, store, telegram } = setup();
  const broker = await registerBroker(hub);
  await pairBroker(hub, broker, 42);
  await broker.session.onMessage(JSON.stringify({ type: "unpair" }));
  assert.equal(store.getBroker(broker.brokerId)?.telegramUserId, null);
  assert.deepEqual(broker.last(), { type: "unpaired" });
  assert.ok(telegram.calls.at(-1)?.text.includes("отвязан"));
});

test("two connections of one broker (server + npm run pair) both get 'paired'", async () => {
  const { hub } = setup();
  const server = await registerBroker(hub);
  const pairCli = await reconnect(hub, server);
  await pairCli.session.onMessage(JSON.stringify({ type: "pair_start" }));
  const { code } = pairCli.last() as { code: string };
  await hub.handleStart(42, "Ank", code);
  assert.deepEqual(server.last(), { type: "paired", telegramName: "Ank" });
  assert.deepEqual(pairCli.last(), { type: "paired", telegramName: "Ank" });
  assert.equal(server.isClosed(), false);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from `relay/`): `npm test`
Expected: FAIL — `hub.handleStart is not a function` / `unexpected message` errors.

- [ ] **Step 3: Implement** — replace `relay/src/hub.ts` with:

```ts
// All relay logic, with no network code: WebSocket and Telegram are passed in.
// That is why it can be tested with a fake Telegram and fake connections.
import { newNonce, verifySignature } from "./crypto.ts";
import { oneLine, type InlineButton } from "./format.ts";
import { createPairingCodes } from "./pairing.ts";
import { parseBrokerMessage, type RelayToBroker } from "./protocol.ts";
import { createRateLimiter } from "./rate-limit.ts";
import type { BrokerRecord, Store } from "./store.ts";

// What the hub needs from Telegram. The real one is in telegram-api.ts; tests use a fake.
export type TelegramApi = {
  sendMessage(chatId: number, text: string, buttons?: InlineButton[][]): Promise<number>; // message_id
  editMessage(chatId: number, messageId: number, text: string, buttons?: InlineButton[][]): Promise<void>;
  answerButton(queryId: string, text: string): Promise<void>;
};

// One WebSocket connection, as the hub sees it.
export type Connection = { send(message: RelayToBroker): void; close(): void };

export type HubSession = { onMessage(raw: string): Promise<void>; onClose(): void };

export type HubOptions = {
  store: Store;
  telegram: TelegramApi;
  botUsername: string;
  now?: () => number;
  log?: (text: string) => void;
};

type Session = {
  state: "new" | "challenged" | "ready";
  nonce: string;
  brokerId: string | null; // known after "hello", or after "register" + "auth"
  registration: { publicKey: string; name: string } | null; // "register" waiting for "auth"
};

export function createHub(options: HubOptions) {
  const { store, telegram, botUsername } = options;
  const now = options.now ?? Date.now;
  const log = options.log ?? (() => {});

  const online = new Map<string, Set<Connection>>(); // brokerId -> live connections
  const pairing = createPairingCodes(now);
  const registerLimit = createRateLimiter(10, 60 * 60 * 1000, now); // per IP
  const codeLimit = createRateLimiter(5, 60 * 1000, now); // per Telegram user

  // Sends to every live connection of a broker (e.g. the server AND `npm run pair`).
  function sendToBroker(brokerId: string, message: RelayToBroker): boolean {
    const connections = online.get(brokerId);
    if (connections === undefined || connections.size === 0) return false;
    for (const connection of connections) connection.send(message);
    return true;
  }

  // Telegram notices that are nice to have: if one fails (user blocked the bot), just log it.
  async function notify(chatId: number, text: string): Promise<void> {
    await telegram.sendMessage(chatId, text).catch((error: Error) => log(`Telegram notice failed: ${error.message}`));
  }

  // --- WebSocket side ---

  function connect(connection: Connection, ip: string): HubSession {
    const session: Session = { state: "new", nonce: "", brokerId: null, registration: null };

    function fail(message: string): void {
      connection.send({ type: "error", message });
      connection.close();
    }

    async function onMessage(raw: string): Promise<void> {
      const message = parseBrokerMessage(raw);
      if (message === null) return fail("invalid message");

      // Step 1: who are you? ("hello" for known brokers, "register" for new ones)
      if (session.state === "new") {
        if (message.type === "hello") {
          if (store.getBroker(message.brokerId) === undefined) return fail("unknown broker");
          session.brokerId = message.brokerId;
        } else if (message.type === "register") {
          if (!registerLimit.allow(ip)) return fail("too many registrations");
          session.registration = { publicKey: message.publicKey, name: message.name };
        } else {
          return fail("say hello first");
        }
        session.nonce = newNonce();
        session.state = "challenged";
        return connection.send({ type: "challenge", nonce: session.nonce });
      }

      // Step 2: prove it — sign the random nonce with your private key.
      if (session.state === "challenged") {
        if (message.type !== "auth") return fail("expected auth");
        const publicKey = session.registration?.publicKey ?? store.getBroker(session.brokerId ?? "")?.publicKey ?? "";
        if (!verifySignature(publicKey, session.nonce, message.signature)) return fail("bad signature");

        // A new broker is stored only AFTER it proved it owns the key.
        if (session.registration !== null) {
          session.brokerId = store.addBroker(publicKey, session.registration.name).brokerId;
          session.registration = null;
        }
        const brokerId = session.brokerId as string;
        session.state = "ready";
        if (!online.has(brokerId)) online.set(brokerId, new Set());
        online.get(brokerId)?.add(connection);
        connection.send({ type: "ready", brokerId, paired: store.getBroker(brokerId)?.telegramUserId !== null });
        return;
      }

      // Step 3: authenticated messages.
      const broker = store.getBroker(session.brokerId as string);
      if (broker === undefined) return fail("unknown broker");
      switch (message.type) {
        case "pair_start": {
          const { code, expiresAt } = pairing.create(broker.brokerId);
          return connection.send({ type: "pair_code", code, link: `https://t.me/${botUsername}?start=${code}`, expiresAt });
        }
        case "unpair":
          return unpairBroker(broker);
        default:
          return fail("unexpected message");
      }
    }

    function onClose(): void {
      if (session.brokerId !== null) online.get(session.brokerId)?.delete(connection);
    }

    return { onMessage, onClose };
  }

  // --- pairing ---

  async function unpairBroker(broker: BrokerRecord): Promise<void> {
    store.setTelegramUser(broker.brokerId, null);
    sendToBroker(broker.brokerId, { type: "unpaired" });
    if (broker.telegramUserId !== null) {
      await notify(broker.telegramUserId, `Брокер «${oneLine(broker.name, 64)}» отвязан от этого аккаунта.`);
    }
  }

  // Telegram: /start <code>
  async function handleStart(fromId: number, fromName: string, code: string): Promise<void> {
    if (code === "") {
      return notify(fromId, "Привет! Чтобы привязать брокер, запусти на компьютере npm run pair и открой ссылку, которую он покажет.");
    }
    if (!codeLimit.allow(String(fromId))) {
      return notify(fromId, "Слишком много попыток. Подожди минуту.");
    }
    const brokerId = pairing.consume(code);
    const broker = brokerId === undefined ? undefined : store.getBroker(brokerId);
    if (broker === undefined) {
      return notify(fromId, "Код неверный или истёк. Запусти npm run pair ещё раз.");
    }

    const previous = broker.telegramUserId;
    const name = oneLine(broker.name, 64);
    store.setTelegramUser(broker.brokerId, fromId);
    await notify(fromId, `✅ Брокер «${name}» привязан. Запросы мандатов будут приходить сюда.`);
    if (previous !== null && previous !== fromId) {
      await notify(previous, `⚠️ Брокер «${name}» перепривязан к другому аккаунту Telegram. Если это не ты, запусти npm run pair на своём компьютере.`);
    }
    sendToBroker(broker.brokerId, { type: "paired", telegramName: oneLine(fromName, 64) });
  }

  // Telegram: /unpair
  async function handleUnpairCommand(fromId: number): Promise<void> {
    const brokers = store.brokersOfTelegramUser(fromId);
    for (const broker of brokers) {
      store.setTelegramUser(broker.brokerId, null);
      sendToBroker(broker.brokerId, { type: "unpaired" });
    }
    await notify(fromId, brokers.length > 0 ? `Отвязано брокеров: ${brokers.length}.` : "К тебе не привязан ни один брокер.");
  }

  return { connect, handleStart, handleUnpairCommand };
}

export type Hub = ReturnType<typeof createHub>;
```

- [ ] **Step 4: Run tests and typecheck**

Run (from `relay/`): `npm test && npm run typecheck`
Expected: all tests pass (`# fail 0`); typecheck clean.

- [ ] **Step 5: Commit**

```bash
cd /Users/ank/Documents/AgentCollar
git add relay/src/hub.ts relay/test/hub-pairing.test.ts
git commit -m "Relay step 5: pairing via one-time code and /start, unpairing from either side, old account warned on re-pair"
```

---

### Task 6: Hub — approval requests, buttons, status updates, offline brokers

**Files:**
- Modify: `relay/src/hub.ts` (replace the whole file with the code below)
- Test: `relay/test/hub-approval.test.ts`

**Interfaces:**
- Consumes: everything listed in Tasks 4–5.
- Produces: final hub — `connect`, `handleStart`, `handleUnpairCommand`, `handleButton(press: ButtonPress)`, `sweep()`; `type ButtonPress`; `UNDELIVERED_TTL_MS`. Broker messages `approval_request` → Telegram message or `human_unreachable`; `mandate_update` → message edited. Button press by the paired user → `decision` to the broker (or queued 10 min if offline).

- [ ] **Step 1: Write the failing test** — `relay/test/hub-approval.test.ts`

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { pairBroker, reconnect, registerBroker, setup, type TestBroker } from "./helpers.ts";

const request = {
  type: "approval_request",
  mandateId: "a935774d",
  agent: "digest-agent",
  task: "Summarize inbox",
  actions: ["gmail.read", "gmail.draft"],
  expiresInSeconds: 300,
  limit: 10,
};

async function pairedBroker() {
  const ctx = setup();
  const broker = await registerBroker(ctx.hub);
  await pairBroker(ctx.hub, broker, 42);
  return { ...ctx, broker };
}

async function ask(broker: TestBroker, mandateId = "a935774d") {
  await broker.session.onMessage(JSON.stringify({ ...request, mandateId }));
}

const press = (data: string, fromId = 42) => ({ queryId: "q", fromId, data });

test("a request from a paired broker becomes a Telegram message with buttons", async () => {
  const { telegram, broker } = await pairedBroker();
  await ask(broker);
  const message = telegram.calls.at(-1);
  assert.equal(message?.method, "sendMessage");
  assert.equal(message?.chatId, 42);
  assert.ok(message?.text.includes("Действия: gmail.read, gmail.draft"));
  assert.deepEqual(message?.buttons?.flat().map((b) => b.callback_data), [
    `approve:${broker.brokerId}:a935774d`,
    `deny:${broker.brokerId}:a935774d`,
  ]);
});

test("not paired -> human_unreachable (the broker will ask in the terminal)", async () => {
  const { hub } = setup();
  const broker = await registerBroker(hub);
  await ask(broker);
  assert.deepEqual(broker.last(), { type: "human_unreachable", mandateId: "a935774d" });
});

test("user blocked the bot -> human_unreachable", async () => {
  const { telegram, broker } = await pairedBroker();
  telegram.block();
  await ask(broker);
  assert.deepEqual(broker.last(), { type: "human_unreachable", mandateId: "a935774d" });
});

test("the same request sent twice (after a reconnect) is shown once", async () => {
  const { telegram, broker } = await pairedBroker();
  await ask(broker);
  await ask(broker);
  assert.equal(telegram.calls.filter((c) => c.method === "sendMessage" && c.text.includes("a935774d")).length, 1);
});

test("the 31st request in a minute -> human_unreachable", async () => {
  const { broker } = await pairedBroker();
  for (let i = 0; i < 30; i++) await ask(broker, (0x10000000 + i).toString(16));
  await ask(broker, "ffffffff");
  assert.deepEqual(broker.last(), { type: "human_unreachable", mandateId: "ffffffff" });
});

test("the paired user's press reaches the broker as a decision", async () => {
  const { hub, telegram, broker } = await pairedBroker();
  await ask(broker);
  await hub.handleButton(press(`approve:${broker.brokerId}:a935774d`));
  assert.deepEqual(broker.last(), { type: "decision", mandateId: "a935774d", decision: "approve" });
  assert.equal(telegram.calls.at(-1)?.text, "Отправлено на компьютер");
});

test("a stranger's press is refused and nothing reaches the broker", async () => {
  const { hub, telegram, broker } = await pairedBroker();
  await ask(broker);
  const before = broker.received.length;
  await hub.handleButton(press(`approve:${broker.brokerId}:a935774d`, 999));
  assert.equal(telegram.calls.at(-1)?.text, "Нет доступа");
  assert.equal(broker.received.length, before);
});

test("a user cannot press buttons for someone else's broker", async () => {
  const { hub, telegram } = setup();
  const mine = await registerBroker(hub, undefined, "Mine");
  const theirs = await registerBroker(hub, undefined, "Theirs");
  await pairBroker(hub, mine, 42);
  await pairBroker(hub, theirs, 77);
  const before = theirs.received.length;
  await hub.handleButton(press(`approve:${theirs.brokerId}:a935774d`, 42));
  assert.equal(telegram.calls.at(-1)?.text, "Нет доступа");
  assert.equal(theirs.received.length, before);
});

test("garbage button data is refused", async () => {
  const { hub, telegram } = await pairedBroker();
  await hub.handleButton(press("launch:rockets"));
  assert.equal(telegram.calls.at(-1)?.text, "Нет доступа");
});

test("mandate_update edits the message: approved -> revoke button, denied -> no buttons", async () => {
  const { telegram, broker } = await pairedBroker();
  await ask(broker);
  await broker.session.onMessage(JSON.stringify({ type: "mandate_update", mandateId: "a935774d", status: "approved" }));
  let edit = telegram.calls.at(-1);
  assert.equal(edit?.method, "editMessage");
  assert.ok(edit?.text.endsWith("✅ Одобрен"));
  assert.deepEqual(edit?.buttons?.flat().map((b) => b.text), ["🛑 Отозвать"]);

  await broker.session.onMessage(JSON.stringify({ type: "mandate_update", mandateId: "a935774d", status: "revoked" }));
  edit = telegram.calls.at(-1);
  assert.ok(edit?.text.endsWith("🛑 Отозван"));
  assert.deepEqual(edit?.buttons, []);
});

test("mandate_update 'gone' (broker was restarted) closes the message", async () => {
  const { telegram, broker } = await pairedBroker();
  await ask(broker);
  await broker.session.onMessage(JSON.stringify({ type: "mandate_update", mandateId: "a935774d", status: "gone" }));
  assert.ok(telegram.calls.at(-1)?.text.endsWith("🗑 Брокер перезапускался, этого мандата больше нет"));
});

test("broker offline: the decision waits and is delivered on reconnect", async () => {
  const { hub, telegram, broker } = await pairedBroker();
  await ask(broker);
  broker.session.onClose();
  await hub.handleButton(press(`approve:${broker.brokerId}:a935774d`));
  assert.ok(telegram.calls.at(-1)?.text.includes("доставлю"));
  const back = await reconnect(hub, broker);
  assert.deepEqual(back.last(), { type: "decision", mandateId: "a935774d", decision: "approve" });
});

test("broker offline for more than 10 minutes: message says 'not delivered', nothing delivered later", async () => {
  const { hub, telegram, broker, advance } = await pairedBroker();
  await ask(broker);
  broker.session.onClose();
  await hub.handleButton(press(`approve:${broker.brokerId}:a935774d`));
  advance(10 * 60 * 1000 + 1);
  await hub.sweep();
  assert.ok(telegram.calls.at(-1)?.text.endsWith("⚠️ Брокер не в сети, решение не доставлено"));
  const back = await reconnect(hub, broker);
  assert.equal(back.received.some((m) => m.type === "decision"), false);
});

test("a decision reaches every live connection of the broker", async () => {
  const { hub, broker } = await pairedBroker();
  const second = await reconnect(hub, broker);
  await ask(broker);
  await hub.handleButton(press(`deny:${broker.brokerId}:a935774d`));
  assert.deepEqual(broker.last(), { type: "decision", mandateId: "a935774d", decision: "deny" });
  assert.deepEqual(second.last(), { type: "decision", mandateId: "a935774d", decision: "deny" });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from `relay/`): `npm test`
Expected: FAIL — `hub.handleButton is not a function`, `unexpected message` for `approval_request`.

- [ ] **Step 3: Implement** — replace `relay/src/hub.ts` with:

```ts
// All relay logic, with no network code: WebSocket and Telegram are passed in.
// That is why it can be tested with a fake Telegram and fake connections.
import { newNonce, verifySignature } from "./crypto.ts";
import { buttonsFor, formatRequest, oneLine, type InlineButton, type RequestState } from "./format.ts";
import { createPairingCodes } from "./pairing.ts";
import {
  parseBrokerMessage,
  type ApprovalRequest,
  type Decision,
  type MandateUpdateStatus,
  type RelayToBroker,
} from "./protocol.ts";
import { createRateLimiter } from "./rate-limit.ts";
import type { BrokerRecord, Store } from "./store.ts";

// What the hub needs from Telegram. The real one is in telegram-api.ts; tests use a fake.
export type TelegramApi = {
  sendMessage(chatId: number, text: string, buttons?: InlineButton[][]): Promise<number>; // message_id
  editMessage(chatId: number, messageId: number, text: string, buttons?: InlineButton[][]): Promise<void>;
  answerButton(queryId: string, text: string): Promise<void>;
};

// One WebSocket connection, as the hub sees it.
export type Connection = { send(message: RelayToBroker): void; close(): void };

export type HubSession = { onMessage(raw: string): Promise<void>; onClose(): void };

// A Telegram button press: who pressed, and the button's callback_data.
export type ButtonPress = { queryId: string; fromId: number; data: string };

export type HubOptions = {
  store: Store;
  telegram: TelegramApi;
  botUsername: string;
  now?: () => number;
  log?: (text: string) => void;
};

export const UNDELIVERED_TTL_MS = 10 * 60 * 1000;

type Session = {
  state: "new" | "challenged" | "ready";
  nonce: string;
  brokerId: string | null; // known after "hello", or after "register" + "auth"
  registration: { publicKey: string; name: string } | null; // "register" waiting for "auth"
};

// A request already shown in Telegram (so it can be edited later). Memory only.
type SentRequest = { request: ApprovalRequest; chatId: number; messageId: number };

// A decision made while the broker was offline. Memory only, 10 minutes.
type Undelivered = { mandateId: string; decision: Decision; at: number };

export function createHub(options: HubOptions) {
  const { store, telegram, botUsername } = options;
  const now = options.now ?? Date.now;
  const log = options.log ?? (() => {});

  const online = new Map<string, Set<Connection>>(); // brokerId -> live connections
  const sent = new Map<string, SentRequest>(); // "brokerId:mandateId" -> Telegram message
  const undelivered = new Map<string, Undelivered[]>(); // brokerId -> waiting decisions
  const pairing = createPairingCodes(now);
  const registerLimit = createRateLimiter(10, 60 * 60 * 1000, now); // per IP
  const requestLimit = createRateLimiter(30, 60 * 1000, now); // per broker
  const codeLimit = createRateLimiter(5, 60 * 1000, now); // per Telegram user

  // Sends to every live connection of a broker (e.g. the server AND `npm run pair`).
  function sendToBroker(brokerId: string, message: RelayToBroker): boolean {
    const connections = online.get(brokerId);
    if (connections === undefined || connections.size === 0) return false;
    for (const connection of connections) connection.send(message);
    return true;
  }

  // Telegram notices that are nice to have: if one fails (user blocked the bot), just log it.
  async function notify(chatId: number, text: string): Promise<void> {
    await telegram.sendMessage(chatId, text).catch((error: Error) => log(`Telegram notice failed: ${error.message}`));
  }

  // --- WebSocket side ---

  function connect(connection: Connection, ip: string): HubSession {
    const session: Session = { state: "new", nonce: "", brokerId: null, registration: null };

    function fail(message: string): void {
      connection.send({ type: "error", message });
      connection.close();
    }

    async function onMessage(raw: string): Promise<void> {
      const message = parseBrokerMessage(raw);
      if (message === null) return fail("invalid message");

      // Step 1: who are you? ("hello" for known brokers, "register" for new ones)
      if (session.state === "new") {
        if (message.type === "hello") {
          if (store.getBroker(message.brokerId) === undefined) return fail("unknown broker");
          session.brokerId = message.brokerId;
        } else if (message.type === "register") {
          if (!registerLimit.allow(ip)) return fail("too many registrations");
          session.registration = { publicKey: message.publicKey, name: message.name };
        } else {
          return fail("say hello first");
        }
        session.nonce = newNonce();
        session.state = "challenged";
        return connection.send({ type: "challenge", nonce: session.nonce });
      }

      // Step 2: prove it — sign the random nonce with your private key.
      if (session.state === "challenged") {
        if (message.type !== "auth") return fail("expected auth");
        const publicKey = session.registration?.publicKey ?? store.getBroker(session.brokerId ?? "")?.publicKey ?? "";
        if (!verifySignature(publicKey, session.nonce, message.signature)) return fail("bad signature");

        // A new broker is stored only AFTER it proved it owns the key.
        if (session.registration !== null) {
          session.brokerId = store.addBroker(publicKey, session.registration.name).brokerId;
          session.registration = null;
        }
        const brokerId = session.brokerId as string;
        session.state = "ready";
        if (!online.has(brokerId)) online.set(brokerId, new Set());
        online.get(brokerId)?.add(connection);
        connection.send({ type: "ready", brokerId, paired: store.getBroker(brokerId)?.telegramUserId !== null });
        deliverWaiting(brokerId);
        return;
      }

      // Step 3: authenticated messages.
      const broker = store.getBroker(session.brokerId as string);
      if (broker === undefined) return fail("unknown broker");
      switch (message.type) {
        case "pair_start": {
          const { code, expiresAt } = pairing.create(broker.brokerId);
          return connection.send({ type: "pair_code", code, link: `https://t.me/${botUsername}?start=${code}`, expiresAt });
        }
        case "unpair":
          return unpairBroker(broker);
        case "approval_request": {
          const { type: _type, ...request } = message;
          return showRequest(broker, request);
        }
        case "mandate_update":
          return updateRequest(broker, message.mandateId, message.status);
        default:
          return fail("unexpected message");
      }
    }

    function onClose(): void {
      if (session.brokerId !== null) online.get(session.brokerId)?.delete(connection);
    }

    return { onMessage, onClose };
  }

  // --- pairing ---

  async function unpairBroker(broker: BrokerRecord): Promise<void> {
    store.setTelegramUser(broker.brokerId, null);
    sendToBroker(broker.brokerId, { type: "unpaired" });
    if (broker.telegramUserId !== null) {
      await notify(broker.telegramUserId, `Брокер «${oneLine(broker.name, 64)}» отвязан от этого аккаунта.`);
    }
  }

  // Telegram: /start <code>
  async function handleStart(fromId: number, fromName: string, code: string): Promise<void> {
    if (code === "") {
      return notify(fromId, "Привет! Чтобы привязать брокер, запусти на компьютере npm run pair и открой ссылку, которую он покажет.");
    }
    if (!codeLimit.allow(String(fromId))) {
      return notify(fromId, "Слишком много попыток. Подожди минуту.");
    }
    const brokerId = pairing.consume(code);
    const broker = brokerId === undefined ? undefined : store.getBroker(brokerId);
    if (broker === undefined) {
      return notify(fromId, "Код неверный или истёк. Запусти npm run pair ещё раз.");
    }

    const previous = broker.telegramUserId;
    const name = oneLine(broker.name, 64);
    store.setTelegramUser(broker.brokerId, fromId);
    await notify(fromId, `✅ Брокер «${name}» привязан. Запросы мандатов будут приходить сюда.`);
    if (previous !== null && previous !== fromId) {
      await notify(previous, `⚠️ Брокер «${name}» перепривязан к другому аккаунту Telegram. Если это не ты, запусти npm run pair на своём компьютере.`);
    }
    sendToBroker(broker.brokerId, { type: "paired", telegramName: oneLine(fromName, 64) });
  }

  // Telegram: /unpair
  async function handleUnpairCommand(fromId: number): Promise<void> {
    const brokers = store.brokersOfTelegramUser(fromId);
    for (const broker of brokers) {
      store.setTelegramUser(broker.brokerId, null);
      sendToBroker(broker.brokerId, { type: "unpaired" });
    }
    await notify(fromId, brokers.length > 0 ? `Отвязано брокеров: ${brokers.length}.` : "К тебе не привязан ни один брокер.");
  }

  // --- approval ---

  function unreachable(brokerId: string, mandateId: string): void {
    sendToBroker(brokerId, { type: "human_unreachable", mandateId });
  }

  async function showRequest(broker: BrokerRecord, request: ApprovalRequest): Promise<void> {
    const key = `${broker.brokerId}:${request.mandateId}`;
    if (sent.has(key)) return; // already shown: the broker re-sends pending requests after reconnecting
    if (!requestLimit.allow(broker.brokerId)) return unreachable(broker.brokerId, request.mandateId);
    if (broker.telegramUserId === null) return unreachable(broker.brokerId, request.mandateId);

    const chatId = broker.telegramUserId;
    sent.set(key, { request, chatId, messageId: 0 }); // reserve before awaiting, so a duplicate cannot slip in
    try {
      const messageId = await telegram.sendMessage(
        chatId,
        formatRequest(request, broker.name, "pending"),
        buttonsFor(broker.brokerId, request.mandateId, "pending"),
      );
      sent.set(key, { request, chatId, messageId });
    } catch (error) {
      sent.delete(key);
      log(`Telegram: request for broker ${broker.brokerId} not sent: ${(error as Error).message}`);
      unreachable(broker.brokerId, request.mandateId);
    }
  }

  // The broker is the source of truth: the message shows what the broker reports.
  async function updateRequest(broker: BrokerRecord, mandateId: string, status: MandateUpdateStatus): Promise<void> {
    await editRequest(broker.brokerId, mandateId, status);
  }

  async function editRequest(brokerId: string, mandateId: string, state: RequestState): Promise<void> {
    const key = `${brokerId}:${mandateId}`;
    const entry = sent.get(key);
    const broker = store.getBroker(brokerId);
    if (entry === undefined || broker === undefined) return;
    if (state !== "approved") sent.delete(key); // only an approved mandate can still change (revoke)
    await telegram
      .editMessage(entry.chatId, entry.messageId, formatRequest(entry.request, broker.name, state), buttonsFor(brokerId, mandateId, state))
      .catch((error: Error) => log(`Telegram edit failed: ${error.message}`));
  }

  // Telegram: a button was pressed.
  async function handleButton(press: ButtonPress): Promise<void> {
    const [action, brokerId = "", mandateId = ""] = press.data.split(":");
    const broker = store.getBroker(brokerId);
    const isDecision = action === "approve" || action === "deny" || action === "revoke";

    // Only the Telegram user paired with THIS broker may decide for it.
    if (!isDecision || broker === undefined || mandateId === "" || broker.telegramUserId !== press.fromId) {
      log(`Telegram: refused button "${oneLine(press.data, 64)}" from user ${press.fromId}`);
      return telegram.answerButton(press.queryId, "Нет доступа");
    }

    const decision = action as Decision;
    if (sendToBroker(brokerId, { type: "decision", mandateId, decision })) {
      return telegram.answerButton(press.queryId, "Отправлено на компьютер");
    }
    const waiting = undelivered.get(brokerId) ?? [];
    waiting.push({ mandateId, decision, at: now() });
    undelivered.set(brokerId, waiting);
    return telegram.answerButton(press.queryId, "Компьютер не в сети, доставлю, когда он подключится");
  }

  // Called when a broker becomes ready: deliver decisions younger than 10 minutes.
  // Older ones stay for sweep(), which marks them "not delivered".
  function deliverWaiting(brokerId: string): void {
    const waiting = undelivered.get(brokerId) ?? [];
    const stale = waiting.filter((item) => now() - item.at > UNDELIVERED_TTL_MS);
    for (const item of waiting) {
      if (!stale.includes(item)) sendToBroker(brokerId, { type: "decision", mandateId: item.mandateId, decision: item.decision });
    }
    if (stale.length > 0) undelivered.set(brokerId, stale);
    else undelivered.delete(brokerId);
  }

  // Run every 30 seconds by server.ts: decisions waiting longer than 10 minutes are dropped
  // (fail closed) and their Telegram messages say so.
  async function sweep(): Promise<void> {
    for (const [brokerId, waiting] of undelivered) {
      const fresh = waiting.filter((item) => now() - item.at <= UNDELIVERED_TTL_MS);
      const stale = waiting.filter((item) => now() - item.at > UNDELIVERED_TTL_MS);
      if (fresh.length > 0) undelivered.set(brokerId, fresh);
      else undelivered.delete(brokerId);
      for (const item of stale) await editRequest(brokerId, item.mandateId, "undelivered");
    }
  }

  return { connect, handleStart, handleUnpairCommand, handleButton, sweep };
}

export type Hub = ReturnType<typeof createHub>;
```

- [ ] **Step 4: Run tests and typecheck**

Run (from `relay/`): `npm test && npm run typecheck`
Expected: all tests pass (`# fail 0`); typecheck clean.

- [ ] **Step 5: Commit**

```bash
cd /Users/ank/Documents/AgentCollar
git add relay/src/hub.ts relay/test/hub-approval.test.ts
git commit -m "Relay step 6: approval requests to the paired Telegram user, only that user's presses count, status edits, 10-minute queue for offline brokers"
```

---

### Task 7: Relay — real Telegram API, update routing, server

**Files:**
- Create: `relay/src/telegram-api.ts`, `relay/src/updates.ts`, `relay/src/server.ts`
- Test: `relay/test/updates.test.ts`

**Interfaces:**
- Consumes: `TelegramApi`, `Hub`, `ButtonPress`, `createHub` (Task 6); `openStore` (Task 2); `InlineButton` (Task 3).
- Produces:
  - `telegram-api.ts`: `type Update = { update_id: number; message?: { from?: { id: number; first_name?: string }; chat: { id: number; type: string }; text?: string }; callback_query?: { id: string; from: { id: number }; data?: string } }`; `createTelegramApi(botToken: string): { api: TelegramApi; getMe(): Promise<{ username: string }>; getUpdates(offset: number): Promise<Update[]> }`
  - `updates.ts`: `routeUpdate(hub: Pick<Hub, "handleStart" | "handleUnpairCommand" | "handleButton">, update: Update): Promise<void>`
  - `npm start` in `relay/` runs the relay on `ws://127.0.0.1:8788`.

- [ ] **Step 1: Write the failing test** — `relay/test/updates.test.ts`

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import type { ButtonPress } from "../src/hub.ts";
import { routeUpdate } from "../src/updates.ts";

function spyHub() {
  const calls: unknown[][] = [];
  return {
    calls,
    hub: {
      handleStart: async (fromId: number, fromName: string, code: string) => void calls.push(["start", fromId, fromName, code]),
      handleUnpairCommand: async (fromId: number) => void calls.push(["unpair", fromId]),
      handleButton: async (press: ButtonPress) => void calls.push(["button", press]),
    },
  };
}

const privateMessage = (text: string) => ({
  update_id: 1,
  message: { from: { id: 42, first_name: "Ank" }, chat: { id: 42, type: "private" }, text },
});

test("/start <code> in a private chat -> handleStart", async () => {
  const { hub, calls } = spyHub();
  await routeUpdate(hub, privateMessage("/start 7F3K92QD"));
  assert.deepEqual(calls, [["start", 42, "Ank", "7F3K92QD"]]);
});

test("/start alone -> handleStart with an empty code", async () => {
  const { hub, calls } = spyHub();
  await routeUpdate(hub, privateMessage("/start"));
  assert.deepEqual(calls, [["start", 42, "Ank", ""]]);
});

test("/unpair -> handleUnpairCommand", async () => {
  const { hub, calls } = spyHub();
  await routeUpdate(hub, privateMessage("/unpair"));
  assert.deepEqual(calls, [["unpair", 42]]);
});

test("messages in groups are ignored (pairing happens only in a private chat)", async () => {
  const { hub, calls } = spyHub();
  await routeUpdate(hub, { update_id: 1, message: { from: { id: 42 }, chat: { id: -100, type: "group" }, text: "/start 7F3K92QD" } });
  assert.deepEqual(calls, []);
});

test("button press -> handleButton with who pressed and the data", async () => {
  const { hub, calls } = spyHub();
  await routeUpdate(hub, { update_id: 1, callback_query: { id: "q1", from: { id: 42 }, data: "approve:0a1b2c3d4e5f:a935774d" } });
  assert.deepEqual(calls, [["button", { queryId: "q1", fromId: 42, data: "approve:0a1b2c3d4e5f:a935774d" }]]);
});

test("other text is ignored", async () => {
  const { hub, calls } = spyHub();
  await routeUpdate(hub, privateMessage("hello bot"));
  assert.deepEqual(calls, []);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from `relay/`): `npm test`
Expected: FAIL — `Cannot find module '../src/updates.ts'`.

- [ ] **Step 3: Implement** — `relay/src/telegram-api.ts`

```ts
// The real Telegram Bot API, with fetch. The bot token is part of the URL,
// so we never print URLs or request objects.
import type { InlineButton } from "./format.ts";
import type { TelegramApi } from "./hub.ts";

// The small part of Telegram's update format that the relay uses.
export type Update = {
  update_id: number;
  message?: { from?: { id: number; first_name?: string }; chat: { id: number; type: string }; text?: string };
  callback_query?: { id: string; from: { id: number }; data?: string };
};

export function createTelegramApi(botToken: string) {
  async function call(method: string, params: object): Promise<unknown> {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(params),
    });
    const data = (await response.json()) as { ok: boolean; result?: unknown; description?: string };
    if (!data.ok) throw new Error(`Telegram ${method} failed: ${data.description}`);
    return data.result;
  }

  // Plain text only (no parse_mode): agent-written text must not format anything.
  const api: TelegramApi = {
    async sendMessage(chatId: number, text: string, buttons: InlineButton[][] = []) {
      const result = (await call("sendMessage", { chat_id: chatId, text, reply_markup: { inline_keyboard: buttons } })) as {
        message_id: number;
      };
      return result.message_id;
    },
    async editMessage(chatId: number, messageId: number, text: string, buttons: InlineButton[][] = []) {
      await call("editMessageText", { chat_id: chatId, message_id: messageId, text, reply_markup: { inline_keyboard: buttons } });
    },
    async answerButton(queryId: string, text: string) {
      await call("answerCallbackQuery", { callback_query_id: queryId, text });
    },
  };

  return {
    api,
    getMe: async () => (await call("getMe", {})) as { username: string },
    // Long polling: Telegram holds the request up to 30 s until something happens.
    getUpdates: async (offset: number) =>
      (await call("getUpdates", { offset, timeout: 30, allowed_updates: ["message", "callback_query"] })) as Update[],
  };
}
```

- [ ] **Step 4: Implement** — `relay/src/updates.ts`

```ts
// Turns one Telegram update into one hub call.
import type { Hub } from "./hub.ts";
import type { Update } from "./telegram-api.ts";

export async function routeUpdate(
  hub: Pick<Hub, "handleStart" | "handleUnpairCommand" | "handleButton">,
  update: Update,
): Promise<void> {
  if (update.callback_query !== undefined) {
    const query = update.callback_query;
    return hub.handleButton({ queryId: query.id, fromId: query.from.id, data: query.data ?? "" });
  }

  const message = update.message;
  // Commands count only in a private chat with the bot, never in groups.
  if (message === undefined || message.chat.type !== "private" || message.from === undefined || message.text === undefined) return;

  const [command = "", code = ""] = message.text.trim().split(/\s+/);
  if (command === "/start") return hub.handleStart(message.from.id, message.from.first_name ?? "", code);
  if (command === "/unpair") return hub.handleUnpairCommand(message.from.id);
}
```

- [ ] **Step 5: Implement** — `relay/src/server.ts`

```ts
// The relay server: WebSocket for brokers + Telegram long polling, both feeding the hub.
// Run: npm start   (needs RELAY_BOT_TOKEN in relay/.env)
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { WebSocketServer } from "ws";
import { createHub } from "./hub.ts";
import { openStore } from "./store.ts";
import { createTelegramApi } from "./telegram-api.ts";
import { routeUpdate } from "./updates.ts";

const envFile = join(import.meta.dirname, "..", ".env");
if (existsSync(envFile)) process.loadEnvFile(envFile);

const botToken = process.env.RELAY_BOT_TOKEN ?? "";
if (botToken === "") {
  console.error("RELAY_BOT_TOKEN is missing: cp .env.example .env and put the bot token there");
  process.exit(1);
}
const HOST = process.env.RELAY_HOST ?? "127.0.0.1";
const PORT = Number(process.env.RELAY_PORT ?? 8788);

const dataDir = join(import.meta.dirname, "..", "data");
mkdirSync(dataDir, { recursive: true });
const store = openStore(join(dataDir, "relay.db"));

const telegram = createTelegramApi(botToken);
const me = await telegram.getMe();
const hub = createHub({ store, telegram: telegram.api, botUsername: me.username, log: (text) => console.log(text) });

// Brokers connect here. maxPayload: no message bigger than 16 KB.
const wss = new WebSocketServer({ host: HOST, port: PORT, maxPayload: 16 * 1024 });
wss.on("connection", (socket, request) => {
  const ip = request.socket.remoteAddress ?? "unknown";
  const session = hub.connect({ send: (message) => socket.send(JSON.stringify(message)), close: () => socket.close() }, ip);
  socket.on("message", (data) => {
    session.onMessage(data.toString()).catch((error: Error) => console.error(`Broker message failed: ${error.message}`));
  });
  socket.on("close", () => session.onClose());
});
console.log(`Relay listening on ws://${HOST}:${PORT}, bot @${me.username}`);

setInterval(() => {
  hub.sweep().catch((error: Error) => console.error(`Sweep failed: ${error.message}`));
}, 30_000);

// Telegram long polling, forever.
let offset = 0;
while (true) {
  try {
    const updates = await telegram.getUpdates(offset);
    for (const update of updates) {
      offset = update.update_id + 1; // mark as handled, even if handling fails
      await routeUpdate(hub, update).catch((error: Error) => console.error(`Update failed: ${error.message}`));
    }
  } catch (error) {
    console.error(`Telegram: ${(error as Error).message}, retrying in 5 s`);
    await sleep(5000);
  }
}
```

- [ ] **Step 6: Run tests, typecheck, and the missing-token smoke check**

Run (from `relay/`): `npm test && npm run typecheck && npm start`
Expected: tests pass (`# fail 0`), typecheck clean, then `npm start` (without `relay/.env`) prints `RELAY_BOT_TOKEN is missing: cp .env.example .env and put the bot token there` and exits with code 1.

- [ ] **Step 7: Commit**

```bash
cd /Users/ank/Documents/AgentCollar
git add relay/src/telegram-api.ts relay/src/updates.ts relay/src/server.ts relay/test/updates.test.ts
git commit -m "Relay step 7: real Telegram API, update routing (private chats only), relay server with WebSocket + long polling"
```

---

### Task 8: Broker — test setup, separate audit log for tests, pending timeout helper

**Files:**
- Modify: `broker/package.json` (add `test` script), `broker/tsconfig.json` (include `test`)
- Modify: `broker/src/audit.ts:1-7`
- Modify: `broker/src/mandate.ts` (type `Mandate`, `requestMandate`, new `findStalePending`)
- Test: `broker/test/mandate.test.ts`

**Interfaces:**
- Consumes: existing `requestMandate`, `approve`, `check`.
- Produces: `Mandate.createdAt: number`; `findStalePending(maxAgeMs: number, now?: number): Mandate[]`; env `BROKER_AUDIT_LOG` overrides the audit file path; `npm test` in `broker/`.

- [ ] **Step 1: Test setup**

In `broker/package.json` add to `"scripts"`:
```json
    "test": "BROKER_AUDIT_LOG=${TMPDIR:-/tmp}/agentcollar-test-audit.log tsx --test test/*.test.ts",
```

In `broker/tsconfig.json` change `"include": ["src"]` to:
```json
  "include": ["src", "test"]
```

In `broker/src/audit.ts` replace:
```ts
import { join } from "node:path";

// broker/data/audit.log, found from this file's folder (broker/src),
// so it lands in the same place no matter where you run the command from.
const dataDir = join(import.meta.dirname, "..", "data");
const logFile = join(dataDir, "audit.log");
```
with:
```ts
import { dirname, join } from "node:path";

// broker/data/audit.log, found from this file's folder (broker/src),
// so it lands in the same place no matter where you run the command from.
// Tests set BROKER_AUDIT_LOG to a temp file, so they never write into your real log.
const logFile = process.env.BROKER_AUDIT_LOG ?? join(import.meta.dirname, "..", "data", "audit.log");
const dataDir = dirname(logFile);
```

- [ ] **Step 2: Write the failing test** — `broker/test/mandate.test.ts`

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { check } from "../src/check.ts";
import { approve, findStalePending, requestMandate } from "../src/mandate.ts";

test("a new mandate remembers when it was requested", () => {
  const before = Date.now();
  const mandate = requestMandate("agent", "task", ["gmail.read"], 60, 1);
  assert.ok(mandate.createdAt >= before && mandate.createdAt <= Date.now());
});

test("a pending mandate becomes stale after 10 minutes, not before", () => {
  const mandate = requestMandate("agent", "task", ["gmail.read"], 60, 1);
  const tenMinutes = 10 * 60 * 1000;
  assert.equal(findStalePending(tenMinutes, mandate.createdAt + tenMinutes - 1).includes(mandate), false);
  assert.equal(findStalePending(tenMinutes, mandate.createdAt + tenMinutes + 1).includes(mandate), true);
});

test("an approved mandate is never stale", () => {
  const mandate = requestMandate("agent", "task", ["gmail.read"], 60, 1);
  approve(mandate.id);
  assert.equal(findStalePending(0, mandate.createdAt + 1_000_000).includes(mandate), false);
});

test("check() refuses a pending mandate", () => {
  const mandate = requestMandate("agent", "task", ["gmail.read"], 60, 1);
  assert.equal(check(mandate.token, "gmail.read").code, "not_approved");
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run (from `broker/`): `npm test`
Expected: FAIL — `findStalePending` is not exported / `createdAt` is undefined.

- [ ] **Step 4: Implement** — `broker/src/mandate.ts`

In `type Mandate`, after `revoked: boolean;` add:
```ts
  createdAt: number; // when the agent asked (milliseconds); used for the 10-minute pending timeout
```

In `requestMandate`, in the object literal after `revoked: false,` add:
```ts
    createdAt: Date.now(),
```

After the `findById` function add:
```ts
// Pending mandates nobody answered for longer than maxAgeMs (the server uses 10 minutes).
export function findStalePending(maxAgeMs: number, now: number = Date.now()): Mandate[] {
  return [...mandates.values()].filter((mandate) => mandate.status === "pending" && now - mandate.createdAt > maxAgeMs);
}
```

- [ ] **Step 5: Run tests, typecheck and the Phase 1 demo**

Run (from `broker/`): `npm test && npm run typecheck && npm run demo | tail -3`
Expected: 4 tests pass; typecheck clean; demo ends with `Every attempt above is also written to data/audit.log`. `ls ${TMPDIR:-/tmp}/agentcollar-test-audit.log` exists (tests wrote there, not to `broker/data/audit.log`).

- [ ] **Step 6: Commit**

```bash
cd /Users/ank/Documents/AgentCollar
git add broker/package.json broker/tsconfig.json broker/src/audit.ts broker/src/mandate.ts broker/test/mandate.test.ts
git commit -m "Broker: npm test with node:test, tests use a temp audit log, mandates remember createdAt for the pending timeout"
```

---

### Task 9: Broker identity (Ed25519 keys)

**Files:**
- Create: `broker/src/identity.ts`
- Test: `broker/test/identity.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `type Identity = { brokerId: string | null; name: string; publicKey: string; privateKey: string }`; `defaultIdentityFile: string` (= `broker/data/identity.json`); `loadOrCreateIdentity(file?: string): Identity`; `saveIdentity(identity: Identity, file?: string): void`; `signNonce(identity: Identity, nonce: string): string` (base64 in, base64 out). `publicKey` format matches `relay/src/crypto.ts` (`base64` of SPKI DER).

- [ ] **Step 1: Write the failing test** — `broker/test/identity.test.ts`

```ts
import assert from "node:assert/strict";
import { createPublicKey, verify } from "node:crypto";
import { mkdtempSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { loadOrCreateIdentity, saveIdentity, signNonce } from "../src/identity.ts";

function tempFile(): string {
  return join(mkdtempSync(join(tmpdir(), "identity-")), "identity.json");
}

test("creates an identity once, then loads the same one", () => {
  const file = tempFile();
  const first = loadOrCreateIdentity(file);
  const second = loadOrCreateIdentity(file);
  assert.equal(first.brokerId, null);
  assert.ok(first.name.length > 0);
  assert.equal(second.publicKey, first.publicKey);
  assert.equal(second.privateKey, first.privateKey);
});

test("the identity file is readable only by its owner (600)", () => {
  const file = tempFile();
  loadOrCreateIdentity(file);
  assert.equal(statSync(file).mode & 0o777, 0o600);
});

test("the brokerId given by the relay is saved", () => {
  const file = tempFile();
  const identity = loadOrCreateIdentity(file);
  saveIdentity({ ...identity, brokerId: "0a1b2c3d4e5f" }, file);
  assert.equal(loadOrCreateIdentity(file).brokerId, "0a1b2c3d4e5f");
});

test("signNonce makes a signature the relay can verify with the public key", () => {
  const identity = loadOrCreateIdentity(tempFile());
  const nonce = Buffer.from("random challenge").toString("base64");
  const key = createPublicKey({ key: Buffer.from(identity.publicKey, "base64"), format: "der", type: "spki" });
  const signature = Buffer.from(signNonce(identity, nonce), "base64");
  assert.equal(key.asymmetricKeyType, "ed25519");
  assert.equal(verify(null, Buffer.from(nonce, "base64"), key, signature), true);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from `broker/`): `npm test`
Expected: FAIL — `Cannot find module '../src/identity.ts'`.

- [ ] **Step 3: Implement** — `broker/src/identity.ts`

```ts
// The broker's identity for the relay: an Ed25519 key pair + the id the relay gave us.
// The private key never leaves this computer; the relay only ever sees the public key
// and signatures. (Phase 4 moves the private key into the macOS Keychain.)
import { createPrivateKey, generateKeyPairSync, sign } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { dirname, join } from "node:path";

export type Identity = {
  brokerId: string | null; // null until the relay accepts our first "register"
  name: string; // shown in Telegram: «Брокер «MacBook-Air»»
  publicKey: string; // base64 SPKI DER: safe to share
  privateKey: string; // PEM: SECRET
};

// broker/data/ is in .gitignore, so this file is never committed.
export const defaultIdentityFile = join(import.meta.dirname, "..", "data", "identity.json");

export function loadOrCreateIdentity(file: string = defaultIdentityFile): Identity {
  if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8")) as Identity;

  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const identity: Identity = {
    brokerId: null,
    name: hostname().replace(/\.local$/, "").slice(0, 64) || "broker",
    publicKey: publicKey.export({ format: "der", type: "spki" }).toString("base64"),
    privateKey: privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
  };
  saveIdentity(identity, file);
  return identity;
}

// mode 0o600: only your macOS user can read the file (no other users of this Mac).
export function saveIdentity(identity: Identity, file: string = defaultIdentityFile): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(identity, null, 2), { mode: 0o600 });
}

// Answer to the relay's challenge: proves we own the private key without revealing it.
export function signNonce(identity: Identity, nonce: string): string {
  return sign(null, Buffer.from(nonce, "base64"), createPrivateKey(identity.privateKey)).toString("base64");
}
```

- [ ] **Step 4: Run tests and typecheck**

Run (from `broker/`): `npm test && npm run typecheck`
Expected: all tests pass (`# fail 0`); typecheck clean.

- [ ] **Step 5: Commit**

```bash
cd /Users/ank/Documents/AgentCollar
git add broker/src/identity.ts broker/test/identity.test.ts
git commit -m "Broker: Ed25519 identity in data/identity.json (owner-only file) and challenge signing"
```

---

### Task 10: Broker relay client

**Files:**
- Create: `broker/src/relay-client.ts`
- Test: `broker/test/relay-client.test.ts`

**Interfaces:**
- Consumes: `Identity`, `saveIdentity`, `signNonce` (Task 9); `decide`, `askInTerminal` (`broker/src/approval.ts`); `writeAudit` (`broker/src/audit.ts`, signature `writeAudit(agent: string, action: string, allowed: boolean, reason: string)`); `findById`, `mandates`, `Mandate` (`broker/src/mandate.ts`); types `RelayToBroker`, `MandateUpdateStatus` from `relay/src/protocol.ts` (Task 1, `import type` only).
- Produces:
  - `type SocketLike = { onopen: (() => void) | null; onmessage: ((event: { data: unknown }) => void) | null; onclose: (() => void) | null; onerror: (() => void) | null; send(data: string): void; close(): void }`
  - `type RelayClientOptions = { url: string; identity: Identity; identityFile?: string; reconnect?: boolean; openSocket?: (url: string) => SocketLike; askHuman?: (mandate: Mandate) => void; onEvent?: (message: RelayToBroker) => void; onDisconnect?: () => void; log?: (text: string) => void }`
  - `type RelayClient = { isReady(): boolean; isPaired(): boolean; requestApproval(mandate: Mandate): boolean; notifyStatus(mandateId: string, status: MandateUpdateStatus): void; startPairing(): void; unpair(): void; close(): void }`
  - `createRelayClient(options: RelayClientOptions): RelayClient`

- [ ] **Step 1: Write the failing test** — `broker/test/relay-client.test.ts`

```ts
import assert from "node:assert/strict";
import { createPublicKey, verify } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mock, test } from "node:test";
import { loadOrCreateIdentity } from "../src/identity.ts";
import { deny, requestMandate, type Mandate } from "../src/mandate.ts";
import { createRelayClient, type SocketLike } from "../src/relay-client.ts";

class FakeSocket implements SocketLike {
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  sent: Record<string, unknown>[] = [];
  send(data: string): void {
    this.sent.push(JSON.parse(data) as Record<string, unknown>);
  }
  close(): void {
    this.onclose?.();
  }
  receive(message: object): void {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
  last(): Record<string, unknown> | undefined {
    return this.sent[this.sent.length - 1];
  }
}

function setup(options: { paired?: boolean; brokerId?: string | null } = {}) {
  const file = join(mkdtempSync(join(tmpdir(), "relay-client-")), "identity.json");
  const identity = loadOrCreateIdentity(file);
  if (options.brokerId !== undefined) identity.brokerId = options.brokerId;
  const sockets: FakeSocket[] = [];
  const askedHuman: Mandate[] = [];
  const client = createRelayClient({
    url: "ws://relay.test",
    identity,
    identityFile: file,
    openSocket: () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    },
    askHuman: (mandate) => void askedHuman.push(mandate),
    log: () => {},
  });
  const socket = () => sockets[sockets.length - 1] as FakeSocket;
  socket().onopen?.();
  const becomeReady = (paired = options.paired ?? true) =>
    socket().receive({ type: "ready", brokerId: identity.brokerId ?? "0a1b2c3d4e5f", paired });
  return { client, identity, file, sockets, socket, askedHuman, becomeReady };
}

test("a new broker registers with its public key and name", () => {
  const { socket, identity } = setup();
  assert.deepEqual(socket().sent[0], { type: "register", publicKey: identity.publicKey, name: identity.name });
});

test("a known broker says hello with its id", () => {
  const { socket } = setup({ brokerId: "0a1b2c3d4e5f" });
  assert.deepEqual(socket().sent[0], { type: "hello", brokerId: "0a1b2c3d4e5f" });
});

test("answers the challenge with a valid signature", () => {
  const { socket, identity } = setup();
  const nonce = Buffer.from("challenge").toString("base64");
  socket().receive({ type: "challenge", nonce });
  const { signature } = socket().last() as { signature: string };
  const key = createPublicKey({ key: Buffer.from(identity.publicKey, "base64"), format: "der", type: "spki" });
  assert.equal(verify(null, Buffer.from(nonce, "base64"), key, Buffer.from(signature, "base64")), true);
});

test("saves the brokerId from 'ready'", () => {
  const { socket, file } = setup();
  socket().receive({ type: "ready", brokerId: "abcdefabcdef", paired: false });
  assert.equal(loadOrCreateIdentity(file).brokerId, "abcdefabcdef");
});

test("requestApproval: false when not paired, sends the request when paired", () => {
  const { client, socket, becomeReady } = setup();
  const mandate = requestMandate("digest-agent", "Summarize", ["gmail.read"], 300, 10);
  assert.equal(client.requestApproval(mandate), false);
  becomeReady(true);
  assert.equal(client.requestApproval(mandate), true);
  assert.deepEqual(socket().last(), {
    type: "approval_request",
    mandateId: mandate.id,
    agent: "digest-agent",
    task: "Summarize",
    actions: ["gmail.read"],
    expiresInSeconds: 300,
    limit: 10,
  });
});

test("a decision is applied through decide() and reported back", () => {
  const { socket, becomeReady } = setup();
  becomeReady();
  const mandate = requestMandate("agent", "task", ["gmail.read"], 300, 10);
  socket().receive({ type: "decision", mandateId: mandate.id, decision: "approve" });
  assert.equal(mandate.status, "approved");
  assert.deepEqual(socket().last(), { type: "mandate_update", mandateId: mandate.id, status: "approved" });
});

test("approve after deny changes nothing and reports the real status", () => {
  const { socket, becomeReady } = setup();
  becomeReady();
  const mandate = requestMandate("agent", "task", ["gmail.read"], 300, 10);
  deny(mandate.id);
  socket().receive({ type: "decision", mandateId: mandate.id, decision: "approve" });
  assert.equal(mandate.status, "denied");
  assert.deepEqual(socket().last(), { type: "mandate_update", mandateId: mandate.id, status: "denied" });
});

test("a decision for a mandate this broker does not know -> 'gone'", () => {
  const { socket, becomeReady } = setup();
  becomeReady();
  socket().receive({ type: "decision", mandateId: "deadbeef", decision: "approve" });
  assert.deepEqual(socket().last(), { type: "mandate_update", mandateId: "deadbeef", status: "gone" });
});

test("human_unreachable -> ask the human locally (terminal)", () => {
  const { socket, becomeReady, askedHuman } = setup();
  becomeReady();
  const mandate = requestMandate("agent", "task", ["gmail.read"], 300, 10);
  socket().receive({ type: "human_unreachable", mandateId: mandate.id });
  assert.deepEqual(askedHuman, [mandate]);
});

test("after reconnecting while paired, pending requests are sent again", () => {
  const { socket, becomeReady } = setup();
  const mandate = requestMandate("agent", "task", ["gmail.read"], 300, 10);
  becomeReady(true);
  assert.ok(socket().sent.some((m) => m.type === "approval_request" && m.mandateId === mandate.id));
});

test("'unknown broker' (relay lost its data) -> forget the id and register next time", () => {
  const { socket, file } = setup({ brokerId: "0a1b2c3d4e5f" });
  socket().receive({ type: "error", message: "unknown broker" });
  assert.equal(loadOrCreateIdentity(file).brokerId, null);
});

test("reconnects after 1 s, then 2 s (backoff)", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const { sockets, socket } = setup();
    socket().close();
    mock.timers.tick(999);
    assert.equal(sockets.length, 1);
    mock.timers.tick(1);
    assert.equal(sockets.length, 2);
    socket().close();
    mock.timers.tick(1999);
    assert.equal(sockets.length, 2);
    mock.timers.tick(1);
    assert.equal(sockets.length, 3);
  } finally {
    mock.timers.reset();
  }
});

test("close() stops reconnecting", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const { client, sockets } = setup();
    client.close();
    mock.timers.tick(120_000);
    assert.equal(sockets.length, 1);
  } finally {
    mock.timers.reset();
  }
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from `broker/`): `npm test`
Expected: FAIL — `Cannot find module '../src/relay-client.ts'`.

- [ ] **Step 3: Implement** — `broker/src/relay-client.ts`

```ts
// The broker's connection to the relay: one outbound WebSocket.
// No open port on this computer is needed: WE connect out, the relay never connects in.
import type { MandateUpdateStatus, RelayToBroker } from "../../relay/src/protocol.ts";
import { askInTerminal, decide } from "./approval.ts";
import { writeAudit } from "./audit.ts";
import { saveIdentity, signNonce, type Identity } from "./identity.ts";
import { findById, mandates, type Mandate } from "./mandate.ts";

// The part of the browser-style WebSocket we use (Node 22 has it built in as `WebSocket`).
export type SocketLike = {
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
  send(data: string): void;
  close(): void;
};

export type RelayClientOptions = {
  url: string;
  identity: Identity;
  identityFile?: string;
  reconnect?: boolean; // the server: true (default); one-shot CLIs: false
  openSocket?: (url: string) => SocketLike; // tests pass a fake
  askHuman?: (mandate: Mandate) => void; // fallback when Telegram is unreachable (default: terminal)
  onEvent?: (message: RelayToBroker) => void; // pair/unpair CLIs listen here
  onDisconnect?: () => void;
  log?: (text: string) => void;
};

export type RelayClient = {
  isReady(): boolean;
  isPaired(): boolean;
  requestApproval(mandate: Mandate): boolean; // false -> the caller must ask the human another way
  notifyStatus(mandateId: string, status: MandateUpdateStatus): void;
  startPairing(): void;
  unpair(): void;
  close(): void;
};

export function createRelayClient(options: RelayClientOptions): RelayClient {
  const { identity } = options;
  const openSocket = options.openSocket ?? ((url: string) => new WebSocket(url) as unknown as SocketLike);
  const askHuman = options.askHuman ?? askInTerminal;
  const log = options.log ?? ((text: string) => console.log(text));

  let socket: SocketLike | null = null;
  let ready = false;
  let paired = false;
  let stopped = false;
  let delayMs = 1000;

  function send(message: object): void {
    socket?.send(JSON.stringify(message));
  }

  // Only facts and the agent's words go to the relay: never the mandate token.
  function toRequest(mandate: Mandate): object {
    return {
      type: "approval_request",
      mandateId: mandate.id,
      agent: mandate.agent,
      task: mandate.task,
      actions: mandate.allowedActions,
      expiresInSeconds: mandate.expiresInSeconds,
      limit: mandate.limit,
    };
  }

  function statusOf(mandate: Mandate | undefined): MandateUpdateStatus | null {
    if (mandate === undefined) return "gone"; // we were restarted: this mandate no longer exists
    if (mandate.revoked) return "revoked";
    if (mandate.status === "approved") return "approved";
    if (mandate.status === "denied") return "denied";
    return null; // still pending: nothing to report
  }

  function handle(message: RelayToBroker): void {
    switch (message.type) {
      case "challenge":
        send({ type: "auth", signature: signNonce(identity, message.nonce) });
        break;
      case "ready":
        ready = true;
        paired = message.paired;
        delayMs = 1000;
        if (identity.brokerId !== message.brokerId) {
          identity.brokerId = message.brokerId;
          saveIdentity(identity, options.identityFile);
        }
        log(`Relay: connected as ${message.brokerId}, ${paired ? "paired with Telegram" : "not paired yet (npm run pair)"}`);
        // Requests made while we were offline (or before a relay restart) go out now.
        if (paired) {
          for (const mandate of mandates.values()) if (mandate.status === "pending") send(toRequest(mandate));
        }
        break;
      case "paired":
        paired = true;
        log(`Relay: paired with Telegram (${message.telegramName})`);
        break;
      case "unpaired":
        paired = false;
        log("Relay: unpaired, approvals go to the terminal");
        break;
      case "decision": {
        // decide() only changes a pending mandate (revoke: any). Either way we report the real status.
        const mandate = decide(message.mandateId, message.decision, "telegram via relay") ?? findById(message.mandateId);
        const status = statusOf(mandate);
        if (status !== null) send({ type: "mandate_update", mandateId: message.mandateId, status });
        break;
      }
      case "human_unreachable": {
        const mandate = findById(message.mandateId);
        if (mandate?.status === "pending") {
          writeAudit(mandate.agent, "mandate.relay_unreachable", false, `Telegram unreachable, asking locally, mandate ${mandate.id}`);
          askHuman(mandate);
        }
        break;
      }
      case "error":
        log(`Relay error: ${message.message}`);
        // The relay lost our record (e.g. its database was reset): register again next time.
        if (message.message === "unknown broker") {
          identity.brokerId = null;
          saveIdentity(identity, options.identityFile);
        }
        break;
    }
    options.onEvent?.(message);
  }

  function connect(): void {
    ready = false;
    const current = openSocket(options.url);
    socket = current;
    current.onopen = () => {
      send(
        identity.brokerId !== null
          ? { type: "hello", brokerId: identity.brokerId }
          : { type: "register", publicKey: identity.publicKey, name: identity.name },
      );
    };
    current.onmessage = (event) => {
      let message: RelayToBroker;
      try {
        message = JSON.parse(String(event.data)) as RelayToBroker;
      } catch {
        return;
      }
      handle(message);
    };
    current.onerror = () => {}; // onclose always follows and handles it
    current.onclose = () => {
      ready = false;
      options.onDisconnect?.();
      if (stopped || options.reconnect === false) return;
      log(`Relay: disconnected, retrying in ${delayMs / 1000} s`);
      setTimeout(connect, delayMs);
      delayMs = Math.min(delayMs * 2, 60_000); // 1, 2, 4 … 60 s
    };
  }

  connect();

  return {
    isReady: () => ready,
    isPaired: () => paired,
    requestApproval(mandate) {
      if (!ready || !paired) return false;
      send(toRequest(mandate));
      return true;
    },
    notifyStatus(mandateId, status) {
      if (ready) send({ type: "mandate_update", mandateId, status });
    },
    startPairing: () => send({ type: "pair_start" }),
    unpair: () => send({ type: "unpair" }),
    close() {
      stopped = true;
      socket?.close();
    },
  };
}
```

- [ ] **Step 4: Run tests and typecheck**

Run (from `broker/`): `npm test && npm run typecheck`
Expected: all tests pass (`# fail 0`); typecheck clean (it also checks `relay/src/protocol.ts` through the type import).

- [ ] **Step 5: Commit**

```bash
cd /Users/ank/Documents/AgentCollar
git add broker/src/relay-client.ts broker/test/relay-client.test.ts
git commit -m "Broker: relay client (outbound WebSocket, challenge auth, decisions into decide(), terminal fallback, backoff reconnect)"
```

---

### Task 11: Broker wiring — server, pending timeout, pair / unpair / revoke commands

**Files:**
- Create: `broker/src/env.ts`, `broker/src/cli/pair.ts`, `broker/src/cli/unpair.ts`, `broker/src/cli/revoke.ts`
- Modify: `broker/src/server.ts` (imports, env loading, `POST /mandates` channel choice, revoke route, timeout loop, startup message)
- Modify: `broker/package.json` (scripts), `broker/.env.example`

**Interfaces:**
- Consumes: `createRelayClient`, `RelayClient` (Task 10); `loadOrCreateIdentity` (Task 9); `findStalePending` (Task 8); `decide`, `askInTerminal` (existing).
- Produces: `npm run pair`, `npm run unpair`, `npm run revoke -- <id>`; env `AGENTCOLLAR_RELAY_URL` (e.g. `ws://127.0.0.1:8788`). Channel order for a new mandate: relay (if connected and paired) → own bot (`TELEGRAM_BOT_TOKEN`) → terminal.

- [ ] **Step 1: Create** `broker/src/env.ts`

```ts
// Loads broker/.env into process.env (secrets live there, never in the code).
// Imported first by the server and by every CLI command.
import { existsSync } from "node:fs";
import { join } from "node:path";

const envFile = join(import.meta.dirname, "..", ".env");
if (existsSync(envFile)) {
  process.loadEnvFile(envFile); // built into Node: puts the lines of .env into process.env
}
```

- [ ] **Step 2: Modify** `broker/src/server.ts`

Replace the import block and the env loading:
```ts
import { existsSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { join } from "node:path";
import { askInTerminal, decide, oneLine } from "./approval.ts";
import { check, type CheckCode } from "./check.ts";
import { createDraft, listInbox, sendEmail } from "./gmail-fake.ts";
import { mandates, requestMandate, type Mandate } from "./mandate.ts";
import { sendApprovalRequest, startTelegramPolling, type TelegramConfig } from "./telegram.ts";

// --- configuration from broker/.env (secrets live there, never in the code) ---

const envFile = join(import.meta.dirname, "..", ".env");
if (existsSync(envFile)) {
  process.loadEnvFile(envFile); // built into Node: puts the lines of .env into process.env
}
```
with:
```ts
import "./env.ts"; // first: loads broker/.env into process.env
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { askInTerminal, decide, oneLine } from "./approval.ts";
import { check, type CheckCode } from "./check.ts";
import { createDraft, listInbox, sendEmail } from "./gmail-fake.ts";
import { loadOrCreateIdentity } from "./identity.ts";
import { findStalePending, mandates, requestMandate, type Mandate } from "./mandate.ts";
import { createRelayClient } from "./relay-client.ts";
import { sendApprovalRequest, startTelegramPolling, type TelegramConfig } from "./telegram.ts";

// --- configuration from broker/.env (loaded by env.ts) ---
```

After the line `const telegram = telegramConfig();` add:
```ts

// The official bot through the relay (if AGENTCOLLAR_RELAY_URL is set). Takes priority over the own bot.
const relayUrl = process.env.AGENTCOLLAR_RELAY_URL ?? "";
const relay = relayUrl === "" ? undefined : createRelayClient({ url: relayUrl, identity: loadOrCreateIdentity() });

// A pending mandate nobody answered becomes "denied" after 10 minutes (fail closed).
const PENDING_TIMEOUT_MS = 10 * 60 * 1000;
```

In `route()`, replace:
```ts
    if (telegram) {
      // If Telegram is down, fall back to the terminal instead of losing the request.
      await sendApprovalRequest(telegram, mandate).catch((error: Error) => {
        console.error(`Telegram: could not send the request (${error.message}), asking in the terminal`);
        askInTerminal(mandate);
      });
    } else {
      askInTerminal(mandate);
    }
```
with:
```ts
    // Who asks the human: the relay (official bot) -> own bot -> this terminal.
    if (relay?.requestApproval(mandate)) {
      // sent; the decision comes back through the relay client
    } else if (telegram) {
      // If Telegram is down, fall back to the terminal instead of losing the request.
      await sendApprovalRequest(telegram, mandate).catch((error: Error) => {
        console.error(`Telegram: could not send the request (${error.message}), asking in the terminal`);
        askInTerminal(mandate);
      });
    } else {
      askInTerminal(mandate);
    }
```

In the revoke route, replace:
```ts
    const mandate = decide(revokeMatch[1], "revoke", "http");
    if (mandate === undefined) throw new HttpError(404, "no such mandate");
    return sendJson(res, 200, publicView(mandate));
```
with:
```ts
    const mandate = decide(revokeMatch[1], "revoke", "http");
    if (mandate === undefined) throw new HttpError(404, "no such mandate");
    relay?.notifyStatus(mandate.id, "revoked"); // so the Telegram message does not lie
    return sendJson(res, 200, publicView(mandate));
```

Replace the `server.listen(...)` block:
```ts
server.listen(PORT, HOST, () => {
  console.log(`Broker listening on http://${HOST}:${PORT}`);
  console.log(telegram ? "Approvals: Telegram" : "Approvals: this terminal (no TELEGRAM_BOT_TOKEN in .env)");
});
```
with:
```ts
server.listen(PORT, HOST, () => {
  console.log(`Broker listening on http://${HOST}:${PORT}`);
  if (relay) console.log(`Approvals: official bot via relay ${relayUrl} (falls back to ${telegram ? "own bot" : "this terminal"})`);
  else console.log(telegram ? "Approvals: own Telegram bot" : "Approvals: this terminal (no TELEGRAM_BOT_TOKEN in .env)");
});

setInterval(() => {
  for (const mandate of findStalePending(PENDING_TIMEOUT_MS)) {
    decide(mandate.id, "deny", "timeout");
    relay?.notifyStatus(mandate.id, "timed_out");
    console.log(`Mandate ${mandate.id}: no answer in 10 minutes, denied`);
  }
}, 30_000);
```

- [ ] **Step 3: Create** `broker/src/cli/pair.ts`

```ts
// npm run pair — links this computer's broker to your Telegram through the relay.
// Runs as its own process (never over HTTP), so a local agent cannot re-pair your broker.
import "../env.ts";
import { loadOrCreateIdentity } from "../identity.ts";
import { createRelayClient } from "../relay-client.ts";

const url = process.env.AGENTCOLLAR_RELAY_URL ?? "";
if (url === "") {
  console.error("Нет AGENTCOLLAR_RELAY_URL в broker/.env (для локальной проверки: ws://127.0.0.1:8788)");
  process.exit(1);
}

let done = false;
const client = createRelayClient({
  url,
  identity: loadOrCreateIdentity(),
  reconnect: false,
  log: () => {},
  onEvent(message) {
    if (message.type === "ready") client.startPairing();
    if (message.type === "pair_code") {
      const minutes = Math.round((message.expiresAt - Date.now()) / 60_000);
      console.log(`\nКод привязки: ${message.code}   (действует ${minutes} мин, один раз)`);
      console.log(`Открой на телефоне: ${message.link}`);
      console.log("и нажми Start. Жду...\n");
    }
    if (message.type === "paired") {
      done = true;
      console.log(`✅ Привязано к Telegram: ${message.telegramName}`);
      client.close();
      process.exit(0);
    }
    if (message.type === "error") {
      console.error(`Relay: ${message.message}`);
      process.exit(1);
    }
  },
  onDisconnect() {
    if (!done) {
      console.error("Нет связи с relay. Он запущен? Адрес верный?");
      process.exit(1);
    }
  },
});

setTimeout(() => {
  console.error("Время вышло (10 минут). Запусти npm run pair ещё раз.");
  process.exit(1);
}, 10 * 60 * 1000 + 5_000);
```

- [ ] **Step 4: Create** `broker/src/cli/unpair.ts`

```ts
// npm run unpair — unlinks this computer's broker from Telegram.
import "../env.ts";
import { loadOrCreateIdentity } from "../identity.ts";
import { createRelayClient } from "../relay-client.ts";

const url = process.env.AGENTCOLLAR_RELAY_URL ?? "";
if (url === "") {
  console.error("Нет AGENTCOLLAR_RELAY_URL в broker/.env");
  process.exit(1);
}

let done = false;
const client = createRelayClient({
  url,
  identity: loadOrCreateIdentity(),
  reconnect: false,
  log: () => {},
  onEvent(message) {
    if (message.type === "ready") client.unpair();
    if (message.type === "unpaired") {
      done = true;
      console.log("Отвязано. Запросы мандатов теперь спрашиваются в терминале брокера.");
      client.close();
      process.exit(0);
    }
    if (message.type === "error") {
      console.error(`Relay: ${message.message}`);
      process.exit(1);
    }
  },
  onDisconnect() {
    if (!done) {
      console.error("Нет связи с relay.");
      process.exit(1);
    }
  },
});
```

- [ ] **Step 5: Create** `broker/src/cli/revoke.ts`

```ts
// npm run revoke -- <mandate id> — the local kill switch.
// Talks only to the broker on this computer: works without the relay and without internet.
import "../env.ts";

const id = process.argv[2] ?? "";
if (!/^[0-9a-f]{8}$/.test(id)) {
  console.error("Как использовать: npm run revoke -- <id мандата из 8 символов>");
  process.exit(1);
}

const port = Number(process.env.BROKER_PORT ?? 8787);
const response = await fetch(`http://127.0.0.1:${port}/mandates/${id}/revoke`, { method: "POST" }).catch(() => null);
if (response === null) {
  console.error("Брокер не отвечает. Он запущен (npm run server)?");
  process.exit(1);
}
const body = (await response.json()) as { error?: string };
if (!response.ok) {
  console.error(`Не получилось: ${body.error}`);
  process.exit(1);
}
console.log(`🛑 Мандат ${id} отозван`);
```

- [ ] **Step 6: Scripts and env example**

In `broker/package.json` add to `"scripts"`:
```json
    "pair": "tsx src/cli/pair.ts",
    "unpair": "tsx src/cli/unpair.ts",
    "revoke": "tsx src/cli/revoke.ts",
```

In `broker/.env.example`, before the line `# BROKER_PORT=8787`, add:
```
# Official bot through the relay. For local testing: ws://127.0.0.1:8788
# When set and paired (npm run pair), approvals go there first.
# AGENTCOLLAR_RELAY_URL=

```

- [ ] **Step 7: Verify without a relay**

Run (from `broker/`): `npm test && npm run typecheck && npm run revoke -- abc`
Expected: tests pass; typecheck clean; `Как использовать: npm run revoke -- <id мандата из 8 символов>`.

Then run `npm run revoke -- deadbeef` with the broker NOT running.
Expected: `Брокер не отвечает. Он запущен (npm run server)?`

Then: `AGENTCOLLAR_RELAY_URL=ws://127.0.0.1:8788 npm run pair` with no relay running.
Expected: `Нет связи с relay. Он запущен? Адрес верный?`, exit code 1.

Then: start `npm run server` and `npm run agent` without `AGENTCOLLAR_RELAY_URL` — the Phase 2/3 flow works exactly as before (own bot or terminal).

- [ ] **Step 8: Commit**

```bash
cd /Users/ank/Documents/AgentCollar
git add broker/src/env.ts broker/src/cli broker/src/server.ts broker/package.json broker/.env.example
git commit -m "Broker: approvals via relay first (then own bot, then terminal), 10-minute pending timeout, npm run pair/unpair/revoke"
```

---

### Task 12: End-to-end check with the real bot on localhost

**Files:** none (manual verification; fix and commit only if something fails).

**Interfaces:**
- Consumes: everything above.
- Produces: verified flow «agent → broker → relay → Telegram → button → broker → check() → fake Gmail».

- [ ] **Step 1: Prepare the bot for the relay**

The relay and the broker's own-bot mode must not poll the same bot (Telegram answers `409 Conflict`). In `broker/.env` comment out `TELEGRAM_BOT_TOKEN` and `TELEGRAM_USER_ID` (put `#` in front) and add `AGENTCOLLAR_RELAY_URL=ws://127.0.0.1:8788`.

Create `relay/.env` (from `relay/`):
```bash
read -s "TG_TOKEN?Bot token: " && echo && printf 'RELAY_BOT_TOKEN=%s\n' "$TG_TOKEN" > .env && unset TG_TOKEN && git check-ignore .env
```
Expected: `.env` (the file is ignored by git).

- [ ] **Step 2: Start the relay** (terminal 1, from `relay/`): `npm start`
Expected: `Relay listening on ws://127.0.0.1:8788, bot @<your bot>`.

- [ ] **Step 3: Start the broker** (terminal 2, from `broker/`): `npm run server`
Expected: `Approvals: official bot via relay ws://127.0.0.1:8788 (falls back to this terminal)` and `Relay: connected as <12 hex>, not paired yet (npm run pair)`.

- [ ] **Step 4: Pair** (terminal 3, from `broker/`): `npm run pair`
Expected: a code and a `https://t.me/<bot>?start=<code>` link. Open the link on the phone, press Start → bot says «✅ Брокер «…» привязан»; terminal 3 prints `✅ Привязано к Telegram: …`; terminal 2 prints `Relay: paired with Telegram (…)`.

- [ ] **Step 5: Agent flow** (terminal 3): `npm run agent`
Expected: Telegram message with «Брокер: …» first among the facts → press «✅ Одобрить» → message changes to «✅ Одобрен» with «🛑 Отозвать» → agent prints `approved!`, `200 GET /inbox`, `201 POST /drafts`, `403 POST /send … not allowed`.

- [ ] **Step 6: Kill switch both ways**
Press «🛑 Отозвать» in Telegram → message becomes «🛑 Отозван»; `tail -3 data/audit.log` shows `mandate.revoke`.
Run `npm run agent` again, approve, then `npm run revoke -- <id from the message>` → `🛑 Мандат … отозван` and the Telegram message changes to «🛑 Отозван».

- [ ] **Step 7: Relay down → fail closed**
Stop the relay (Ctrl+C in terminal 1). Run `npm run agent` → the request appears in terminal 2 (terminal approval), Telegram gets nothing. Answer `n` → agent prints `denied, stopping`. Start the relay again → terminal 2 shows `Relay: connected as …, paired with Telegram`.

- [ ] **Step 8: Secrets check and wrap-up**

Run (from repo root): `git status --short && git check-ignore broker/.env relay/.env broker/data/identity.json relay/data/relay.db`
Expected: no `.env`, `data/` or `identity.json` in `git status`; `check-ignore` lists all four paths.

Ask the human before any `git push`.
