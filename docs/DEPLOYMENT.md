# Nibrun deployment

Deployed 11 September 2026: https://entity-library-gf84pk.nibrun.app

App slug: `entity-library-gf84pk`. Redeploy this same app to preserve its hostname, passkeys,
photos and downloaded models. The local `.nibrun.json` records that target and is ignored by Git.

The deployed executable is the tested Linux build, SHA-256
`d451c5895a4b0bf61975d8338e6cf2e52c7db67d47fe2ac38349aa91d5e309a9`.
Deployment ID: `01a09140-6276-79aa-9501-4eff200230f4`.

The executable was downloaded from the successful [checked build](https://github.com/massimoalbarello/entity-library/actions/runs/34620407363)
for source commit `248d2c8243f18f8295e85c37eecfacbb99075f4d`, verified against the workflow's
SHA256SUMS, and then uploaded to the existing app. The served JavaScript matches the checked
source byte for byte. Every search combines BM25 description matches and thresholded
visual matches with reciprocal rank fusion, with no mode selector. The single description
field and monochrome palette are retained. The suggested-query row and its event handlers/styles are removed. Desktop and mobile
previews were checked; live JavaScript and CSS match checked source.

HTTPS `/health` returned 200 and unauthenticated `/api/search?q=cat` returned 401. This update
removes suggested-query chips without changing retrieval, model identities, vectors or description
schema. The preceding single-description migration verified preservation of 20 original
photos and 100 embeddings. No reindex or caption regeneration is requested by this update.

Nibrun reports **1 GiB RAM** and one vCPU. The complete local Linux browser suite peaked at
**953.6 MiB**, including charged file cache and local x86 emulation overhead. The cloud workflow
also passed all browser checks with a 1 GiB cgroup limit and zero OOM kills. Its lower memory
counter is not used as a native total-RAM estimate because host-populated shared file cache may
be charged outside that container. Destructive and ownership tests run only in disposable instances.

To redeploy a newly built and tested Linux executable:

```sh
nib --json run ./apps/backend/dist/entity-library --app entity-library-gf84pk --port 3000
nib --json apps status --app entity-library-gf84pk
```

Do not use `--name` for an update: it creates another app.
