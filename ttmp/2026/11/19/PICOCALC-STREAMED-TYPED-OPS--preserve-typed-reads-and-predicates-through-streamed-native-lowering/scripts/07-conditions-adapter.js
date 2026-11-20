    capturePredicate(start) {
        const relative = this.comparisonAt - start;
        this.comparisonAt = -1;
        return Number.isInteger(relative) && relative >= 0 ? relative : -1;
    }

    resumePredicate(relative, start) {
        this.comparisonAt = relative >= 0 ? start + relative : -1;
    }

    packPredicate(consumer, operand, invertConsumer = consumer === 0x0d) {
