# A real LLM agent on the PicoCalc: import, adapt to an OpenAI-compatible chat API, test on the ESP32-P4

This is the document workspace for ticket PICOCALC-AGENT.

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

- Add documents: `docmgr doc add --ticket PICOCALC-AGENT --doc-type design-doc --title "My Design"`
- Import sources: `docmgr import file --ticket PICOCALC-AGENT --file /path/to/doc.md`
- Update metadata: `docmgr meta update --ticket PICOCALC-AGENT --field Status --value review`
