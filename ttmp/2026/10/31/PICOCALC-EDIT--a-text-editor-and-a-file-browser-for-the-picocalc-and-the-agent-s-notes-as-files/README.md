# A text editor and a file browser for the PicoCalc, and the agent's notes as files

This is the document workspace for ticket PICOCALC-EDIT.

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

- Add documents: `docmgr doc add --ticket PICOCALC-EDIT --doc-type design-doc --title "My Design"`
- Import sources: `docmgr import file --ticket PICOCALC-EDIT --file /path/to/doc.md`
- Update metadata: `docmgr meta update --ticket PICOCALC-EDIT --field Status --value review`
