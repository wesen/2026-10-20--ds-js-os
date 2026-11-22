---
id: R-01
title: The Cornell box
group: Scenes
about: The test scene of global illumination since 1984: red and green walls bleeding colour onto white, under one ceiling light.
tries: Swap the tall block for a mirror box|Replace the light with a sphere light of the same power
docs: monte-carlo, renderer
---
# The Cornell box

Built at Cornell in 1984 (Goral, Torrance, Greenberg, Battaile) to compare rendering against a real, measured box. Everything you see that isn't directly under the light is **indirect**: the soft shadows, the red and green glow on the blocks, the light on the ceiling.

The reflectances here approximate the original's measured paints (white ≈ 0.73, red ≈ 0.55 in red, green ≈ 0.45 in green). The light is a 0.5 m × 0.4 m panel of 6 000 lm at about 3 400 K, like the original's tungsten flood.
