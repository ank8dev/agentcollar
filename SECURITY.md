# Security policy

## Status

AgentCollar is an **early hobby project**. Use it at your own risk and do not connect accounts you
can't afford to lose. There is no company and no security team behind it: one maintainer, best effort.

## Supported versions

Only the **latest published version** of [`agentcollar`](https://www.npmjs.com/package/agentcollar)
gets fixes. Older versions are not patched; please upgrade (`npm install -g agentcollar@latest`).

## Reporting a vulnerability

**Please do not open a public issue for a security problem.**

Report it privately through GitHub:
**[Report a vulnerability](https://github.com/ank8dev/agentcollar/security/advisories/new)**
(repository → *Security* tab → *Report a vulnerability*). Only the maintainer can see the report.

Helpful to include: the version (`agcl --help` header or `npm ls -g agentcollar`), your OS and Node
version, the steps to reproduce, and what you expected instead.

**Response time:** best effort — this is a hobby project. I will try to acknowledge a report within
a week and to fix confirmed issues in scope as soon as I reasonably can. I will credit you in the
release notes unless you prefer not to be named.

## In scope

The broker's job is to let an agent do only what you approved. Anything that breaks that promise
is in scope, in particular:

- **Bypassing the 6 checks** — any request that reaches the mailbox although the token is unknown,
  the mandate is not approved, expired or revoked, the action is not in the mandate, or the limit is
  reached.
- **Approving a mandate any other way** than in Telegram (only the configured user id) or in the
  broker's own terminal: over HTTP, through files in `~/.agentcollar/`, through the MCP server, by
  another Telegram user, or by replaying an old decision.
- **Leaking a mandate token** — into the audit log, the mandates snapshot, an MCP response shown to
  the model, Telegram messages, or terminal output.
- **Requests from a browser** reaching the broker on `127.0.0.1` (for example via DNS rebinding,
  CSRF or a missing `Host` / `Origin` / content-type check).
- **Forging the audit log** (making one request look like several lines, or hiding a request) or
  **spoofing the approval message** (making a request look like it asks for fewer or different
  actions than it really does).

## Out of scope

- **The fake Gmail inbox.** It is an in-memory demo; there is nothing real to protect in it.
- **Attacks that need an already compromised computer** — malware or another person already running
  code as your macOS user can read `~/.agentcollar/` and ask the Keychain for the Gmail refresh token.
  AgentCollar protects against agents misusing their access, not against a hostile local account.
- Vulnerabilities in Telegram, Google, npm or GitHub themselves (please report those to them).
- Social engineering of the human who approves (you tapping *Approve* on a request you did not read).
