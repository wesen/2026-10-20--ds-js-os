// Frozen before running any new candidate. Cost units are estimated issue slots.
// Candidates are existing ordinary RV32, eight scalar gathered lanes, or eight PIE lanes.
// Common hit-continuation costs cancel for the two grouped alternatives.
(function (root) {
    "use strict";
    function choose(region) {
        const n = Number.isInteger(region.constantTrips) ? region.constantTrips : 32;
        const groups = Math.floor(n / 8), tail = n % 8;
        const guards = 14 + 8 * region.writeStreams;
        const scalar = n * 18;
        // Eight scalar consumers still materialize a difference per active lane.
        const consume = 8 * 8;
        const grouped = guards + tail * 18 + groups * (consume + 7);
        const scores = {stock: scalar, scalar: groups ? grouped + groups * 24 : Infinity,
                        pie: groups ? grouped + groups * 3 + 3 : Infinity};
        let plan = "stock";
        for (const alternative of ["scalar", "pie"]) {
            if (scores[alternative] < scores[plan]) plan = alternative;
        }
        return {plan, scores, assumedTrips: n};
    }
    root.simdChoose = choose;
})(globalThis);
