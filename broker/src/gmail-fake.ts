// A pretend Gmail that lives in memory. Phase 4 replaces it with the real Gmail API.
// The broker talks to it exactly like it will talk to the real one:
// only AFTER check() has said yes.
import { randomBytes } from "node:crypto";

export type Email = { id: string; from: string; subject: string; body: string };
export type Draft = { id: string; to: string; subject: string; body: string };

const inbox: Email[] = [
  { id: "m1", from: "anna@example.com", subject: "Lunch on Friday?", body: "Are you free at 13:00?" },
  { id: "m2", from: "bank@example.com", subject: "Your statement", body: "Your October statement is ready." },
  { id: "m3", from: "boss@example.com", subject: "Report", body: "Please send the report by Monday." },
];
const drafts: Draft[] = [];
const sent: Draft[] = [];

function newId(): string {
  return randomBytes(4).toString("hex");
}

export function listInbox(): Email[] {
  return inbox;
}

export function createDraft(to: string, subject: string, body: string): Draft {
  const draft = { id: newId(), to, subject, body };
  drafts.push(draft);
  return draft;
}

export function sendEmail(to: string, subject: string, body: string): Draft {
  const email = { id: newId(), to, subject, body };
  sent.push(email);
  return email;
}
