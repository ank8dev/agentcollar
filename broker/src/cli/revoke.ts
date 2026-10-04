// npm run revoke -- <mandate id> — the local kill switch from the terminal.
import "../env.ts";
import { revokeMandate } from "../revoke.ts";

const result = await revokeMandate(process.argv[2] ?? "", Number(process.env.BROKER_PORT ?? 8787));
console.log(result.message);
process.exitCode = result.ok ? 0 : 1;
