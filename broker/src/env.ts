// Loads broker/.env into process.env (secrets live there, never in the code).
// Imported first by the server and by the CLI commands.
import { existsSync } from "node:fs";
import { join } from "node:path";

const envFile = join(import.meta.dirname, "..", ".env");
if (existsSync(envFile)) {
  process.loadEnvFile(envFile); // built into Node: puts the lines of .env into process.env
}
