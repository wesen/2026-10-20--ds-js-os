// Package doc holds the trace-repl help pages: the user guide, the query
// examples, the JavaScript API reference and the CLI and HTTP reference.
// They are embedded and served by `trace-repl help <slug>`.
package doc

import (
	"embed"

	"github.com/go-go-golems/glazed/pkg/help"
)

//go:embed *.md
var docFS embed.FS

// AddDocToHelpSystem loads every page of this package into hs.
func AddDocToHelpSystem(hs *help.HelpSystem) error {
	return hs.LoadSectionsFromFS(docFS, ".")
}
