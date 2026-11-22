---
id: F-01
title: Checker, stripes, ramps
group: Fields
about: A field is a lambda traced into the material kernel: patterns in world space, in UV space, and through a colour ramp.
tries: Make the stripes follow the sphere’s UVs instead of world X|Add a third stop to the ramp|Open the Shader view and find the generated pattern code
docs: architecture, gpu
---
# Checker, stripes, ramps

Wherever a value goes, a **lambda** can go instead:

```js
material.pbr().baseColor(p => fx.mix(dark, light, fx.checker(p.P.xz, 4)))
```

The lambda runs **once**, at build time, with a symbolic `p`. Every method call records a node; the result is an expression graph, compiled to WGSL inside the material function. The JS never runs per pixel.

- floor: `fx.checker(p.P.xz, 2)` — world space, so it does not care which object it is on;
- left sphere: `fx.stripes(p.uv.x, 12)` — the sphere's own parameterisation;
- right sphere: `fx.ramp(p.N.y.mul(0.5).add(0.5), [[0, '#14324a'], [0.5, '#e0c090'], [1, '#f6f2e8']])` — a colour ramp driven by the normal.

> **Try it.** Open **Shader** and search for `checker` — that is your lambda, after optimisation.
