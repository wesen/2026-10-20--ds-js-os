# PicoCalc compiler laboratory

Read the [supervisor’s chapter](analysis/01-which-compiler-work-pays-for-itself-on-a-handheld.md) for a newcomer’s introduction to the compiler, the experiment and the physical results. The [ticket index](index.md) links the four researchers’ design guides and the independent methods examination. The [diary](reference/01-supervising-experimentalist-diary.md) records the order in which results were obtained, including the calibration, unsuccessful predictions and follow-up tests.

Each study compares against the compiler frozen at `40bcf850a5809ef6d839127869faa952596ed157`. Evidence files under `various/` contain measurement rows, digests and derived tables. The [analysis script](scripts/11-cross-study.py) regenerates the comparison figure. The scripts directory also holds the physical protocols. Running those hardware protocols changes and subsequently restores the factory application on the connected research board.
