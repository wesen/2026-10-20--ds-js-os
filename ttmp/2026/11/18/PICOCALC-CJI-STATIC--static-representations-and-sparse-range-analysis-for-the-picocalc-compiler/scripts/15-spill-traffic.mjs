// Count logical bytes and access order for the existing Node file-store backend.
import {mkdtempSync, readFileSync, rmdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const [root, world, reference] = process.argv.slice(2);
const load = path => import(pathToFileURL(resolve(root, path)));
const {compileSource} = await load('src/build.js');
const {fileStore} = await load('src/spill-file.js');
const dir = mkdtempSync(join(tmpdir(), 'cji-static-traffic-'));
const file = fileStore(dir), positions = [], sizes = [], reads = new Set();
let written = 0, bytesRead = 0, gets = 0, smallReads = 0, discontinuities = 0, cursor = 0;
const store = {
  put(text) {
    const n = Buffer.byteLength(text), id = file.put(text);
    if (id !== positions.length) throw Error('nonsequential file-store ID');
    positions.push(written); sizes.push(n);
    written += n; cursor = written;
    return id;
  },
  get(id) {
    const text = file.get(id);
    if (cursor !== positions[id]) discontinuities++;
    if (sizes[id] < 512) smallReads++;
    gets++; bytesRead += sizes[id]; reads.add(id);
    cursor = positions[id] + sizes[id];
    return text;
  },
  drop: file.drop
};
try {
  const output = compileSource(readFileSync('picocalc-os/js/apps/' + world + '.js','utf8'), false, {mode:'unit',store});
  if (!Buffer.from(output).equals(readFileSync(reference)) || written !== file.bytes) throw Error('output or byte count differs');
  console.log(JSON.stringify({world, writes:sizes.length, written, gets, bytesRead, smallReads,
    distinctReadRecords:reads.size, readOffsetDiscontinuities:discontinuities, maximumRecordBytes:Math.max(...sizes)},null,2));
} finally { file.close(); rmdirSync(dir); }
