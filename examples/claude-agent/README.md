# Example: Claude Code as an agent behind AgentCollar

A complete agent in three small files. Claude Code can reach your mailbox **only** through the
AgentCollar broker: shell, file and web tools are switched off, so there is no side door.

| File | What it does |
|---|---|
| `CLAUDE.md` | the agent's job: least privilege, wait for your Telegram decision, explain refusals |
| `.mcp.json` | connects the `agcl mcp` server |
| `.claude/settings.json` | allows only `mcp__agentcollar`; denies Bash, Read, Write, Edit, Web |
| `run-agent.sh` | one-shot run: `./run-agent.sh "Read my inbox and draft a reply…"` |

## Run it

```bash
npm install -g agentcollar
agcl                      # first time: set up your Telegram bot, then the broker starts
agcl gmail connect        # optional: your real Gmail (read + create drafts; it can never send)
```

Then, in this folder:

```bash
claude                    # interactive: ask "read my inbox and draft a reply to the most important email"
./run-agent.sh            # or one-shot
```

What you will see: the agent asks for `gmail.read` + `gmail.draft` → you approve in Telegram →
it reads and creates a draft. Ask it to **send** → it asks for a new mandate with `gmail.send` →
Telegram shows ⚠️ → you tap **Deny** → the agent explains it was not allowed.
`agcl watch` shows every request and which of the 6 checks passed.
