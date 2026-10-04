// agentcollar revoke <id> — the local kill switch from the terminal.
import "../env.ts";
import { revokeMandate } from "../revoke.ts";

export async function runRevoke(args: string[]): Promise<number> {
  const result = await revokeMandate(args[0] ?? "", Number(process.env.BROKER_PORT ?? 8787));
  console.log(result.message);
  return result.ok ? 0 : 1;
}
