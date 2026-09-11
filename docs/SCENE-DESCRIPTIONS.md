# Scene descriptions

The captioning trial uses **SmolVLM-500M-Instruct**, with a Q4_K_M language model and a Q8_0 vision projector, through a pinned llama.cpp runtime. The source model is Apache-2.0; llama.cpp is MIT. Exact URLs, sizes, hashes and runtime revision are in `apps/backend/src/models/caption-manifest.json`.

The language model was converted from the upstream f16 GGUF at revision `72e986006ef53e37cdd3f6d4241c90b0f01df376` using `llama-quantize` from llama.cpp revision `8172e6577ac2b35de1ec1e5d1c0aaad6c4a2129f`:

```sh
llama-quantize SmolVLM-500M-Instruct-f16.gguf smolvlm-500m-q4_k_m.gguf Q4_K_M
```

The result is 303,251,712 bytes with SHA-256 `0036ee911a27da7d039e084f2d2c32b9976c81d9dde8945811ed589a3099bca8`. The unmodified projector is 108,783,360 bytes. Some tensors use the quantizer's fallback types because their dimensions do not support K quantization. Both components are cached after verified download; neither is embedded in the app binary. Model files are release assets, not Git source files.

## Behavior

- Each photo gets one automatic scene sentence. The worker uses a temporary JPEG with its longest side at most 512 pixels, temperature zero, a 96-token budget, context 1024, and batch/microbatch 64. The prompt asks for visible colors, sizes, textures, hair, clothing and relationships without guessing brands or identities. Only the first complete sentence is retained; stock introductions such as “a picture of” and “in this image” are stripped from the start. Incomplete output is marked for retry or manual correction.
- Existing photos are backfilled without replacing originals, photo IDs, CLIP vectors or authentication data. New uploads first get their existing CLIP index, then a caption. Processing is serialized.
- Each photo has **one editable description** and one FTS column. The migration merges existing manual text from both former fields, removes the second column, and queues old automatic descriptions for regeneration once. Originals and embeddings are untouched. Corrections made during inference take precedence over the late automatic result. The producer ID carries `:direct-v2`; weights and their cache paths stay unchanged.
- Every search combines SQLite FTS5/BM25 description matches with CLIP visual matches. Text retrieval requires all meaningful terms with English stemming and person/people expansion. Visual retrieval keeps the existing 0.25 cutoff and deduplicates crops by photo. Equal-weight reciprocal rank fusion (`1 / (60 + rank)` per source) combines the union, boosts agreement, breaks ties by descending photo ID and returns at most 60 photos. No mode selector or text-only fallback is exposed. The API returns a fused `score`, `sources`, and, for visual matches, the original `visual_score` and crop.
- While caption inference owns the memory budget, browsing remains available. Search returns HTTP 202 with `pending: true`; the UI retries every 500 ms and cancels outdated searches. A three-second renewable priority window gives pending searches a turn before the next background photo job. Both retrieval methods run before results are returned. The CLIP encoder is released before launching the caption subprocess and loaded lazily when next needed. The subprocess exits after each photo, releasing its model and working memory. The vendored CLIP runtime also uses context-owned scratch storage and initializes its vision accumulator so repeated unload/reload is deterministic.
- Failed captions can be retried or entered manually. Worker crashes recover queued work on restart. A process has a 180-second deadline. Deletion cascades to the description and its FTS row.

## Limits

This is a captioning trial, not reliable scene-graph extraction. Small objects can be missed at 512 pixels; captions may hallucinate or omit details. A one-sentence summary often avoids a tiny person on a screen, but that behavior is not guaranteed. Correct the single description if it overemphasizes screen content. BM25 matches words, so mentioning a person inside a screen can still match a person query. Visual retrieval can also match screen content; the combined ranking is not a guarantee of physical-versus-depicted scene understanding.

Producer identity, status and manual corrections are stored independently of the CLIP embedding space. A future captioner should reuse the description contract and verified artifact installer. Automatic regeneration for a different caption model requires an explicit migration policy that preserves manual edits. Do not silently reuse old captions as if a new model generated them.

## Validation

Native tests cover migration, restart, manual edit precedence, FTS deletion, literal query handling, merging legacy manual fields without changing originals or vectors, adjective search, preamble removal, and rejection of unfinished output. Browser checks use real image inference and exercise editing/search/authentication/persistence in a disposable library. Linux tests enforce a 1 GiB cgroup limit and record peak memory. See `VALIDATION.md` for measured results.
