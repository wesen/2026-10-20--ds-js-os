---
id: S-02
title: Diamond fire
group: Spectral
about: An octahedral diamond with its Sellmeier dispersion: total internal reflection traps light, dispersion splits it into fire.
tries: Compare with cubic zirconia (n ≈ 2.17, less dispersive)|Add a second, smaller gem
docs: renderer
---
# Diamond fire

Diamond has a very high index ($n_d = 2.417$) — its critical angle is only 24.4°, so most light that enters is trapped and bounces inside until it finds a facet to leave by. It is also fairly dispersive (Abbe 55): each internal bounce spreads the colours a little more. The flashes of colour are called **fire**.

The gem here is a distance field — an octahedron with a flat table — and its IOR is diamond's Sellmeier fit:

```js
ior.sellmeier({ B: [0.3306, 4.3356, 0], C: [0.1750 ** 2, 0.1060 ** 2, 0] })   // λ in µm
```

Small, bright lights make fire visible; a uniform environment hides it.
