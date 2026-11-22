---
id: G-03
title: Heightfield terrain
group: Geometry
about: Ridged fractal noise as a heightfield; snow where the slope is gentle and the altitude high, rock elsewhere.
tries: Lower the snow line|Make it a desert instead|Put the sun on the horizon
docs: renderer
focus: params
---
# Heightfield terrain

`shape.heightfield(p => h, { size, height })` lifts a plane by a field of $(x, z)$: here, ridged multifractal noise — $1 - |n|$ per octave, squared — which makes sharp crests and soft valleys.

The material reads two things the geometry already knows:

- `p.N.y` — the slope (1 is flat);
- `p.P.y` — the altitude.

Snow lies where both are high: `p.N.y.smoothstep(0.75, 0.9).mul(p.P.y.smoothstep(snowLine, snowLine + 0.3))`. It is all one field graph, evaluated on the GPU.
