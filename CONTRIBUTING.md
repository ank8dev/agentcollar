# Contributing to AgentCollar

Thanks for looking! AgentCollar is a small hobby project, so the rules below are short and strict:
they are what keeps a security tool small enough to read in one evening.

Found a security problem? Do **not** open an issue — see [SECURITY.md](SECURITY.md).

## Run it from source

Requires **Node.js 22+**.

```bash
git clone https://github.com/ank8dev/agentcollar
cd agentcollar/broker
npm install          # dev tools only (TypeScript, tsx); also builds dist/
npm link             # puts `agcl` and `agentcollar` on your PATH, pointing at your checkout
agcl --help
```

Try the whole flow without Telegram or Gmail: `npm run demo`, or `agcl server` in one terminal and
`npm run agent` in another (approve with `y`).

## Before you open a pull request

Run both, in `broker/`:

```bash
npm run typecheck    # TypeScript, strict mode
npm test             # node:test; uses a temporary AGENTCOLLAR_HOME, never your real ~/.agentcollar
```

Both must pass. The same two commands run in CI on every pull request that touches `broker/`.

## Project rules

- **Zero runtime dependencies.** The broker uses only Node's built-ins. Want to add a package?
  Open an issue first and explain why it is needed and why a few lines of our own code are not enough.
  Dev dependencies (TypeScript, tsx, types) follow the same "ask first" rule.
- **Approval is never possible over HTTP or through files.** A mandate is approved only in Telegram
  (by the configured user id) or in the broker's own terminal. No endpoint, CLI command or file may
  approve, or a local agent could approve itself. The CLI may *read* files the broker writes; the
  broker never reads commands from files.
- **No secrets in git.** Tokens, `.env` files and anything from `~/.agentcollar/` stay out of the
  repository and out of logs, test fixtures and screenshots.
- **Local-only.** No relay, no central server, no shared bot: everyone runs their own broker with
  their own bot. (A relay design is parked in `docs/ideas/relay-v2/` and is not planned.)
- **English** for code, comments, commit messages and everything the product shows.
- **Fail closed.** When something goes wrong, the answer is "no access", never "access".

## Pull requests

- **Small PRs. One PR = one idea.** A fix and a refactor are two PRs.
- **Tests for new behavior.** Write the test first and watch it fail; then make it pass. A bug fix
  comes with a test that reproduces the bug.
- Explain *why* in the PR description, not only *what*.
- Commit messages: one clear line in English saying what changed and why.

## Brand assets

The code is MIT. The files in [`brand/`](brand/) (logo, marks, hand-drawn illustrations) and the
intro medallion derived from the logo (`broker/src/cli/intro-frames.ts`) are **© ank8dev, all rights
reserved** and are **not** covered by the MIT license — see [LICENSE](LICENSE). Please do not reuse
them in other projects.
