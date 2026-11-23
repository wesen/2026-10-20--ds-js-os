package doc

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/go-go-golems/glazed/pkg/help"
	"github.com/go-go-golems/glazed/pkg/help/model"
)

var pages = map[string]model.SectionType{
	"trace-repl-user-guide":     model.SectionTutorial,
	"trace-repl-query-examples": model.SectionExample,
	"trace-repl-js-api":         model.SectionGeneralTopic,
	"trace-repl-cli-and-http":   model.SectionGeneralTopic,
}

// Every page parses, keeps its slug and section type, and has a title and a short description.
func TestPagesLoad(t *testing.T) {
	hs := help.NewHelpSystem()
	if err := AddDocToHelpSystem(hs); err != nil {
		t.Fatal(err)
	}
	for slug, kind := range pages {
		s, err := hs.GetSectionWithSlug(slug)
		if err != nil {
			t.Fatalf("%s: %v", slug, err)
		}
		if s.SectionType != kind || s.Title == "" || s.Short == "" || !s.IsTopLevel {
			t.Fatalf("%s: type %v, title %q, short %q, top level %v", slug, s.SectionType, s.Title, s.Short, s.IsTopLevel)
		}
		if strings.HasPrefix(strings.TrimSpace(s.Content), "# ") {
			t.Fatalf("%s: Glazed renders the title; the content must not start with a level-1 heading", slug)
		}
	}
	entries, err := docFS.ReadDir(".")
	if err != nil {
		t.Fatal(err)
	}
	n := 0
	for _, e := range entries {
		if strings.HasSuffix(e.Name(), ".md") {
			n++
		}
	}
	if n != len(pages) {
		t.Fatalf("%d pages embedded, %d expected: add the new slug to this test", n, len(pages))
	}
}

// The examples page quotes every script of tools/trace-repl/examples verbatim,
// so an edited script cannot leave a stale copy in the help.
func TestExamplesPageQuotesEveryScript(t *testing.T) {
	page, err := docFS.ReadFile("02-trace-repl-query-examples.md")
	if err != nil {
		t.Fatal(err)
	}
	scripts, err := filepath.Glob("../examples/[0-9][0-9]-*.js")
	if err != nil || len(scripts) == 0 {
		t.Fatalf("no example scripts found: %v", err)
	}
	for _, path := range scripts {
		body, err := os.ReadFile(path)
		if err != nil {
			t.Fatal(err)
		}
		quoted := "```js\n" + strings.TrimRight(string(body), "\n") + "\n```"
		if !strings.Contains(string(page), quoted) {
			t.Errorf("%s is not quoted verbatim in 02-trace-repl-query-examples.md; regenerate the page", filepath.Base(path))
		}
	}
}
