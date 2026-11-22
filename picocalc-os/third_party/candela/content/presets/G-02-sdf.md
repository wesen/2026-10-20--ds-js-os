---
id: G-02
title: Your own distance field
group: Geometry
about: shape.sdf(p => distance): smooth unions of spheres, a twisted bar, a gyroid shell — sphere-traced on the GPU.
tries: Increase the smooth-union radius|Make the gyroid finer|Twist the bar more
docs: renderer, gpu
focus: params
---
# Your own distance field

A signed distance function returns, for any point, the distance to the nearest surface (negative inside). Anything you can write as one can be rendered:

- **blob** — the *smooth minimum* of three spheres, $\mathrm{smin}(a, b) = \min(a,b) - h^2 k/4$ with $h = \max(k - |a - b|, 0)/k$;
- **twisted bar** — a box evaluated in a frame rotated by an angle proportional to height (not a true distance any more, so it declares `lipschitz: 2` and the tracer takes smaller steps);
- **gyroid** — $|\sin x \cos y + \sin y \cos z + \sin z \cos x| - t$, intersected with a sphere.
