({
    packetReads: lab.packetPrediction(),
    completeFrame: lab.frame("default", "clean", "baseline", "empty"),
    blindChoice: lab.selection("dynamic", 3, 35)
})
