// A pretend mailbox in memory: the broker uses it until you run `agcl gmail connect`.
import { randomBytes } from "node:crypto";
import type { Draft, Email, Mailbox } from "./mailbox.ts";

const newId = () => randomBytes(4).toString("hex");

export function createFakeMailbox(): Mailbox {
  const inbox: Email[] = [
    { id: "m1", from: "anna@example.com", subject: "Lunch on Friday?", body: "Are you free at 13:00?" },
    { id: "m2", from: "bank@example.com", subject: "Your statement", body: "Your October statement is ready." },
    { id: "m3", from: "boss@example.com", subject: "Report", body: "Please send the report by Monday." },
  ];
  const drafts: Draft[] = [];
  const sent: Draft[] = [];

  return {
    kind: "fake",
    listInbox: async () => inbox,
    async createDraft(to, subject, body) {
      const draft = { id: newId(), to, subject, body };
      drafts.push(draft);
      return draft;
    },
    async sendEmail(to, subject, body) {
      const email = { id: newId(), to, subject, body };
      sent.push(email);
      return email;
    },
  };
}
