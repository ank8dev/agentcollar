// A guided walk through Google Cloud for `agcl gmail connect`, for people who have no OAuth client yet.
// Each step opens the right console page in the browser and says in one line what to click.
// (Google moves its menus around now and then, so every step also names the page.)
import { execFile } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { styleText } from "node:util";
import { SCOPES } from "../google/oauth.ts";

export type GuideStep = {
  title: string;
  url: string;
  todo: string; // what to click, in one or two lines
  copy?: string[]; // text to paste (the scopes)
};

export const GUIDE_STEPS: GuideStep[] = [
  {
    title: "Create a project",
    url: "https://console.cloud.google.com/projectcreate",
    todo: 'Project name: AgentCollar → Create. Then make sure "AgentCollar" is selected in the top bar.',
  },
  {
    title: "Turn on the Gmail API",
    url: "https://console.cloud.google.com/apis/library/gmail.googleapis.com",
    todo: "Click Enable.",
  },
  {
    title: "Consent screen (Google Auth Platform → Overview)",
    url: "https://console.cloud.google.com/auth/overview",
    todo: "Get started → App name: AgentCollar (local), your email → Audience: External → contact email → Create.",
  },
  {
    title: "Add yourself as a test user (Audience)",
    url: "https://console.cloud.google.com/auth/audience",
    todo: "Test users → Add users → your Gmail address → Save. The app stays in Testing: no Google review needed.",
  },
  {
    title: "Permissions (Data Access)",
    url: "https://console.cloud.google.com/auth/scopes",
    todo: "Add or remove scopes → paste these two into “Manually add scopes” → Add to table → Update → Save:",
    copy: SCOPES,
  },
  {
    title: "Create the client (Clients)",
    url: "https://console.cloud.google.com/auth/clients/create",
    todo: "Application type: Desktop app → Name: agcl → Create → Download JSON.",
  },
];

// Waits for a client_secret*.json that appears in `folder` after `since` (an older one is ignored).
export async function waitForClientFile(folder: string, since: number, timeoutMs: number, pollMs = 1000): Promise<string | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (existsSync(folder)) {
      const fresh = readdirSync(folder)
        .filter((name) => name.startsWith("client_secret") && name.endsWith(".json"))
        .map((name) => join(folder, name))
        .filter((file) => statSync(file).mtimeMs >= since - 1000);
      if (fresh[0] !== undefined) return fresh[0];
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  return null;
}

// Runs the guide in the terminal. Returns the downloaded client file, or null if the user stopped.
export async function runGuide(downloads: string): Promise<string | null> {
  const started = Date.now();
  console.log(styleText("bold", "\nGoogle Cloud setup — 6 steps, about 3 minutes."));
  console.log("Each step opens a page in your browser. Do what it says, then press Enter here.\n");

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    for (const [i, step] of GUIDE_STEPS.entries()) {
      console.log(`${styleText("cyan", `[${i + 1}/${GUIDE_STEPS.length}]`)} ${styleText("bold", step.title)}`);
      console.log(`      ${step.todo}`);
      for (const line of step.copy ?? []) console.log(`        ${styleText("yellow", line)}`);
      console.log(styleText("dim", `      ${step.url}`));
      execFile("open", [step.url], () => {});
      const answer = await rl.question(styleText("dim", "      Enter = done · q = stop "));
      if (answer.trim().toLowerCase() === "q") return null;
      console.log("");
    }
  } finally {
    rl.close();
  }

  console.log("Waiting for client_secret_….json in your Downloads folder…");
  const file = await waitForClientFile(downloads, started, 10 * 60 * 1000);
  if (file === null) console.log("No file in 10 minutes. Run agcl gmail connect again when you have it.");
  return file;
}
