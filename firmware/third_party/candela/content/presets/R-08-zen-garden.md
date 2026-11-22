---
id: R-08
title: Zen garden
group: Scenes
about: Raked gravel around three stones: the rake lines are a heightfield of rings around each stone, blended by distance.
tries: Add a fourth stone|Make the light late afternoon
docs: renderer
---
# Zen garden

The gravel is a heightfield whose ridges follow the rake: straight lines far from the stones, concentric rings near them. For each point, the nearest stone's distance $d$ gives ring ridges $\sin(k d)$; a smooth blend toward straight ridges $\sin(k x)$ happens as $d$ grows.

The stones are distance fields too — squashed spheres with fractal displacement — and the moss on them is the same up-facing-and-noisy rule as the fragment preset.
