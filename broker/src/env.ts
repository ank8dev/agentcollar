// Loads ~/.agentcollar/.env into process.env (secrets live there, never in the code).
// Imported first by the server and by the CLI commands.
import { existsSync } from "node:fs";
import { envFile, legacyFiles } from "./paths.ts";

if (existsSync(envFile)) {
  process.loadEnvFile(envFile); // built into Node: puts the lines of .env into process.env
} else if (existsSync(legacyFiles.env)) {
  // Older setups kept it in broker/.env. Still works; `agentcollar setup` offers to move it.
  process.loadEnvFile(legacyFiles.env);
  console.error("AgentCollar: настройки ещё в broker/.env — запусти agentcollar setup, чтобы перенести их в ~/.agentcollar/");
}
