#!/usr/bin/env node
// The `agcl` / `agentcollar` command: the words typed after it go to the CLI.
import { runCli } from "./cli/main.ts";

process.exitCode = await runCli(process.argv.slice(2));
