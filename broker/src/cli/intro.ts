// The intro, after landing/preloader.js: the AC medallion spins, "AgentCollar" types itself
// and un-types, then the medallion shrinks into the header. About 1.7 s; any key skips it.
// The frames are plain text made once from the logo (see tools/gen-intro.ts).
import { styleText } from "node:util";
import { ICON, SHRINK, SPIN, SPIN_SMALL } from "./intro-frames.ts";

export type Frame = { lines: string[]; delayMs: number };

const WORD = "AgentCollar";
const WELCOME = "Welcome. Let agents work. Keep the keys.";
const WELCOME_SHORT = "Let agents work. Keep the keys.";

export type IntroSize = "big" | "small" | "none";

// The big medallion needs 60×16, the small one 44×12; a smaller window gets no intro at all.
export function introSize(columns: number, rows: number): IntroSize {
  if (columns >= 60 && rows >= SPIN[0]!.length + 4) return "big";
  if (columns >= 44 && rows >= SPIN_SMALL[0]!.length + 4) return "small";
  return "none";
}

// The whole animation as data: easy to test (duration, sizes) and to play.
export function introTimeline(size: Exclude<IntroSize, "none"> = "big", width = 100): Frame[] {
  const spin = size === "big" ? SPIN : SPIN_SMALL;
  const height = spin[0]!.length; // every frame has this many lines, so each one overwrites the last
  const wordRow = Math.floor(height / 2) - 1;
  const wordColumn = Math.max(...spin[0]!.map((line) => [...line].length)) + 3;

  const frame = (medallion: string[], word = "", delayMs = 0): Frame => ({
    lines: Array.from({ length: height }, (_, row) => {
      const left = medallion[row] ?? "";
      return row === wordRow && word !== "" ? left.padEnd(wordColumn) + word : left;
    }),
    delayMs,
  });

  const upright = spin[0]!;
  const frames: Frame[] = [];
  for (const turned of spin) frames.push(frame(turned, "", 40)); // one full turn
  frames.push(frame(upright, "", 40)); // settles upright
  for (let i = 1; i <= WORD.length; i++) frames.push(frame(upright, WORD.slice(0, i), 45)); // types
  frames[frames.length - 1]!.delayMs = 250; // holds the full name
  for (let i = WORD.length - 1; i >= 0; i--) frames.push(frame(upright, WORD.slice(0, i), 22)); // un-types
  const shrink = size === "big" ? SHRINK : SHRINK.slice(1); // the small intro starts at 32 dots already
  for (const smaller of shrink) frames.push(frame(smaller, "", 60)); // flies into the header
  const welcome = width >= WELCOME.length + 6 ? WELCOME : WELCOME_SHORT;
  frames.push(frame([`${ICON[0]}  ${styleText("bold", WORD)}`, `${ICON[1]}  ${welcome}`]));
  return frames;
}

export type IntroContext = {
  stdoutTTY: boolean;
  columns: number;
  rows: number;
  env: Record<string, string | undefined>;
  noIntro: boolean;
};

// Only for a person looking at a real terminal: never in pipes, logs, CI, or when asked not to.
export function shouldShowIntro(c: IntroContext): boolean {
  if (c.noIntro || !c.stdoutTTY) return false;
  if (c.env.CI !== undefined || c.env.TERM === "dumb") return false;
  if (c.env.NO_COLOR !== undefined && c.env.NO_COLOR !== "") return false; // no-color.org rule
  return introSize(c.columns, c.rows) !== "none";
}

// ANSI escape codes used below:
//   ESC[?25l / ESC[?25h  hide / show the cursor
//   ESC 7 / ESC 8        save / restore the cursor position
//   ESC[2K               clear the current line
//   ESC[J                clear from the cursor to the end of the screen
//   ESC[<n>A             move the cursor n lines up
const ESC = "\u001b";

export async function playIntro(out: NodeJS.WriteStream = process.stdout, input: NodeJS.ReadStream = process.stdin): Promise<void> {
  const size = introSize(out.columns ?? 100, out.rows ?? 40);
  if (size === "none") return;
  const frames = introTimeline(size, out.columns ?? 100);
  const HEIGHT = frames[0]!.lines.length;
  let skipped = false;
  let ctrlC = false;
  let wake: () => void = () => {};

  const showCursor = () => out.write(`${ESC}[?25h`);
  process.once("exit", showCursor); // even if something goes wrong, never leave the cursor hidden

  const onKey = (key: Buffer) => {
    skipped = true;
    ctrlC = key[0] === 3; // Ctrl+C
    wake();
  };
  if (input.isTTY) {
    input.setRawMode(true);
    input.resume();
    input.on("data", onKey);
  }

  // make room for the frames, go back up, and remember where the block starts
  out.write(`${ESC}[?25l${"\n".repeat(HEIGHT)}${ESC}[${HEIGHT}A${ESC}7`);
  const draw = (lines: string[]) => out.write(`${ESC}8${lines.map((line) => `${ESC}[2K${line}`).join("\n")}`);

  for (const f of frames.slice(0, -1)) {
    if (skipped) break;
    draw(f.lines);
    await new Promise<void>((resolve) => {
      wake = resolve;
      setTimeout(resolve, f.delayMs);
    });
  }

  // the header stays; everything below it is cleared
  const header = frames[frames.length - 1]!.lines.filter((line) => line !== "");
  out.write(`${ESC}8${ESC}[J${header.join("\n")}\n\n`);
  showCursor();
  process.off("exit", showCursor);

  if (input.isTTY) {
    input.off("data", onKey);
    input.setRawMode(false);
    input.pause();
  }
  if (ctrlC) process.exit(130);
}

// Shows the intro only when it makes sense (see shouldShowIntro).
export async function maybeIntro(noIntro: boolean): Promise<void> {
  const context: IntroContext = {
    stdoutTTY: process.stdout.isTTY === true,
    columns: process.stdout.columns ?? 0,
    rows: process.stdout.rows ?? 0,
    env: process.env,
    noIntro,
  };
  if (shouldShowIntro(context)) await playIntro();
}
