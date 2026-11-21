({
    packetReads: lab.packetPrediction(),
    completeFrame: lab.frame("default", "clean", "baseline", "empty"),
    againstC: lab.rayVersusC("default", "clean"),
    blindChoice: lab.selection("dynamic", 3, 35)
})
