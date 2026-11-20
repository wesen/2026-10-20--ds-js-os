---
Title: Publish the PicoCalc PSIX studies
Ticket: PICOCALC-PSIX-STAGING
Status: complete
Topics: [picocalc]
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: Reproduction instructions for the publication workflow.
LastUpdated: 2026-11-20
WhatFor: Repeat the archived study procedures.
WhenToUse: When independently replaying the study.
---

# Publish the PSIX specialization reading packets

Run from the project root after the relevant source documents are final. Use the article headings as the vault note titles. The vault date and the reMarkable destination correspond to this ticket's research date.

```sh
ticket=$(find ttmp/2026/11/20 -maxdepth 1 -type d -name 'PICOCALC-PSIX-STAGING--*')
scripts="$ticket/scripts/publication"
python3 "$scripts/02-prepare-vault.py" --check design
"$scripts/01-remarkable.sh" design
```

The results packet contains the five analyses and the director report's inline figure. Check source links, then upload the analyses in article order.

```sh
python3 "$scripts/02-prepare-vault.py" --check analysis
"$scripts/01-remarkable.sh" results
```

Prepare the vault additions in a scratch directory to check paths, rewritten links and collisions before changing the vault. The publisher copies the five articles and their one image, creates a scoped commit and verifies that the same revision is on the vault's `origin/main`. It retains previous notes and refuses a vault branch containing unrelated unpublished commits.

```sh
vault=/home/manuel/code/wesen/go-go-golems/go-go-parc
stage=$(mktemp -d /tmp/psix-vault.XXXXXXXX)
python3 "$scripts/02-prepare-vault.py" --vault "$vault" --stage "$stage"
python3 "$scripts/03-deliver-vault.py" "$vault" "$stage"
```

The preparation checks repository-relative links. The vault editions link to companion and previously published articles, retain source paths for local code and data, and store the chart in the day's `_assets/` directory. Delivery notes record the reMarkable service receipts and verified vault revision. A reMarkable upload receipt confirms cloud delivery.
