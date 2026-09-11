# Nibrun deployment

Deployed 11 September 2026: https://entity-library-gf84pk.nibrun.app

App slug: `entity-library-gf84pk`. Redeploy this same app to preserve its hostname, passkeys,
photos and downloaded models. The local `.nibrun.json` records that target and is ignored by Git.

The deployed executable is the tested Linux build, SHA-256
`5e79225c1ef3f50210733191a14bd2df9bdc879c219148ae81700f596c885fbd`.
Deployment ID: `01a09146-6ee2-77be-99a4-d81d04af7477`.

The executable was downloaded from the successful [checked build](https://github.com/massimoalbarello/entity-library/actions/runs/34621071034)
for source commit `46d056ed496e127e615a02517e0dfd7a535afffc`, verified against the workflow's
SHA256SUMS, and then uploaded to the existing app. The served JavaScript matches the checked
source byte for byte. Every search combines BM25 description matches and thresholded
visual matches with reciprocal rank fusion, with no mode selector. The single description
field and monochrome palette are retained. The suggested-query row and its event handlers/styles are removed. Desktop and mobile
previews were checked; live JavaScript and CSS match checked source. The description form
now has a measured 16px field-to-action gap, 12px between action buttons, and hidden empty
status text. Desktop and mobile dialog previews were checked.

HTTPS `/health` returned 200 and unauthenticated `/api/search?q=cat` returned 401. This update
adjusts description-form spacing without changing retrieval, model identities, vectors or description
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
