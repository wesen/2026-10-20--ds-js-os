# Questions for the article "6. When to Compile: Caches, Load-Time Generation and Tiers"

1. The CJI installer's record has no field for the compiler or the reactor. Which field covers them, and why is that sufficient?
2. The installer has two slots. Describe the order of writes when a new module is installed, and what the device finds after a power loss just before the last write.
3. Using the figures in section 6.5, compute how many turns are needed to repay the extra cost of native compilation for Editor, and state how caching changes the conclusion.
4. Franz and Kistler reported that loading from slim binaries took almost twice as long as loading native binaries on their fastest machine. Give the reason they still considered the design worthwhile, and name the form that plays the slim binary's role on the handheld.
5. Which resource limit makes native code size a concern for Editor, and what are the two memory figures that show it?
6. Section 6.6 gives two ratios between native and WebAssembly size for Editor, 4.76 and 2.7. What does each one compare, and why do they differ?
