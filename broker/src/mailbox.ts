// What the broker needs from a mailbox. Two implementations: the fake one (memory, for demos and
// tests) and your real Gmail (src/google/gmail.ts, after `agcl gmail connect`).
export type Email = { id: string; from: string; subject: string; body: string };
export type Draft = { id: string; to: string; subject: string; body: string };

export type Mailbox = {
  kind: "fake" | "gmail";
  listInbox(): Promise<Email[]>;
  createDraft(to: string, subject: string, body: string): Promise<Draft>;
  sendEmail(to: string, subject: string, body: string): Promise<Draft>;
};

// One plain address: no commas (several recipients), no spaces or line breaks (header injection).
export function isEmailAddress(text: string): boolean {
  return /^[^\s@<>,;"()]+@[^\s@<>,;"()]+\.[^\s@<>,;"()]+$/.test(text);
}
