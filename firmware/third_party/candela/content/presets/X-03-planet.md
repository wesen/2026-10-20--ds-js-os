---
id: X-03
title: A procedural planet
group: GPU
about: A sphere-traced planet displaced by fractal noise, an ocean, and an exponential atmosphere — three lambdas, no textures.
tries: Raise the sea level|Make the atmosphere thicker and redder
docs: gpu, media
focus: params
---
# A procedural planet

- **Land** — an SDF: the sphere's distance minus a ridged fractal height, $d = |\mathbf p| - R - h(\hat{\mathbf p})$. Not an exact distance any more, so the tracer steps conservatively (`lipschitz: 1.5`).
- **Ocean** — a smooth sphere at sea level with a glossy dark-blue material.
- **Atmosphere** — a heterogeneous medium whose density falls exponentially with altitude, $\sigma(\mathbf p) = \sigma_0 e^{-(|\mathbf p| - R)/H}$, bounded by a box. Its majorant is proved by interval arithmetic.

Colours come from altitude and slope, like the terrain preset.
