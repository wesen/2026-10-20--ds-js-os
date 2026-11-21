["empty", "mixed", "full"].map(kind => {
    const row = lab.packetCosts("opening", kind);
    return {kind, packets:row.packetsPerBlock, unit:row.unit,
        scalar:row.schedules.scalar.cycles_per_packet_median,
        minimum:row.schedules.empty.cycles_per_packet_median};
})
