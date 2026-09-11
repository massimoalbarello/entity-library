# Validation — 11 September 2026

The initial Linux x86_64 executable was built with Bun 1.4.0 and a static C++ engine using
OpenCV 4.10.0 and the pinned clip.cpp/GGML sources. Model: OpenCLIP ViT-B/32 LAION2B Q4_0.

- Executable: **85.4 MiB**, excluding downloaded model artifacts.
- SHA-256: `d77df5df066ca94e275eb617fa01a7120263c1dc1cfe928a2596ef620ad8eb09`.
- Model package: approximately 88 MiB, downloaded and verified on the first app startup.
- Test allocation: **1 CPU / 1 GiB RAM**, swap capped to the same limit, read-only container
  root filesystem, persistent data directory and 16 MiB temporary filesystem.
- Measured peak: **451.8 MiB** from the Linux cgroup `memory.peak` counter, including
  both server processes and charged file cache. Measured across first startup and restart.

## Passed checks

- TypeScript type checking; six download-integrity and owner-authentication unit tests.
- First-start model download from an empty cache; checksum verification and cached restart.
- Browser registration with a virtual passkey, returning sign-in and sign-out invalidation.
- Rejection of unauthenticated image/library access, cross-origin requests and attempts by a
  second visitor to claim the library.
- JPEG/PNG uploads; byte-for-byte preservation of originals; five views per processed photo.
- Initial retrieval: “banana” ranked the D2L banana/bear montage first; “cat” ranked the
  cats/remotes sample first. See the stricter cutoff regression below.
- Simulated camera capture and upload; desktop and 390-pixel mobile layouts without overflow.
- A 16-megapixel PNG and a long Unicode filename; malformed-image error handling.
- Persisted originals, metadata, embeddings, session and search results after process restart.
- Deleting a photo removes it from the library and the search results.
- No browser JavaScript errors during the final integration run.

The Linux run used Docker Desktop's x86_64 execution on an Apple Silicon Mac. This is a Linux
compatibility and resource check, not a timing benchmark on Nibrun hardware. Earlier host
browser checks also passed on macOS with system OpenCV 5.0.0.

The public photo set is deliberately small; these checks establish that the implementation
works, not general recognition accuracy. The 2,000-photo cap has not been tested with a full
library. Label and retrieval cutoffs remain heuristics. A larger model or different preprocessing
needs a fresh quality/memory evaluation and an explicit reindex migration.

The app is deployed on Nibrun and published to GitHub; see [deployment details](DEPLOYMENT.md).
Source control contains no weights, credentials, user library or downloaded application test
photos. Docker is only a build/test dependency.

## Reproduce

```sh
bun install --frozen-lockfile
bun run build
bun run check
bun test
TEST_COLD=1 bun run test:linux
```

Install Chrome/Chromium and ffmpeg for the browser/camera checks. The runner creates its own
localhost instance and disposable data. Never point ownership tests at a personal deployment.

## Search cutoff regression — 11 September 2026

Raised the final photo similarity cutoff from 0.18 to 0.25 in the model manifest. The same
19 public COCO sample photos were indexed in a disposable local instance using the real
encoder and whole-image/crop pipeline. No personal deployment data was copied for this test.

| Query | Results at 0.18 | Results at 0.25 | Retained match score |
| --- | ---: | ---: | ---: |
| phone | 9 | 1 | 0.2711 |
| banana | 11 | 1 | 0.2727 |
| pizza | 5 | 1 | 0.3031 |
| zebra | 7 | 1 | 0.3343 |
| flowers | 3 | 1 | 0.2776 |
| broccoli | 5 | 1 | 0.2532 |

“Phone” now retains only Sample 16 (the phone on a laptop). The next score is 0.2492 and
is excluded. These scores were measured on macOS; Linux image decoding can differ slightly.

This is a small-sample heuristic with a precision/recall tradeoff, not a relevance guarantee:
the cup/toothbrush photo still falsely matches “cat” (0.2628) and “snowman” (0.2569). Raising
the threshold enough to remove both would also remove the correct broccoli match (0.2532).
The D2L banana/bear montage's weak banana score (~0.247) is now intentionally excluded;
the browser regression checks that empty response and its UI, while retaining the cat
retrieval and persistence checks. The separate COCO check above preserves a positive banana case.

Native CTest checks cover the inclusive boundary, weak-only/empty results, crop weighting,
photo deduplication and descending order. Both local and Linux builds run this test.

The updated Linux executable passed the full disposable browser suite, including the empty
banana-montage result, positive cat retrieval (0.2860), original preservation, camera,
16-megapixel PNG handling, restart, deletion and passkey reauthentication. Peak cgroup
memory was 453.6 MiB under the same 1 GiB limit. Type checking and all six backend tests
also passed. The updated binary checksum is recorded in [deployment details](DEPLOYMENT.md).

## SmolVLM scene-caption trial — 11 September 2026

The integrated app uses SmolVLM-500M-Instruct Q4_K_M plus its Q8_0 projector, one 512-pixel
view per caption, and the retained CLIP model. Models run sequentially: the CLIP context and
scratch storage are released before the caption subprocess starts. Captions use separate
SQLite FTS5 fields for the main scene and owner-supplied depicted content.

