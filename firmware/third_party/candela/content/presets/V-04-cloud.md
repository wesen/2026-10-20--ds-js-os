---
id: V-04
title: A cloud
group: Media
about: A bright, nearly white volume: high albedo, strong forward scattering, and many scattering events per path.
tries: Make it a storm cloud (lower albedo, denser)|Put the sun behind the cloud for a silver lining
docs: media
---
# A cloud

Clouds are almost pure scatterers — albedo ≈ 0.99 — with a strongly forward-peaked phase function ($g \approx 0.85$). Light inside them takes **dozens** of scattering events before leaving, which is why they look white and soft rather than grey and sharp.

Scattering events inside a volume have their own budget in the path tracer (up to 256), separate from surface bounces: a path that has hit only one surface can scatter 50 times inside the cloud. Russian roulette ends the walk when its throughput gets small.

> **Try it.** Ask the agent to put the sun behind the cloud: the edges light up (the *silver lining*), because forward scattering sends light along the thin edge toward you.
