// CJI-3, lane 6: packed sets, integer vectors and an interference graph, as chapter 31's native
// primitives. Each function named $nat_NAME below is the subset's reference definition of rt_NAME in
// runtime/runtime.c: Node (stage 0) runs these bodies; in a compiler compiled by cji (stage 1) slas
// skips them and calls the C body, registered in runtime/slas.c's table. The values are opaque: only
// these functions look inside them, so the two sides may lay them out differently.
//
// Why: in cji a Uint32Array is an array of 8-byte words, and one made from a dynamic size is an Any[]
// read through the runtime's dynamic index. For agent's largest function (4877 locations) the
// interference matrix took 5.97 MB of stage 1's heap, DSATUR's colour sets 2.5 MB more, the reads and
// writes 2 MB. The C bodies keep 32 bits in 4 bytes, and the graph only where it has edges.
//
// - a set (bits): the integers 0 .. 32 * words - 1. Here a Uint32Array of `words` words; in C a
//   kind-0 object: its header, the number of words, then the words, two to a heap word.
// - an integer vector (ints): n 32-bit integers. Here an Int32Array; in C a kind-0 object, packed.
// A native takes at most three arguments (compiled code passes a fourth in memory).
// - a graph: an undirected graph over 0 .. n - 1, no loops: the lower triangle of its bit matrix in
//   tiles of 32 rows by one word, only the tiles that hold an edge, here and in C (rt_graph_new).

// ---- sets --------------------------------------------------------------------------------------

// an empty set of `words` words
export function $nat_bits_new(words /*: Int */) /*: Any */ { return new Uint32Array(words); }
// its size in words
export function $nat_bits_words(s /*: Any */) /*: Int */ { return s.length; }
// 1 if x is in s, else 0 (0 for an x past its words)
export function $nat_bits_has(s /*: Any */, x /*: Int */) /*: Int */ {
  return (x >>> 5) < s.length && (s[x >>> 5] & (1 << (x & 31))) !== 0 ? 1 : 0;
}
// x added to s (an x past its words is ignored, as JavaScript ignores a write past a typed array's end;
// the subset stops on the read a compound assignment makes there)
export function $nat_bits_add(s /*: Any */, x /*: Int */) /*: Int */ {
  if ((x >>> 5) < s.length) s[x >>> 5] |= 1 << (x & 31);
  return 0;
}
// x taken out of s (likewise)
export function $nat_bits_remove(s /*: Any */, x /*: Int */) /*: Int */ {
  if ((x >>> 5) < s.length) s[x >>> 5] &= ~(1 << (x & 31));
  return 0;
}
// d = d | s, over d's words (s's words past them are ignored; s may be shorter)
export function $nat_bits_or(d /*: Any */, s /*: Any */) /*: Int */ {
  const n = d.length < s.length ? d.length : s.length;
  for (let w = 0; w < n; w++) d[w] |= s[w];
  return 0;
}
// d = s & m, word by word over d's words (d, s and m of one size)
export function $nat_bits_and(d /*: Any */, s /*: Any */, m /*: Any */) /*: Int */ {
  for (let w = 0; w < d.length; w++) d[w] = s[w] & m[w];
  return 0;
}
// 1 if a and b (of one size) hold the same members, else 0
export function $nat_bits_equal(a /*: Any */, b /*: Any */) /*: Int */ {
  for (let w = 0; w < a.length; w++) if (a[w] !== b[w]) return 0;
  return 1;
}
// the least member of s at or after `from` (from >= 0), or -1
export function $nat_bits_next(s /*: Any */, from /*: Int */) /*: Int */ {
  let w = from >>> 5;
  if (w >= s.length) return -1;
  let x = s[w] & ~((1 << (from & 31)) - 1);   // (the bits from `from` on; from & 31 = 0: all of them)
  for (;;) {
    if (x !== 0) return (w << 5) | (31 - Math.clz32(x & -x));
    w++;
    if (w >= s.length) return -1;
    x = s[w];
  }
}
// the least integer not in s: 32 * words when every bit is set
export function $nat_bits_first_free(s /*: Any */) /*: Int */ {
  let w = 0;
  while (w < s.length && s[w] === 0xffffffff) w++;
  if (w === s.length) return w << 5;
  const free = ~s[w];
  return (w << 5) | (31 - Math.clz32(free & -free));
}
// a copy of s with `words` words (at least s's), the new ones empty
export function $nat_bits_grow(s /*: Any */, words /*: Int */) /*: Any */ {
  const t = new Uint32Array(words);
  for (let w = 0; w < s.length; w++) t[w] = s[w];
  return t;
}

// ---- integer vectors ---------------------------------------------------------------------------

// n zeros
export function $nat_ints_new(n /*: Int */) /*: Any */ { return new Int32Array(n); }
export function $nat_ints_length(a /*: Any */) /*: Int */ { return a.length; }
export function $nat_ints_get(a /*: Any */, i /*: Int */) /*: Int */ { return a[i]; }
// a[i] = v (v a 32-bit integer; i below the length)
export function $nat_ints_set(a /*: Any */, i /*: Int */, v /*: Int */) /*: Int */ { a[i] = v; return 0; }

