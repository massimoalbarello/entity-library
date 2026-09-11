# Nibrun deployment

Deployed 11 September 2026: https://entity-library-gf84pk.nibrun.app

App slug: `entity-library-gf84pk`. Redeploy this same app to preserve its hostname, passkeys,
photos and downloaded models. The local `.nibrun.json` records that target and is ignored by Git.

The deployed executable is the tested Linux build, SHA-256
`70d9eec0558582291a757d4fe596591554fb850f84df45f63664d4ab2d9c1303`.
Deployment ID: `01a0911c-ba45-740e-b916-bcda4b9ad138`.

The executable was downloaded from the successful [checked build](https://github.com/massimoalbarello/entity-library/actions/runs/34616629926)
for source commit `878dfaee7990026c354f24adbc11990996feb5c1`, verified against the workflow's
SHA256SUMS, and then uploaded to the existing app. The live stylesheet matches the checked
source byte for byte and uses Face Library’s black, white and neutral-gray palette; photos
retain their original colors. Desktop, mobile, sign-in and caption-editor previews were checked.
Both pinned caption-model artifacts were installed during the preceding caption deployment.

HTTPS `/health` returned 200 and unauthenticated `/api/photos` returned 401. The served UI
contains the scene-description search modes and caption editor. Before/after snapshots from
the preceding caption deployment confirmed all **19 original photo files**, all photo/view records, and all **95
embedding records** were unchanged. At the verification snapshot, four descriptions were ready,
one was processing, fourteen were queued, and none had failed. Backfill continues in the app.
Live examples included a cat on a leather couch, a dog holding a frisbee, and two people riding horses.

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
