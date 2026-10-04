// Starts the CLI with the words typed after `agentcollar` (or after `npm run setup`, etc.).
import { runCli } from "./main.ts";

process.exitCode = await runCli(process.argv.slice(2));