// ---- lists of members ---------------------------------------------------------------------------

// s plus the integers a[p + 1] .. a[p + a[p]] (a an integer vector holding a count, then that many
// integers); returns p + 1 + a[p], where the next list starts. (A native takes at most three
// arguments: compiled code passes three in registers, and a fourth in memory.)
export function $nat_bits_add_all(s /*: Any */, a /*: Any */, p /*: Int */) /*: Int */ {
  const n = a[p];
  for (let j = 1; j <= n; j++) { const x = a[p + j]; if ((x >>> 5) < s.length) s[x >>> 5] |= 1 << (x & 31); }
  return p + 1 + n;
}
// s minus the integers a[p + 1] .. a[p + a[p]]; returns p + 1 + a[p]
export function $nat_bits_remove_all(s /*: Any */, a /*: Any */, p /*: Int */) /*: Int */ {
  const n = a[p];
  for (let j = 1; j <= n; j++) { const x = a[p + j]; if ((x >>> 5) < s.length) s[x >>> 5] &= ~(1 << (x & 31)); }
  return p + 1 + n;
}

// ---- the interference graph --------------------------------------------------------------------
// (The same layout as the C body's, so that stage 0 keeps only the tiles too: in V8 the whole matrix
// was 3.0 MB of backing store for agent's largest function, the tiles of its lower triangle 0.47 MB.
// g = [head, index, chunk 0, chunk 1, ...]: head = [n, T, tiles so far], T = (n + 31) >>> 5 tile
// rows; index[R(R+1)/2 + C] = the number + 1 of tile (R, C), C <= R, or 0; tile k is words
// (k % 64) * 32 .. + 31 of chunk k / 64, row r of the tile at word r. An edge u-v is bit min & 31 of
// row max & 31 of tile (max >>> 5, min >>> 5).)

// n nodes, no edges
export function $nat_graph_new(n /*: Int */) /*: Any */ {
  const T = (n + 31) >>> 5, head = new Int32Array(3);
  head[0] = n;
  head[1] = T;
  const g /*: Any */ = [head, new Int32Array((T * (T + 1)) / 2)];
  return g;
}
// the edge u-v, u and v not the same
function $graphSet(g /*: Any */, u /*: Int */, v /*: Int */) /*: Int */ {
  const a = u > v ? u : v, b = u > v ? v : u, R = a >>> 5, slot = (R * (R + 1)) / 2 + (b >>> 5);
  let k = g[1][slot];
  if (k === 0) {
    k = g[0][2] + 1;
    g[0][2] = k;
    g[1][slot] = k;
    if ((k - 1) % 64 === 0) g.push(new Uint32Array(64 * 32));
  }
  const chunk = g[2 + (((k - 1) / 64) | 0)];
  chunk[((k - 1) % 64) * 32 + (a & 31)] |= 1 << (b & 31);
  return 0;
}
// the edges d-v for every v in live but d (three arguments: a call from compiled code takes at most
// four, and this one also gets the root stack's top)
export function $nat_graph_add_live(g /*: Any */, d /*: Int */, live /*: Any */) /*: Int */ {
  for (let w = 0; w < live.length; w++)
    for (let x = live[w]; x !== 0; x &= x - 1) {
      const v = (w << 5) | (31 - Math.clz32(x & -x));
      if (v !== d) $graphSet(g, d, v);
    }
  return 0;
}
// the edges u-v for every u in a and v in b, u and v not the same
export function $nat_graph_add_cross(g /*: Any */, a /*: Any */, b /*: Any */) /*: Int */ {
  for (let w = 0; w < a.length; w++)
    for (let x = a[w]; x !== 0; x &= x - 1) $nat_graph_add_live(g, (w << 5) | (31 - Math.clz32(x & -x)), b);
  return 0;
}
// word w of u's row: its neighbours 32w .. 32w + 31, as bits (below the diagonal tile, u's own row;
// at and after it, u's column in the tiles below)
export function $nat_graph_word(g /*: Any */, u /*: Int */, w /*: Int */) /*: Int */ {
  const ru = u >>> 5, bu = u & 31, T = g[0][1];
  if (w < 0 || w >= T) return 0;
  if (w < ru) {
    const k = g[1][(ru * (ru + 1)) / 2 + w];
    return k === 0 ? 0 : g[2 + (((k - 1) / 64) | 0)][((k - 1) % 64) * 32 + bu] | 0;
  }
  const k = g[1][(w * (w + 1)) / 2 + ru];
  if (k === 0) return 0;
  const chunk = g[2 + (((k - 1) / 64) | 0)], at = ((k - 1) % 64) * 32;
  let x = w === ru ? chunk[at + bu] : 0;
  for (let i = w === ru ? bu + 1 : 0; i < 32; i++) x |= ((chunk[at + i] >>> bu) & 1) << i;
  return x | 0;
}
// out = the neighbours of u (out a set of at least (n + 31) >>> 5 words; its words past those cleared)
export function $nat_graph_row(g /*: Any */, u /*: Int */, out /*: Any */) /*: Int */ {
  for (let w = 0; w < out.length; w++) out[w] = $nat_graph_word(g, u, w);
  return 0;
}
