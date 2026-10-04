// Like `tail -f`: each readNew() returns only the entries appended since the previous call.
import { closeSync, existsSync, openSync, readSync, statSync } from "node:fs";
import { parseAuditLine, type AuditEntry } from "../audit-log.ts";

const NEWLINE = 0x0a; // the byte of "\n"

export function createTail(file: string) {
  let offset = 0; // how many bytes we have already read
  let rest = Buffer.alloc(0); // bytes after the last "\n": a line the server is still writing

  return {
    readNew(): AuditEntry[] {
      if (!existsSync(file)) return [];
      const size = statSync(file).size;
      if (size < offset) {
        // the file got shorter: it was cut or replaced, so start over
        offset = 0;
        rest = Buffer.alloc(0);
      }
      if (size === offset) return [];

      const chunk = Buffer.alloc(size - offset);
      const fd = openSync(file, "r");
      try {
        readSync(fd, chunk, 0, chunk.length, offset);
      } finally {
        closeSync(fd);
      }
      offset = size;

      // Work with BYTES up to the last "\n". Turning a half line into text could cut a
      // Cyrillic letter (2 bytes) in the middle and break it; the rest waits for the next call.
      const bytes = Buffer.concat([rest, chunk]);
      const end = bytes.lastIndexOf(NEWLINE);
      if (end === -1) {
        rest = bytes;
        return [];
      }
      rest = bytes.subarray(end + 1);
      return bytes
        .subarray(0, end)
        .toString("utf8")
        .split("\n")
        .map(parseAuditLine)
        .filter((entry): entry is AuditEntry => entry !== null);
    },
  };
}
