# Qualify typed Editor across the supported document range

This is the document workspace for ticket PICOCALC-EDITOR-CAPACITY.

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

- Add documents: `docmgr doc add --ticket PICOCALC-EDITOR-CAPACITY --doc-type design-doc --title "My Design"`
- Import sources: `docmgr import file --ticket PICOCALC-EDITOR-CAPACITY --file /path/to/doc.md`
- Update metadata: `docmgr meta update --ticket PICOCALC-EDITOR-CAPACITY --field Status --value review`
