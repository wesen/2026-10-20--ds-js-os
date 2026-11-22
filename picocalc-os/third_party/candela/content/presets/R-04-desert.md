---
id: R-04
title: Dunes at golden hour
group: Scenes
about: Sand dunes as a heightfield of warped sine ridges, a low sun, and the sky’s blue in every shadow.
tries: Raise the sun to noon|Add a lone cactus|Make the dunes taller
docs: renderer, units
---
# Dunes at golden hour

Dunes are long, asymmetric ridges: a gentle windward slope and a steep slip face. A sine wave warped by low-frequency noise makes a convincing field of them:

```js
h = sin(x · k + fbm(p) · a) shaped by pow(…, 1.5)
```

At 8° elevation, the sun is warm (air mass ≈ 7) and every slip face falls into shadow — lit only by the blue sky. The sand is fine ripples on top: a small **bump** field along the wind direction.
