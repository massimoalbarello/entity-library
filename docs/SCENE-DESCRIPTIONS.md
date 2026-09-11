# Scene descriptions

The captioning trial uses **SmolVLM-500M-Instruct**, with a Q4_K_M language model and a Q8_0 vision projector, through a pinned llama.cpp runtime. The source model is Apache-2.0; llama.cpp is MIT. Exact URLs, sizes, hashes and runtime revision are in `apps/backend/src/models/caption-manifest.json`.

The language model was converted from the upstream f16 GGUF at revision `72e986006ef53e37cdd3f6d4241c90b0f01df376` using `llama-quantize` from llama.cpp revision `8172e6577ac2b35de1ec1e5d1c0aaad6c4a2129f`:

```sh
llama-quantize SmolVLM-500M-Instruct-f16.gguf smolvlm-500m-q4_k_m.gguf Q4_K_M
```

The result is 303,251,712 bytes with SHA-256 `0036ee911a27da7d039e084f2d2c32b9976c81d9dde8945811ed589a3099bca8`. The unmodified projector is 108,783,360 bytes. Some tensors use the quantizer's fallback types because their dimensions do not support K quantization. Both components are cached after verified download; neither is embedded in the app binary. Model files are release assets, not Git source files.

## Behavior

- Each photo gets one automatic scene sentence. The worker uses a temporary JPEG with its longest side at most 512 pixels, temperature zero, a 64-token budget, context 1024, and batch/microbatch 64. Only the first complete sentence is retained. Incomplete output is marked for retry or manual correction.
- Existing photos are backfilled without replacing originals, photo IDs, CLIP vectors or authentication data. New uploads first get their existing CLIP index, then a caption. Processing is serialized.
- The description has two editable fields: the **main scene** and optional **content shown on a screen or in a picture**. Automatic generation currently populates only the main scene. It does not reliably extract depiction roles; the optional field is supplied by the owner. Corrections made during inference take precedence over the late automatic result.
- Default search uses SQLite FTS5/BM25 on the main scene. It requires all meaningful query terms, with English stemming and a small expansion for “person/people.” It does not mix arbitrary detector tags or CLIP matches into those results.
- “Scenes + screen / picture content” includes both fields. “Visual similarity” retains the existing CLIP search and its model-specific cutoff. These are explicit modes, not an unreliable automatic classifier of query intent.
- While caption inference owns the memory budget, scene search and browsing remain available. Visual search reports that it is temporarily busy. The CLIP encoder is released before launching the caption subprocess and loaded lazily when next needed. The subprocess exits after each photo, releasing its model and working memory. The vendored CLIP runtime also uses context-owned scratch storage and initializes its vision accumulator so repeated unload/reload is deterministic.
- Failed captions can be retried or entered manually. Worker crashes recover queued work on restart. A process has a 180-second deadline. Deletion cascades to both description fields and their FTS rows.

## Limits

This is a captioning trial, not reliable scene-graph extraction. Small objects can be missed at 512 pixels; captions may hallucinate or omit details. A one-sentence summary often avoids a tiny person on a screen, but that behavior is not guaranteed. To enforce the distinction for a particular photo, correct the main scene and put depicted content in its own field. Literal caption search can miss paraphrases; visual mode remains available for exploratory searches.

Producer identity, status and manual corrections are stored independently of the CLIP embedding space. A future captioner should reuse the description contract and verified artifact installer. Automatic regeneration for a different caption model requires an explicit migration policy that preserves manual edits. Do not silently reuse old captions as if a new model generated them.

## Validation

Native tests cover migration, restart, manual edit precedence, FTS deletion, literal query handling, physical-person versus depicted-person search, and rejection of unfinished output. Browser checks use real image inference and exercise editing/search/authentication/persistence in a disposable library. Linux tests enforce a 1 GiB cgroup limit and record peak memory. See `VALIDATION.md` for measured results.
