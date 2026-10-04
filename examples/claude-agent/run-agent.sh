#!/bin/sh
# One command = one agent run. The agent (Claude Code, headless) can use ONLY the AgentCollar tools:
# no shell, no file access, no web. Everything it does goes through the broker and its audit log.
# Needs: agcl installed (npm install -g agentcollar) and the broker running (agcl).
cd "$(dirname "$0")" || exit 1

TASK="${1:-Read my inbox and draft a reply to the most important email.}"

exec claude -p "$TASK" \
  --mcp-config .mcp.json --strict-mcp-config \
  --allowedTools "mcp__agentcollar" \
  --disallowedTools "Bash" "Read" "Write" "Edit" "NotebookEdit" "WebFetch" "WebSearch"
