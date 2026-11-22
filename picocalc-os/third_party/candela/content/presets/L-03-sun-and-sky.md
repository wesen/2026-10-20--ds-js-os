---
id: L-03
title: The sun and the sky
group: Light
about: Move the sun from noon to the horizon: air mass dims and reddens it, the Preetham sky follows.
tries: Sweep the sun from 90° to 5° and describe the illuminance|What does turbidity do to the sky colour?|Explain the Kasten–Young air mass
docs: units, sensor
focus: params
---
# The sun and the sky

The sun's illuminance is not set here: it comes from the **air mass** the light crosses. Kasten and Young's formula gives the air mass at zenith angle $z$; Meinel's attenuation turns it into illuminance:

$$AM = \frac{1}{\cos z + 0.50572\,(96.07995 - z)^{-1.6364}} \qquad E_\perp \approx 128\,000 \cdot 0.7^{AM^{0.678}}\ \mathrm{lx}$$

— about 89.6 klx at zenith, 72.4 at 30°, 52.9 at 15°, 22.6 at 5°. The sun's colour follows the same path through the air: a blackbody at 5778 K, with blue scattered out more strongly as $AM$ grows. The sky is the **Preetham** analytic model, driven by the same sun direction and by **turbidity** (2 is crisp mountain air, 6 is a hazy summer day).

> **Try it.** Drag **Sun elevation** down to 5° and watch the exposure meter follow (EV in the title block). Then raise **Turbidity**.
