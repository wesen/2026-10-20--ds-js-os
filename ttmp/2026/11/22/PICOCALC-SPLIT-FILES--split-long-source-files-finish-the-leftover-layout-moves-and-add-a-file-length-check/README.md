# Split long source files, finish the leftover layout moves, and add a file-length check

This is the document workspace for ticket PICOCALC-SPLIT-FILES.

## Structure

- **design/**: Design documents and architecture notes
- **reference/**: Reference documentation and API contracts
- **playbooks/**: Operational playbooks and procedures
- **scripts/**: Utility scripts and automation
- **sources/**: External sources and imported documents
- **various/**: Scratch or meeting notes, working notes
- **archive/**: Optional space for deprecated or reference-only artifacts

## Getting Started

Use docmgr commands to manage this workspace:

- Add documents: `docmgr doc add --ticket PICOCALC-SPLIT-FILES --doc-type design-doc --title "My Design"`
- Import sources: `docmgr import file --ticket PICOCALC-SPLIT-FILES --file /path/to/doc.md`
- Update metadata: `docmgr meta update --ticket PICOCALC-SPLIT-FILES --field Status --value review`
