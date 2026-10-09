# Changelog

All notable changes to the `agentcollar` package (the broker in `broker/`) are written here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/). Commit hashes point to the change in git history.

## [Unreleased]

**Development is paused** and may never resume.

## [0.2.0] - 2026-10-09

The last release before the pause. Everything below was tested end to end
(Claude Code → Telegram approval → real Gmail drafts).

### Added
- Real Gmail: `agcl gmail connect | status | disconnect`. Desktop-app OAuth with PKCE on a
  `127.0.0.1` loopback; the refresh token is stored in the macOS Keychain, the access token only in
  memory. Inbox and drafts go through the Gmail API behind the same mailbox interface as the fake
  inbox; Gmail errors reach the agent as `502` (30cf066, f4421e1).
- Guided Google Cloud setup inside `agcl gmail connect`: when there is no OAuth client yet, it opens
  the 6 console pages one by one, says what to click on each, and picks up the downloaded
  `client_secret_….json` by itself.
- MCP: `mandate_status` can wait for the human's decision (`waitSeconds`, up to 120 s); the polling
  interval is set by the server, not by the model (a90b9b9).
- Adaptive terminal output: `agcl watch` and `agcl logs` lines adapt to wide, medium and narrow
  windows, `agcl mandates` switches to cards when the table does not fit, help text wraps, and a
  smaller intro medallion is used in narrow windows (759bda4).
- A clear message instead of a stack trace when port 8787 is already in use (f4421e1).
- Example agent in `examples/claude-agent/`: Claude Code that can reach the mailbox only through
  AgentCollar (shell, file and web tools denied) (f4421e1).
- `SECURITY.md`, `CONTRIBUTING.md` and this changelog.
- CI: `npm run typecheck` and `npm test` on every push and pull request that changes `broker/`.

### Changed
- All user-facing text is in English: CLI, setup wizard, Telegram bot, terminal approval (3e9f58e).
- Gmail scopes are `gmail.readonly` + `gmail.drafts.create`: the Gmail connection can read and create
  drafts but can never send, so sending is blocked by the broker and by Google (f4421e1).

## [0.1.0] - 2026-10-04

First release with code, published to npm from GitHub Actions with provenance (tag `v0.1.0`).

### Added
- Mandates: short-lived, task-scoped permissions with a random 256-bit token (f079dbe).
- Checks on every request, in order: known token, approved by a human, not expired, not revoked,
  action allowed, limit not reached; the first failure stops the request (f39af75, 05bdc11).
- Kill switch: revoke a mandate (8c800c6); `agcl revoke <id>` from the terminal, which also closes
  the Telegram message (493dcf1).
- Append-only audit log of every check and every human decision; text from agents is escaped so it
  cannot forge extra lines; the token is never logged (f22c3ce, 33bcecf). Each check line records
  which check decided (8b746fc).
- Local HTTP server on `127.0.0.1` with a fake Gmail inbox and a demo agent (05bdc11).
- Human approval in Telegram (only the configured user id) or in the broker's terminal (05bdc11).
- Approval messages cannot be spoofed by agent text (strict `app.verb` actions, agent text sanitized
  and shown last, sending flagged); requests from browsers are refused (`Host` check against DNS
  rebinding, no `Origin`, JSON only) (95e4eef).
- Pending mandates nobody answers are denied after 10 minutes (fail closed) (3678095).
- Setup wizard: bot token checked with Telegram, user id taken from a one-time `/start` code,
  settings written with mode 600 (568d381).
- MCP server over stdio with 5 tools (`request_mandate`, `mandate_status`, `gmail_read_inbox`,
  `gmail_create_draft`, `gmail_send`) that go through the broker; the mandate token never reaches
  the model (6b3f1fc).
- One CLI, `agcl` = `agentcollar`: `setup`, `server`, `watch`, `mandates`, `logs`, `revoke`, `mcp`;
  bare `agcl` runs the intro, the setup wizard if needed, then the broker (2626988, 8b746fc, 75a74bc,
  ff821d7, c2ebc54).
- Intro: a spinning AC medallion in Braille, about 1.7 s, any key skips it, off in pipes, CI, with
  `NO_COLOR` or `--no-intro` (63c1f92).
- User data in `~/.agentcollar/` (folder 700, files 600), with migration from the old `broker/`
  location (abfc42f). The mandates snapshot for `agcl mandates` contains no tokens (ff821d7).
- npm package `agentcollar` with zero runtime dependencies, built to `dist/` (f264f6c); release
  workflow that publishes with `npm publish --provenance` through npm trusted publishing (3edf960,
  2e3ece2).
- License: MIT for the code; brand assets in `brand/` stay all rights reserved (a1bce02, b341d64).

## [0.0.1] - 2026-10-04

Name placeholder published to npm by hand, with no code (only `package.json` and a README), so that
trusted publishing could be set up for the real releases. Not tagged in git.

[Unreleased]: https://github.com/ank8dev/agentcollar/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/ank8dev/agentcollar/tree/v0.2.0
[0.1.0]: https://github.com/ank8dev/agentcollar/tree/v0.1.0
[0.0.1]: https://www.npmjs.com/package/agentcollar/v/0.0.1
