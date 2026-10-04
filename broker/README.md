# AgentCollar

**Let agents work. Keep the keys.** A small broker that runs on your own computer, between your AI
agents and your accounts. Agents get a short-lived, task-scoped *mandate* that you approve in
Telegram — never your password or tokens.

> **Hobby project. Use at your own risk. Do not connect accounts you can't afford to lose.**
> Status: early. Gmail is still **fake** (an in-memory inbox); real Gmail is next.

## Install

Requires **Node.js 22+**.

```bash
npx agentcollar          # try it without installing
npm install -g agentcollar   # or install: then the short name `agcl` works too
```

`agcl` and `agentcollar` are the same program: `agcl watch` == `agentcollar watch`.

## First run

```bash
agcl
```

The intro plays, then the setup wizard connects **your own** Telegram bot (create one with
[@BotFather](https://t.me/BotFather); the wizard takes your user id from the Start message, with a
one-time code), then the broker starts on `127.0.0.1:8787`.

## Commands

| Command | What it does |
|---|---|
| `agcl` | intro → setup (if not set up yet) → broker |
| `agcl setup` | connect your Telegram bot |
| `agcl server` | start the broker |
| `agcl watch` | live screen: every agent request and which of the 6 checks passed or failed |
| `agcl mandates` | mandates of the running broker: state, time left, actions left |
| `agcl logs [--agent <name>] [--denied] [--today]` | the audit log, filtered |
| `agcl revoke <id>` | kill switch: revoke a mandate instantly |
| `agcl mcp` | MCP server (stdio) for Claude Code and other agents |

Flags: `--no-intro`, `-h` / `--help`.

## Use it from Claude Code (MCP)

```bash
claude mcp add agentcollar -- npx -y agentcollar mcp
```

Tools: `request_mandate`, `mandate_status`, `gmail_read_inbox`, `gmail_create_draft`, `gmail_send`.
Every call goes through the broker with a mandate token. The token stays inside the MCP server and
is never shown to the model.

## How a request is checked

Every request runs 6 checks in order; the first failure stops it:

1. the token is known → `401`
2. a human approved the mandate → `403`
3. not expired → `403`
4. not revoked → `403`
5. this action is in the mandate → `403`
6. the action limit is not reached → `429`

## Security

- Listens on `127.0.0.1` only; refuses browser requests (`Host` check against DNS rebinding,
  no `Origin`, JSON only).
- **Approval is never possible over HTTP or through files**: only in Telegram (only your user id)
  or in the broker's own terminal. A local agent cannot approve itself.
- Your data lives in `~/.agentcollar/` (folder `700`, files `600`): `.env`, `audit.log`,
  `mandates.json` (no tokens in it).
- Append-only audit log; text from agents is escaped and stripped of terminal control characters.
- **No runtime dependencies.** Published from GitHub Actions with npm provenance.

## License

Code: MIT. The AgentCollar brand assets (logo, the intro medallion derived from it) are
© ank8dev, all rights reserved. See [LICENSE](LICENSE).

Source, roadmap and full docs: <https://github.com/ank8dev/agentcollar>
