# One conformance suite for the three RV32 executors, captured on the P4, with RV32F

This is the document workspace for ticket PICOCALC-RV32-CONFORMANCE.

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

- Add documents: `docmgr doc add --ticket PICOCALC-RV32-CONFORMANCE --doc-type design-doc --title "My Design"`
- Import sources: `docmgr import file --ticket PICOCALC-RV32-CONFORMANCE --file /path/to/doc.md`
- Update metadata: `docmgr meta update --ticket PICOCALC-RV32-CONFORMANCE --field Status --value review`
