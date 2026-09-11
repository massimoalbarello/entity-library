# Nibrun deployment

Deployed 11 September 2026: https://entity-library-gf84pk.nibrun.app

App slug: `entity-library-gf84pk`. Redeploy this same app to preserve its hostname, passkeys,
photos and downloaded models. The local `.nibrun.json` records that target and is ignored by Git.

The deployed executable is the tested Linux build, SHA-256
`b7782b751a61082106d845d1ce13d3287a1d2dd51b2b8cbc1129b220a734b879`.
Deployment ID: `01a090c6-e1a8-71f7-ac65-1201642a0f15`.

HTTPS `/health` returned 200 and unauthenticated `/api/photos` returned 401 after the
similarity-cutoff update. The owner registered their passkey and added 19 public sample photos
before this update. Destructive and ownership tests run only on disposable local instances.

Nibrun now reports **1 GiB RAM**, resolving the initial 256 MiB allocation mismatch. The
updated executable passed the Linux browser suite at 1 CPU / 1 GiB, with a 453.6 MiB cgroup
peak including charged file cache and the local x86 emulation overhead.

To redeploy a newly built and tested Linux executable:

```sh
nib --json run ./apps/backend/dist/entity-library --app entity-library-gf84pk --port 3000
nib --json apps status --app entity-library-gf84pk
```

Do not use `--name` for an update: it creates another app.
