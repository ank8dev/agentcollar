// Packs a grid of dots into Braille characters: one character = 2 columns × 4 rows of dots.
// Unicode Braille starts at U+2800; each of the 8 dots is one bit:
//   (col 0) row 0 = 0x01, row 1 = 0x02, row 2 = 0x04, row 3 = 0x40
//   (col 1) row 0 = 0x08, row 1 = 0x10, row 2 = 0x20, row 3 = 0x80
const BITS = [
  [0x01, 0x08],
  [0x02, 0x10],
  [0x04, 0x20],
  [0x40, 0x80],
];

export function toBraille(dots: boolean[][]): string[] {
  const height = dots.length;
  const width = dots[0]?.length ?? 0;
  const lines: string[] = [];
  for (let y = 0; y < height; y += 4) {
    let line = "";
    for (let x = 0; x < width; x += 2) {
      let code = 0;
      for (let dy = 0; dy < 4; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          if (dots[y + dy]?.[x + dx]) code |= BITS[dy]![dx]!;
        }
      }
      line += code === 0 ? " " : String.fromCodePoint(0x2800 + code);
    }
    lines.push(line.trimEnd());
  }
  return lines;
}
