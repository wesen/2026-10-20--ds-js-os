---
id: W-02
title: Talk to the world
group: Live
about: A room built for the agent: every object has an id or a tag, so it can be read and patched live with world.$ and world.$$.
tries: Dim the lamp to 400 lm and make it warmer|Make every .fruit a little glossier|Move the bowl to the left edge of the table and take a screenshot
docs: agent, architecture
focus: agent
---
# Talk to the world

Builders are immutable values; the **world** is the live, mutable view of what is on screen. The agent (and you, in the console of the agent view) can read and write it:

```js
world.$('#lamp').power                 // → 900 lm
world.$('#lamp').power = 400           // a value patch: repack, no rebuild
world.$$('.fruit').forEach(f => f.material.roughness = 0.2)
world.$('#bowl').position = [-0.5, 0.82, 0]
```

Each write becomes a **patch** recorded in the Console with its cost — *value* (repack) or *structure* (a cached recompile) — and folds back into the scene, so the code view and the image never disagree.

> **Try it.** Open the **Agent** view and ask: *"dim the lamp to 400 lm, make it warmer, and show me"*.
