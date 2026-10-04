#!/usr/bin/env node
// The `agentcollar` command. Run `npm link` once in broker/ to put it on your PATH.
// tsx lets Node run our TypeScript directly: register() switches it on for this process.
import { register } from "tsx/esm/api";

register();
await import("../src/cli/run.ts");
