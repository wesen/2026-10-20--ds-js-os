// CJI-3: the host's file store for spilling (see spill.js): every text appended to one file, the
// compiler keeping only each text's offset and length. On the board the same two calls would go to
// flash or the SD card through native primitives.
import { openSync, writeSync, readSync, closeSync, unlinkSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export function fileStore(dir = mkdtempSync(join(tmpdir(), 'cji-spill-'))) {
  const path = join(dir, 'spill');
  const fd = openSync(path, 'w+');
  const at = [], len = [];
  let end = 0, bytesWritten = 0;
  return {
    put(text) {
      const b = Buffer.from(text, 'utf8');
      writeSync(fd, b, 0, b.length, end);
      at.push(end); len.push(b.length);
      end += b.length; bytesWritten += b.length;
      return at.length - 1;
    },
    get(id) {
      const b = Buffer.allocUnsafe(len[id]);
      readSync(fd, b, 0, len[id], at[id]);
      return b.toString('utf8');
    },
    drop() {},
    close() { closeSync(fd); try { unlinkSync(path); } catch { /* (already gone) */ } },
    get bytes() { return bytesWritten; },
  };
}
