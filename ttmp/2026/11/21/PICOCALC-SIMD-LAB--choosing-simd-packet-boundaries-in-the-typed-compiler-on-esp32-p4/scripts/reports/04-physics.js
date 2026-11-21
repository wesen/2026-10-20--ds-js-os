({
    checkedPlanar: lab.physicsPair("particle", 128, "guarded-soa-scalar", "guarded-soa-pie"),
    oneTickIncludingConversion: lab.physicsPair("particle", 128, "aos-scalar", "convert-pie-roundtrip"),
    identicalContactOrder: lab.physicsPair("contact", 128, "grouped-scalar", "grouped-pie")
})
