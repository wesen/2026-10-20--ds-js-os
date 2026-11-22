---
id: X-04
title: Menger sponge
group: GPU
about: A fractal as a distance field: the JS loop unrolls three folding iterations into straight-line WGSL.
tries: Change ITERATIONS to 4|Make it glass
docs: gpu, architecture
---
# Menger sponge

Start from a cube; remove the middle cross from each face; repeat on the remaining 20 sub-cubes. As a distance field this is a **fold** (Íñigo Quílez's formulation): take the position modulo the cell size, measure the distance to an infinite cross, and keep the maximum with the cube.

```js
for (let k = 0; k < ITERATIONS; k++) { const a = p.mul(s).mod(2).sub(1); s *= 3; … d = fx.max(d, c); }
```

`ITERATIONS` and `s` are JavaScript: the loop runs once, at build time, and writes `ITERATIONS` copies of the fold into the kernel. A field loop would need dynamic control flow on the GPU; an unrolled one is a straight line.
