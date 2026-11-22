# Questions for the article "2. Measuring Before Optimizing"

1. A report says "Agenda's first response comes 1.8 seconds after the boot compile begins". Using the table in section 2.1, state where that interval ends and name one thing the user still waits for after it.
2. Using the two measurements in section 2.2, compute the share of the measured key-press path spent in application code, and the largest speedup of that path that faster application code could give. Why is the share an upper limit?
3. In the boot profile of section 2.3, what was Agenda doing during the 559 ms, which world used the largest share of that time, and what change did the project make as a result?
4. The first hypothesis for CJI's slowness was garbage collection. Which two numbers in section 2.4 refute it?
5. What check gives confidence that the script of Experiment 2 reads the code correctly, and what does that check not establish?
6. Section 2.4 gives two per-token costs for the typed compiler on the device. State both, and say what each one measures.
