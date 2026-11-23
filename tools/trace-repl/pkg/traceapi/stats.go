package traceapi

import (
	_ "embed"
	"fmt"

	"github.com/dop251/goja"
)

//go:embed stats.js
var statsLibrary string

// InstallStats defines the global `stats`: median, quantiles, summaries and
// paired comparisons that every study reports. It reads no evidence, so it
// needs no bridge and can be installed in any VM before user code runs.
func InstallStats(vm *goja.Runtime) error {
	if vm == nil {
		return fmt.Errorf("stats runtime is required")
	}
	if _, err := vm.RunScript("trace/stats.js", statsLibrary); err != nil {
		return fmt.Errorf("installing stats: %w", err)
	}
	return nil
}
