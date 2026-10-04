import assert from "node:assert/strict";
import { test } from "node:test";
import { introTimeline, shouldShowIntro } from "../src/cli/intro.ts";
import { toBraille } from "../tools/braille.ts";

test("braille: each character holds 2×4 dots, in Unicode's dot order", () => {
  const all = [
    [true, true],
    [true, true],
    [true, true],
    [true, true],
  ];
  assert.deepEqual(toBraille(all), ["⣿"]);
  const leftColumnTop = [
    [true, false],
    [false, false],
    [false, false],
    [false, false],
  ];
  assert.deepEqual(toBraille(leftColumnTop), ["⠁"]);
  const rightColumnBottom = [
    [false, false],
    [false, false],
    [false, false],
    [false, true],
  ];
  assert.deepEqual(toBraille(rightColumnBottom), ["⢀"]);
});

test("braille: an empty cell is a plain space, and trailing spaces are trimmed", () => {
  const dots = Array.from({ length: 4 }, () => [true, true, false, false]);
  assert.deepEqual(toBraille(dots), ["⣿"]);
});

const terminal = { stdoutTTY: true, columns: 100, rows: 40, env: {}, noIntro: false };

test("the intro shows in a normal terminal", () => {
  assert.equal(shouldShowIntro(terminal), true);
});

test("no intro when output is not a terminal, in CI, with NO_COLOR, TERM=dumb, --no-intro, or a tiny window", () => {
  assert.equal(shouldShowIntro({ ...terminal, stdoutTTY: false }), false);
  assert.equal(shouldShowIntro({ ...terminal, env: { CI: "true" } }), false);
  assert.equal(shouldShowIntro({ ...terminal, env: { NO_COLOR: "1" } }), false);
  assert.equal(shouldShowIntro({ ...terminal, env: { TERM: "dumb" } }), false);
  assert.equal(shouldShowIntro({ ...terminal, noIntro: true }), false);
  assert.equal(shouldShowIntro({ ...terminal, columns: 40 }), false);
  assert.equal(shouldShowIntro({ ...terminal, rows: 10 }), false);
});

test("NO_COLOR set but empty does not count (the NO_COLOR rule: present AND not empty)", () => {
  assert.equal(shouldShowIntro({ ...terminal, env: { NO_COLOR: "" } }), true);
});

test("the whole intro takes at most 2 seconds", () => {
  const total = introTimeline().reduce((sum, frame) => sum + frame.delayMs, 0);
  assert.ok(total <= 2000, `intro takes ${total} ms`);
  assert.ok(total >= 1200, `intro is too short to see: ${total} ms`);
});

test("every frame has the same height, so frames overwrite each other cleanly", () => {
  const heights = new Set(introTimeline().map((frame) => frame.lines.length));
  assert.equal(heights.size, 1);
});

test("the medallion spins, 'AgentCollar' is typed then erased, and it ends with the header", () => {
  const frames = introTimeline().map((frame) => frame.lines.join("\n"));
  assert.ok(new Set(frames.slice(0, 8)).size >= 6, "the first frames differ: the medallion turns");
  assert.ok(frames.some((f) => f.includes("AgentCollar") && !f.includes("Welcome")), "the name is typed");
  assert.ok(frames.some((f) => f.includes("Agent") && !f.includes("AgentC")), "and erased letter by letter");
  const last = frames.at(-1) ?? "";
  assert.ok(last.includes("AgentCollar"));
  assert.ok(last.includes("Welcome. Let agents work. Keep the keys."));
});
