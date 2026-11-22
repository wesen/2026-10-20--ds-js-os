---
id: B-01
title: Hello, sphere
group: Basics
about: One sphere, a grey card, daylight. Every default is announced; everything is a value.
tries: Explain every default this scene assumed|Make the sphere gold and check it in the IR|Take a screenshot and tell me what the exposure is doing
docs: grammar, units
---
# Hello, sphere

A red sphere on an **18 % grey card** under a physical sky. Six lines of code, and every one of them is a value: each call returns a new, immutable builder.

> **Try it.** Change `roughness(0.4)` to `0.1` and press **Run** (⌘↵). Only the material's kernel changes; the shader cache keeps the rest.

What you did not specify was filled in — and announced. Open the **Console → Explain** tab: the camera is a 50 mm thin lens, the exposure is *metered* like a camera's (a log-average of block luminances, $EV_{100} = \log_2(L\,S/K)$ with $K = 12.5$), and the engine was chosen for this device.

The render is a **progressive path tracer** running on the GPU — WebGPU compute where the browser has it, WebGL2 otherwise. The same kernel source runs on both: the WGSL is generated, and translated to GLSL for WebGL2. See it in the **Shader** view.
