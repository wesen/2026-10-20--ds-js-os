# PicoCalc native compiler research wave

Start with the [research outcomes and six study assignments](index.md) or the [director's synthesis](analysis/07-what-a-handheld-compiler-should-remember.md). Open the individual intern guides under [design-doc](design-doc) to follow an implementation. Each researcher's chronological investigation appears under [reference](reference).

The [independent host replay](scripts/director/10-replay-host.sh) accepts a new scratch directory and an RV32 ESP GCC binary. It compares the generated images and instruction counts with the recorded results. The [on-device matrix](scripts/director/04-device-matrix.py) verifies the ordinary application against the published release before testing, restores it after the run, and qualifies the restarted worlds. The checked-in [physical measurements](various/director/physical.json) can be analyzed without hardware.
