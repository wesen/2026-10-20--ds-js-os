---
id: V-03
title: Smoke: a heterogeneous volume
group: Media
about: Density from fractal noise inside a box, delta-tracked against a majorant found by interval arithmetic.
tries: Make the smoke denser at the bottom|Give it a warm emission like a fire
docs: media, invariants
focus: console
---
# Smoke: a heterogeneous volume

```js
medium.heterogeneous({ density: fx.field(p => …), bounds: shape.box(…), albedo: 0.9, phase: phase.hg(0.3) })
```

A varying density cannot be sampled in closed form. **Delta tracking** samples distances against a constant *majorant* $\bar\sigma \ge \sigma_t(\mathbf x)$ everywhere, and accepts a collision with probability $\sigma_t(\mathbf x)/\bar\sigma$. The result is unbiased if — and only if — the majorant really bounds the density.

You don't supply it. The compiler runs **interval arithmetic** over the density's expression graph across the bounding box and proves a bound (see **I451** in the Console). A density it can't bound is **E450**, not a silent bias.
