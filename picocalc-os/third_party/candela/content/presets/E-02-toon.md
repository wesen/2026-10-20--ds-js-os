---
id: E-02
title: A custom integrator: toon shading
group: Engines
about: integrator.define with a kernel traced from JS: intersect, test a shadow ray, quantise the light into bands.
tries: Add a rim light term|Make it a single-bounce “direct lighting only” integrator instead
docs: architecture, renderer
focus: shader
---
# A custom integrator: toon shading

```js
integrator.define('toon', { kernel: ({ ray, scene }, P) => { … return colour } })
```

The kernel is a **traced lambda**, like a material field — `scene.intersect(ray)` returns a symbolic hit with `P`, `N`, `albedo`, `missed`; `scene.occluded(o, d)` is a shadow ray; `scene.sunDir` is the sun. JS runs once to build the graph; the result is WGSL, then GLSL for WebGL2.

Here: Lambert's $N \cdot L$ against the sun, quantised into bands, darkened in shadow, with an ink outline where the normal turns away from the camera.
