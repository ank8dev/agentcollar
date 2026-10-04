// Loads ~/.agentcollar/.env into process.env (secrets live there, never in the code).
// Imported first by the server and by the CLI commands.
import { existsSync } from "node:fs";
import { envFile, legacyFiles } from "./paths.ts";

if (existsSync(envFile)) {
  process.loadEnvFile(envFile); // built into Node: puts the lines of .env into process.env
} else if (process.env.AGENTCOLLAR_HOME === undefined && existsSync(legacyFiles.env)) {
  // Older setups kept it in broker/.env. Still works; `agcl setup` offers to move it.
  // (Not when AGENTCOLLAR_HOME is set: an explicit home means "look only there".)
  process.loadEnvFile(legacyFiles.env);
  console.error("AgentCollar: settings are still in broker/.env, run agcl setup to move them to ~/.agentcollar/");
}
