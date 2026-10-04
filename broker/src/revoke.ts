// The local kill switch, as a function: asks the broker on THIS computer to revoke a mandate.
// Works without internet: it only talks to 127.0.0.1.
export type RevokeResult = { ok: boolean; message: string };

export async function revokeMandate(id: string, port: number): Promise<RevokeResult> {
  // Mandate ids are 8 hex characters; anything else never reaches the network.
  if (!/^[0-9a-f]{8}$/.test(id)) {
    return { ok: false, message: "Usage: agcl revoke <id>   (the mandate id: 8 characters, shown in the Telegram message)" };
  }

  let response: Response;
  try {
    response = await fetch(`http://127.0.0.1:${port}/mandates/${id}/revoke`, { method: "POST" });
  } catch {
    return { ok: false, message: "The broker is not answering. Is it running (agcl server)?" };
  }

  if (!response.ok) {
    const body = (await response.json()) as { error?: string };
    return { ok: false, message: `Could not revoke: ${body.error}` };
  }
  return { ok: true, message: `🛑 Mandate ${id} revoked` };
}
