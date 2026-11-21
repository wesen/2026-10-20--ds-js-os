#!/bin/bash
# Replay the two test-binary invocations given to the Opus High researcher.
set -euo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
go test -v -count=1 -timeout=10s ./pkg/tracerepl
go test -v -timeout=40s ./pkg/tracearchive \
    -run='TestArchivedPassesAndEvidenceRanges|TestConcurrentReadsShareSuccessfulInflation' \
    -bench=BenchmarkCheckedMiddleDump -benchtime=10x -count=2
