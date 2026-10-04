// The local kill switch, as a function: asks the broker on THIS computer to revoke a mandate.
// Works without internet: it only talks to 127.0.0.1.
export type RevokeResult = { ok: boolean; message: string };

export async function revokeMandate(id: string, port: number): Promise<RevokeResult> {
  // Mandate ids are 8 hex characters; anything else never reaches the network.
  if (!/^[0-9a-f]{8}$/.test(id)) {
    return { ok: false, message: "Как использовать: agcl revoke <id>   (id мандата: 8 символов, есть в сообщении Telegram)" };
  }

  let response: Response;
  try {
    response = await fetch(`http://127.0.0.1:${port}/mandates/${id}/revoke`, { method: "POST" });
  } catch {
    return { ok: false, message: "Брокер не отвечает. Он запущен (agcl server)?" };
  }

  if (!response.ok) {
    const body = (await response.json()) as { error?: string };
    return { ok: false, message: `Не получилось: ${body.error}` };
  }
  return { ok: true, message: `🛑 Мандат ${id} отозван` };
}
