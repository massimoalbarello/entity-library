# Entity Library engineering principles

Follow the existing ownership boundaries: the Bun backend owns public authentication and HTTP;
the C++ engine owns persisted library state and inference; the frontend owns interactions.

Treat originals, embeddings, names, manually confirmed assignments and passkeys as durable user
data. Migrations must preserve them unless the requested change explicitly requires otherwise.
Never use a personal deployment for automated registration or destructive integration tests.

Keep model and runtime changes within the documented Nibrun resource budget. Changing embedding
models also changes the meaning of existing vectors and thresholds; establish a migration and
matching validation before replacing them.

Keep generated binaries, model files, credentials and library data out of source control. Publish
the Linux executable through the checked release workflow. Preserve third-party license notices
when changing bundled dependencies.

Use real browser or inference checks when a change crosses those boundaries. Add tests for
observable behavior and data integrity rather than duplicating implementation details.

Keep the interface black, white and neutral gray, matching Face Library's Minimal Neutral
palette. Preserve the original colors of photos and camera previews.

Each photo has one editable description. Generate direct scene descriptions with visible
attributes and relationships; avoid stock introductions such as “a picture of” or “in this image”.
Do not add separate description fields for screen content or invent attributes to fill a template.

Search always combines description BM25 and thresholded visual retrieval into one ranked list.
Do not add a search mode selector or silently fall back to only one retrieval source.

Keep the search interface minimal: no suggested-query chips or “Try a search” row.

Leave at least 16px between editable fields and their action row; use consistent gaps between
controls and hide empty status text so form spacing does not depend on incidental margins.

Keep photo preview DOM nodes stable across metadata polling. Show preview, processing and
description problems on the affected photo card with a visible marker and specific explanation;
do not replace these with collection-wide warning counts. Provide recovery in the photo dialog.