- Linux x86_64 standalone app: **92.9 MiB**. Verified/cached model package: approximately **481 MiB**.
- Complete disposable browser workload: **953.6 MiB peak** (`memory.peak` = 999,890,944 bytes)
  under **1 CPU / 1 GiB**, with swap disabled. Docker Desktop on Apple Silicon emulates Linux
  x86_64 here; this is a cgroup measurement of the full app, not a native Nibrun latency benchmark.
  No OOM events were observed. The CI test also asserts zero OOM kills.
- The exact COCO128 phone photo generated: “A laptop with a phone on top of it, plugged into a
  power outlet.” It matched `phone` and did not match `person` in default scene search. This is
  one regression case, not proof that depicted content is always handled correctly.
- Real cat caption inference and BM25 passed. Manual scene edits, separate screen-content
  retrieval, ordinary-person exclusion, and desktop/mobile layouts passed.
- Browsing and scene search remained responsive while the caption subprocess ran.
- Camera capture, protected originals, 16-megapixel PNG decode, UTF-8 filenames, invalid-image
  handling, deletion, passkey sign-out/sign-in and restart persistence passed.
- Native migration/FTS tests and all six Bun backend tests passed; TypeScript checking passed.
  A real inference regression also verified stable image vectors across four CLIP unload/reload
  cycles, with unrelated solid-color image inference between repeated encodings.

That lifecycle regression exposed an uninitialized vision accumulator and global scratch
storage in the older vendored CLIP runtime. The local fixes initialize the accumulator and
bind scratch storage to the model context. They preserve the intended embedding contract;
existing originals and valid CLIP vectors are retained.

Captions remain approximate. The host run invented an extra red phone/brand detail for the
same picture. The first version therefore exposes an editable caption and does not claim
reliable automatic physical-versus-depicted entity extraction. See `SCENE-DESCRIPTIONS.md`.


## Single-description update — 11 September 2026

Checked build: [34617808811](https://github.com/massimoalbarello/entity-library/actions/runs/34617808811),
source `e0a48301aa5129f18e7771a1bc1c4378fd2dbc63`.

- Native migration checks preserve originals, vectors and both former manual text fields,
  remove the second field, rebuild BM25, and regenerate legacy automatic captions once.
  The migration also passed against a copy of the live 20-photo / 100-embedding library.
- Tests cover direct-opening cleanup, retaining meaningful screen relationships inside a
  sentence, adjective queries, manual edit precedence and restart/deletion behavior.
- Real local and Linux browser/inference suites passed, including the single description
  editor, phone/person regression, adjective search, camera, persistence and authentication.
  Desktop and mobile editor previews remain monochrome and contain one text area.
- The Linux job enforced 1 CPU / 1 GiB. Its 327.1 MiB cgroup counter has the shared-cache
  caveat described above and is not a total-RAM claim.
- The revised prompt requests visible attributes and relationships with a 96-token budget.
  The Linux phone caption was “A black phone with a red case on top of a white laptop.”
  This still misattributes some colors/objects in the stacked-laptop photo. The local model
  also inserted an unsupported phone brand despite instructions; prompt changes improve
  description style, not factual guarantees. Manual corrections remain available.


## Always-combined search — 11 September 2026

Checked build: [34619180156](https://github.com/massimoalbarello/entity-library/actions/runs/34619180156),
source `75493edff9e4a09a2bfff176dc9b487f8fc52e78`.

- Native checks cover union, deduplication, agreement boosting, text-only and visual-only
  eligibility, preserving the raw cosine score, empty results and the existing visual cutoff.
- Local and Linux real-inference browser suites passed. Removing “cat” from the caption still
  retrieves the cat visually; an unrelated photo with an edited phone description matches
  through text alone. A photo matching both reports both sources and ranks first.
- A search submitted during real caption inference automatically retries HTTP 202 responses
  and completes with combined results. Browsing remains available. Both models remain serialized.
- Desktop and mobile screenshots show no selector. The live assets match the checked build,
  health returns 200, and unauthenticated search returns 401.
- The Linux suite passed under 1 CPU / 1 GiB with a 326.4 MiB cgroup counter; the shared-cache
  caveat above still applies. This is not a total-RAM estimate.


## Stable previews and per-card errors — 11 September 2026

Checked build: [34624799699](https://github.com/massimoalbarello/entity-library/actions/runs/34624799699),
source `47d6f06adb64506a38da6431274469137214b19c`.

- Reproduced the old renderer replacing image nodes at each 2.5-second metadata poll.
  The new keyed cards preserve image nodes and in-flight requests, including when caption
  metadata changes. An uncached preview delayed 3.5 seconds loads with exactly one request.
- Browser tests simulate a description error while a previous caption remains, verify the
  marker and specific text, then verify the marker clears when the error resolves.
- A failed preview remains marked through polling, exposes a retry in its dialog, and restores
  the image and clears the warning after a successful retry. Invalid photo uploads also show
  a card marker and processing error. The global warning banner stays empty in these cases.
- Local and Linux real-inference/authentication/persistence suites passed. Error-state previews
  were reviewed on desktop and mobile, with top-aligned cards and retained monochrome styling.
- The Linux suite ran under 1 CPU / 1 GiB. Its 325.9 MiB cgroup counter has the shared-cache
  caveat above and is not a total-RAM estimate. Live assets match the checked source.
