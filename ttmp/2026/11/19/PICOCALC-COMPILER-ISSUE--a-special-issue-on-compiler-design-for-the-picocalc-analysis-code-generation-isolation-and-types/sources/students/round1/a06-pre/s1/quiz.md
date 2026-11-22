# Questions for the article "6. When to Compile: Caches, Load-Time Generation and Tiers"

1. The typed compiler's source file is changed in a firmware update, and the application's source is unchanged. Should a cached module be reused? Explain using the list of inputs in section 6.3.
2. Why is the record written after the module, and what does the device find after a power loss between the two writes?
3. Using the figures in section 6.5, compute how many turns are needed to repay the extra cost of native compilation for Editor, and state how caching changes the conclusion.
4. Franz and Kistler reported that loading from slim binaries took almost twice as long as loading native binaries on their fastest machine. Give the reason they still considered the design worthwhile, and name the form that plays the slim binary's role on the handheld.
5. Which resource limit makes native code size a concern for Editor, and what are the two memory figures that show it?
6. An edit changes the body of one function out of 120 and no signature. With a per-function cache, what is recompiled and what additional step is still required?
